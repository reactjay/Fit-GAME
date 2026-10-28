-- JustUs — complete schema and row-level security.
-- Every table is scoped to a private "world" that holds at most two members.
-- Clients never write membership directly: worlds are created and joined only
-- through the security-definer functions below, which check auth.uid().


-- ───────────────────────────── profiles ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Love' check (char_length(display_name) between 1 and 40),
  avatar jsonb not null default '{"skin":2,"hair":0,"hairColor":0,"outfit":0,"accessory":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sound_enabled boolean not null default true,
  notify_messages boolean not null default true,
  notify_calls boolean not null default true,
  theme text not null default 'midnight' check (theme in ('midnight', 'rose', 'dawn')),
  reduced_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Profile + preferences are created automatically for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 40), ''), 'Love'))
  on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── worlds ─────────────────────────────
create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our World' check (char_length(name) between 1 and 60),
  relationship_start date,
  created_by uuid not null references auth.users (id),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table public.world_members (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'partner')),
  joined_at timestamptz not null default now(),
  primary key (world_id, user_id),
  unique (user_id) -- one world per account
);

-- Hard cap: a world can never hold more than two members, even if a future
-- code path forgets to check. Locks the world row to serialise concurrent joins.
create or replace function public.enforce_two_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.worlds where id = new.world_id for update;
  if (select count(*) from public.world_members where world_id = new.world_id) >= 2 then
    raise exception 'world is full' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger world_members_cap before insert on public.world_members
  for each row execute function public.enforce_two_members();

-- Membership helpers (security definer so policies don't recurse through RLS).
create or replace function public.is_world_member(p_world uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.world_members where world_id = p_world and user_id = auth.uid());
$$;

create or replace function public.my_world_id() returns uuid
language sql stable security definer set search_path = public as $$
  select world_id from public.world_members where user_id = auth.uid();
$$;

create or replace function public.shares_world_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.world_members a join public.world_members b on a.world_id = b.world_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ───────────────────────────── invitations ─────────────────────────────
-- Only a SHA-256 hash of the token is stored; the raw token exists once, in the link.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── activity timeline ─────────────────────────────
create table public.activity (
  id bigint generated always as identity primary key,
  world_id uuid not null references public.worlds (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_world_idx on public.activity (world_id, created_at desc);

create or replace function public.log_activity(p_world uuid, p_kind text, p_summary text) returns void
language sql security definer set search_path = public as $$
  insert into public.activity (world_id, actor_id, kind, summary) values (p_world, auth.uid(), p_kind, left(p_summary, 200));
$$;
revoke execute on function public.log_activity(uuid, text, text) from public, anon, authenticated;

-- ───────────────────────────── messaging ─────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null unique, -- idempotency key from the sender's device
  kind text not null default 'text' check (kind in ('text', 'image', 'voice', 'gift', 'call')),
  body text check (char_length(body) <= 4000),
  reply_to uuid references public.messages (id) on delete set null,
  media_path text,
  media_meta jsonb not null default '{}'::jsonb,
  reactions jsonb not null default '{}'::jsonb,
  starred_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index messages_world_created_idx on public.messages (world_id, created_at desc);

create table public.message_reads (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

-- Media attachments registry (chat images, voice notes, vault items).
create table public.media (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  path text not null unique,
  kind text not null check (kind in ('image', 'voice')),
  mime text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer,
  height integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index media_world_idx on public.media (world_id, created_at desc);

-- Atomic reaction toggle so two simultaneous reactions never overwrite each other.
create or replace function public.toggle_reaction(p_message uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid;
  v_list jsonb;
  v_result jsonb;
  v_uid text := auth.uid()::text;
begin
  if char_length(p_emoji) > 16 then raise exception 'invalid emoji'; end if;
  select world_id, coalesce(reactions -> p_emoji, '[]'::jsonb) into v_world, v_list
    from public.messages where id = p_message for update;
  if v_world is null or not public.is_world_member(v_world) then raise exception 'not allowed'; end if;
  if v_list ? v_uid then
    v_list := v_list - v_uid;
  else
    v_list := v_list || to_jsonb(v_uid);
  end if;
  update public.messages
     set reactions = case when jsonb_array_length(v_list) = 0 then reactions - p_emoji
                          else jsonb_set(reactions, array[p_emoji], v_list) end
   where id = p_message
  returning reactions into v_result;
  return v_result;
end $$;

create or replace function public.toggle_star(p_message uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v_world uuid; v_result uuid[];
begin
  select world_id into v_world from public.messages where id = p_message for update;
  if v_world is null or not public.is_world_member(v_world) then raise exception 'not allowed'; end if;
  update public.messages
     set starred_by = case when auth.uid() = any(starred_by) then array_remove(starred_by, auth.uid())
                           else array_append(starred_by, auth.uid()) end
   where id = p_message returning starred_by into v_result;
  return v_result;
end $$;

-- ───────────────────────────── calls ─────────────────────────────
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  caller_id uuid not null references auth.users (id) on delete cascade,
  callee_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'missed', 'declined', 'failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index calls_world_idx on public.calls (world_id, created_at desc);

-- Status transitions are validated server-side: no resurrecting finished calls.
create or replace function public.update_call(p_call uuid, p_status text) returns public.calls
language plpgsql security definer set search_path = public as $$
declare c public.calls;
begin
  select * into c from public.calls where id = p_call for update;
  if c.id is null or auth.uid() not in (c.caller_id, c.callee_id) then raise exception 'not allowed'; end if;
  if c.status in ('ended', 'missed', 'declined', 'failed') then return c; end if;
  if p_status = 'active' and c.status = 'ringing' then
    update public.calls set status = 'active', answered_at = now() where id = p_call returning * into c;
  elsif p_status in ('ended', 'missed', 'declined', 'failed') then
    update public.calls set status = case when p_status = 'ended' and c.status = 'ringing' then 'missed' else p_status end,
                            ended_at = now()
     where id = p_call returning * into c;
    if c.status = 'ended' and c.answered_at is not null then
      perform public.log_activity(c.world_id, 'call', format('had a %s call for %s min', c.kind,
        greatest(1, round(extract(epoch from (c.ended_at - c.answered_at)) / 60))));
    end if;
  end if;
  return c;
end $$;

-- ───────────────────────────── stories ─────────────────────────────
create table public.story_sessions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  story_id text not null,
  node_id text not null,
  history jsonb not null default '[]'::jsonb, -- [{node, choice, by}]
  votes jsonb not null default '{}'::jsonb,   -- {userId: choiceIndex} for the current node
  mode text not null default 'together' check (mode in ('together', 'solo')),
  endings_seen text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (world_id, story_id)
);

create or replace function public.story_start(p_story text, p_start text) returns public.story_sessions
language plpgsql security definer set search_path = public as $$
declare v_world uuid := public.my_world_id(); s public.story_sessions;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  insert into public.story_sessions (world_id, story_id, node_id) values (v_world, p_story, p_start)
  on conflict (world_id, story_id) do update set updated_at = now()
  returning * into s;
  return s;
end $$;

create or replace function public.story_vote(p_session uuid, p_node text, p_choice int) returns public.story_sessions
language plpgsql security definer set search_path = public as $$
declare s public.story_sessions;
begin
  select * into s from public.story_sessions where id = p_session for update;
  if s.id is null or not public.is_world_member(s.world_id) then raise exception 'not allowed'; end if;
  if s.node_id <> p_node then return s; end if; -- stale vote from an old page
  update public.story_sessions set votes = votes || jsonb_build_object(auth.uid()::text, p_choice), updated_at = now()
   where id = p_session returning * into s;
  return s;
end $$;

-- Advances only if the session is still on p_from (optimistic concurrency), so
-- both partners resolving the same vote at once advance it exactly once.
create or replace function public.story_advance(p_session uuid, p_from text, p_to text, p_choice int, p_ending text default null)
returns public.story_sessions
language plpgsql security definer set search_path = public as $$
declare s public.story_sessions;
begin
  select * into s from public.story_sessions where id = p_session for update;
  if s.id is null or not public.is_world_member(s.world_id) then raise exception 'not allowed'; end if;
  if s.node_id <> p_from then return s; end if;
  update public.story_sessions
     set node_id = p_to,
         history = history || jsonb_build_array(jsonb_build_object('node', p_from, 'choice', p_choice, 'by', auth.uid())),
         votes = '{}'::jsonb,
         endings_seen = case when p_ending is not null and not (p_ending = any(endings_seen)) then array_append(endings_seen, p_ending) else endings_seen end,
         updated_at = now()
   where id = p_session returning * into s;
  if p_ending is not null then
    perform public.log_activity(s.world_id, 'story', format('reached an ending in a story: %s', p_ending));
  end if;
  return s;
end $$;

create or replace function public.story_reset(p_session uuid, p_start text, p_mode text) returns public.story_sessions
language plpgsql security definer set search_path = public as $$
declare s public.story_sessions;
begin
  select * into s from public.story_sessions where id = p_session for update;
  if s.id is null or not public.is_world_member(s.world_id) then raise exception 'not allowed'; end if;
  update public.story_sessions set node_id = p_start, history = '[]', votes = '{}',
         mode = coalesce(p_mode, mode), updated_at = now()
   where id = p_session returning * into s;
  return s;
end $$;

create or replace function public.story_set_mode(p_session uuid, p_mode text) returns public.story_sessions
language plpgsql security definer set search_path = public as $$
declare s public.story_sessions;
begin
  update public.story_sessions set mode = p_mode, votes = '{}', updated_at = now()
   where id = p_session and public.is_world_member(world_id) returning * into s;
  if s.id is null then raise exception 'not allowed'; end if;
  return s;
end $$;

-- ───────────────────────────── memory vault ─────────────────────────────
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'letter', 'voice', 'milestone', 'open_when', 'capsule')),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 10000),
  media_path text,
  occurred_on date,
  unlock_at timestamptz,
  mood text check (char_length(mood) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_world_idx on public.memories (world_id, created_at desc);

-- Sealed capsules: the partner may see that one exists, but not its contents.
create or replace function public.sealed_capsules() returns table (id uuid, title text, unlock_at timestamptz, author_id uuid)
language sql stable security definer set search_path = public as $$
  select m.id, m.title, m.unlock_at, m.author_id from public.memories m
   where m.world_id = public.my_world_id() and m.unlock_at > now() and m.author_id <> auth.uid();
$$;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_date date not null,
  yearly boolean not null default false,
  emoji text not null default '💜' check (char_length(emoji) <= 16),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table public.music_links (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  title text not null check (char_length(title) between 1 and 120),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

-- ───────────────────────────── games ─────────────────────────────
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  game text not null check (game in ('trivia', 'wyr', 'cards')),
  round integer not null default 1,
  prompt_id text not null,
  subject_id uuid references auth.users (id), -- trivia: who the question is about
  state text not null default 'answering' check (state in ('answering', 'revealed')),
  answered uuid[] not null default '{}',
  scores jsonb not null default '{}'::jsonb,
  judged_round integer not null default 0,
  used_prompts text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (world_id, game)
);

create table public.game_answers (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  round integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id, round, user_id) -- duplicate submissions are no-ops
);

create or replace function public.add_points(p_world uuid, p_points int) returns void
language sql security definer set search_path = public as $$
  update public.worlds set points = points + greatest(p_points, 0) where id = p_world;
$$;
revoke execute on function public.add_points(uuid, int) from public, anon, authenticated;

create or replace function public.game_start(p_game text, p_prompt text, p_subject uuid default null) returns public.game_sessions
language plpgsql security definer set search_path = public as $$
declare v_world uuid := public.my_world_id(); g public.game_sessions;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  if p_subject is not null and not public.shares_world_with(p_subject) then raise exception 'invalid subject'; end if;
  insert into public.game_sessions (world_id, game, prompt_id, subject_id, used_prompts)
  values (v_world, p_game, p_prompt, p_subject, array[p_prompt])
  on conflict (world_id, game) do update set updated_at = public.game_sessions.updated_at
  returning * into g;
  return g;
end $$;

create or replace function public.game_submit(p_session uuid, p_round int, p_answer jsonb) returns public.game_sessions
language plpgsql security definer set search_path = public as $$
declare g public.game_sessions; a jsonb; b jsonb;
begin
  select * into g from public.game_sessions where id = p_session for update;
  if g.id is null or not public.is_world_member(g.world_id) then raise exception 'not allowed'; end if;
  if g.round <> p_round or g.state <> 'answering' then return g; end if;
  if octet_length(p_answer::text) > 2000 then raise exception 'answer too long'; end if;
  insert into public.game_answers (session_id, round, user_id, answer) values (p_session, p_round, auth.uid(), p_answer)
  on conflict do nothing;
  update public.game_sessions set answered = (select array_agg(distinct u) from unnest(array_append(answered, auth.uid())) u),
         updated_at = now()
   where id = p_session returning * into g;
  if cardinality(g.answered) >= 2 then
    if g.game = 'wyr' then
      select answer into a from public.game_answers where session_id = p_session and round = p_round order by user_id limit 1;
      select answer into b from public.game_answers where session_id = p_session and round = p_round order by user_id desc limit 1;
      if a -> 'choice' = b -> 'choice' then
        g.scores := jsonb_set(g.scores, '{matches}', to_jsonb(coalesce((g.scores ->> 'matches')::int, 0) + 1));
        perform public.add_points(g.world_id, 2);
      end if;
      g.scores := jsonb_set(g.scores, '{played}', to_jsonb(coalesce((g.scores ->> 'played')::int, 0) + 1));
    end if;
    update public.game_sessions set state = 'revealed', scores = g.scores where id = p_session returning * into g;
  end if;
  return g;
end $$;

-- Trivia: the person the question is about decides whether the guess was right.
create or replace function public.game_judge(p_session uuid, p_round int, p_correct boolean) returns public.game_sessions
language plpgsql security definer set search_path = public as $$
declare g public.game_sessions; v_guesser text;
begin
  select * into g from public.game_sessions where id = p_session for update;
  if g.id is null or not public.is_world_member(g.world_id) then raise exception 'not allowed'; end if;
  if g.game <> 'trivia' or g.subject_id <> auth.uid() or g.round <> p_round or g.state <> 'revealed' or g.judged_round >= p_round then
    return g;
  end if;
  select user_id::text into v_guesser from public.world_members where world_id = g.world_id and user_id <> auth.uid();
  if p_correct then
    g.scores := jsonb_set(g.scores, array[v_guesser], to_jsonb(coalesce((g.scores ->> v_guesser)::int, 0) + 1));
    perform public.add_points(g.world_id, 3);
  end if;
  update public.game_sessions set judged_round = p_round, scores = g.scores, updated_at = now()
   where id = p_session returning * into g;
  return g;
end $$;

-- Moves to the next prompt (also used to skip). Only advances from p_round, so
-- double taps or both partners pressing "next" at once advance exactly once.
create or replace function public.game_next(p_session uuid, p_round int, p_prompt text, p_subject uuid default null)
returns public.game_sessions
language plpgsql security definer set search_path = public as $$
declare g public.game_sessions;
begin
  select * into g from public.game_sessions where id = p_session for update;
  if g.id is null or not public.is_world_member(g.world_id) then raise exception 'not allowed'; end if;
  if g.round <> p_round then return g; end if;
  if p_subject is not null and not public.shares_world_with(p_subject) then raise exception 'invalid subject'; end if;
  update public.game_sessions
     set round = round + 1, prompt_id = p_prompt, subject_id = coalesce(p_subject, subject_id),
         state = 'answering', answered = '{}', updated_at = now(),
         used_prompts = (array_append(used_prompts, p_prompt))[greatest(1, cardinality(used_prompts) - 200):]
   where id = p_session returning * into g;
  return g;
end $$;

-- ───────────────────────────── daily question & love quest ─────────────────────────────
create table public.daily_entries (
  world_id uuid not null references public.worlds (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('question', 'quest')),
  user_id uuid not null references auth.users (id) on delete cascade,
  answer text not null check (char_length(answer) <= 1000),
  created_at timestamptz not null default now(),
  primary key (world_id, day, kind, user_id)
);

create table public.daily_rewards (
  world_id uuid not null references public.worlds (id) on delete cascade,
  day date not null,
  kind text not null,
  points integer not null,
  rewarded_at timestamptz not null default now(),
  primary key (world_id, day, kind) -- a day's reward can only ever be granted once
);

-- p_day is the user's local date; accepted only within a day of server UTC to allow time zones.
create or replace function public.submit_daily(p_kind text, p_day date, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_world uuid := public.my_world_id(); v_count int; v_points int; v_rewarded boolean := false;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  if abs(p_day - (now() at time zone 'utc')::date) > 1 then raise exception 'invalid day'; end if;
  insert into public.daily_entries (world_id, day, kind, user_id, answer)
  values (v_world, p_day, p_kind, auth.uid(), left(p_answer, 1000)) on conflict do nothing;
  select count(*) into v_count from public.daily_entries where world_id = v_world and day = p_day and kind = p_kind;
  if v_count >= 2 then
    v_points := case when p_kind = 'quest' then 10 else 3 end;
    insert into public.daily_rewards (world_id, day, kind, points) values (v_world, p_day, p_kind, v_points)
    on conflict do nothing;
    if found then
      perform public.add_points(v_world, v_points);
      perform public.log_activity(v_world, p_kind, case when p_kind = 'quest' then 'completed the Daily Love Quest together' else 'answered the daily question together' end);
      v_rewarded := true;
    end if;
  end if;
  return jsonb_build_object('both', v_count >= 2, 'rewarded', v_rewarded);
end $$;

-- ───────────────────────────── home: rewards & room ─────────────────────────────
create table public.decor_items (
  id text primary key,
  name text not null,
  emoji text not null,
  cost integer not null check (cost >= 0)
);

insert into public.decor_items (id, name, emoji, cost) values
  ('plant', 'Snake plant', '🪴', 0),
  ('candle', 'Vanilla candle', '🕯️', 0),
  ('books', 'Stack of books', '📚', 10),
  ('guitar', 'Old guitar', '🎸', 20),
  ('cat', 'Sleepy cat', '🐈', 30),
  ('lamp', 'Paper lantern', '🏮', 15),
  ('roses', 'Vase of roses', '🌹', 25),
  ('record', 'Record player', '📻', 40),
  ('telescope', 'Telescope', '🔭', 60),
  ('fairy', 'Fairy lights', '✨', 35),
  ('cake', 'Anniversary cake', '🎂', 50),
  ('globe', 'Travel globe', '🌍', 45);

create table public.world_rewards (
  world_id uuid not null references public.worlds (id) on delete cascade,
  item_id text not null references public.decor_items (id),
  unlocked_by uuid references auth.users (id),
  unlocked_at timestamptz not null default now(),
  primary key (world_id, item_id)
);

create or replace function public.unlock_decor(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_world uuid := public.my_world_id(); v_cost int; v_points int; v_name text;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  select cost, name into v_cost, v_name from public.decor_items where id = p_item;
  if v_cost is null then raise exception 'unknown item'; end if;
  select points into v_points from public.worlds where id = v_world for update;
  if exists (select 1 from public.world_rewards where world_id = v_world and item_id = p_item) then
    return jsonb_build_object('ok', true, 'points', v_points);
  end if;
  if v_points < v_cost then return jsonb_build_object('ok', false, 'points', v_points); end if;
  update public.worlds set points = points - v_cost where id = v_world returning points into v_points;
  insert into public.world_rewards (world_id, item_id, unlocked_by) values (v_world, p_item, auth.uid());
  perform public.log_activity(v_world, 'decor', format('unlocked %s for the home', v_name));
  return jsonb_build_object('ok', true, 'points', v_points);
end $$;

create table public.room_state (
  world_id uuid primary key references public.worlds (id) on delete cascade,
  wallpaper text not null default 'plum',
  ambience text not null default 'stars',
  placed jsonb not null default '[]'::jsonb,       -- [{slot, item}]
  photo_paths text[] not null default '{}',
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

-- City: places each partner has visited (positions themselves are ephemeral broadcasts).
create table public.city_visits (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  visited_at timestamptz not null default now(),
  primary key (world_id, user_id, place_id)
);

-- ───────────────────────────── world lifecycle ─────────────────────────────
create or replace function public.create_world(p_name text, p_start date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_world uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.world_members where user_id = auth.uid()) then raise exception 'already in a world'; end if;
  insert into public.worlds (name, relationship_start, created_by) values (coalesce(nullif(trim(p_name), ''), 'Our World'), p_start, auth.uid())
  returning id into v_world;
  insert into public.world_members (world_id, user_id, role) values (v_world, auth.uid(), 'creator');
  insert into public.room_state (world_id) values (v_world);
  insert into public.world_rewards (world_id, item_id) select v_world, id from public.decor_items where cost = 0;
  perform public.log_activity(v_world, 'world', 'created this little world');
  return v_world;
end $$;

-- Creator mints a fresh invite; any earlier unused invites are revoked.
create or replace function public.create_invitation() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_world uuid; v_token text;
begin
  select world_id into v_world from public.world_members where user_id = auth.uid() and role = 'creator';
  if v_world is null then raise exception 'only the creator can invite'; end if;
  if (select count(*) from public.world_members where world_id = v_world) >= 2 then raise exception 'world is full'; end if;
  update public.invitations set revoked_at = now() where world_id = v_world and accepted_at is null and revoked_at is null;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.invitations (world_id, token_hash, created_by)
  values (v_world, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.revoke_invitations() returns void
language sql security definer set search_path = public as $$
  update public.invitations set revoked_at = now()
   where world_id = (select world_id from public.world_members where user_id = auth.uid() and role = 'creator')
     and accepted_at is null and revoked_at is null;
$$;

-- Public preview of an invite (world name + inviter) — reveals nothing without the token.
create or replace function public.invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare i public.invitations; v_name text; v_inviter text;
begin
  select * into i from public.invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if i.id is null or i.revoked_at is not null or i.accepted_at is not null or i.expires_at < now() then
    return jsonb_build_object('valid', false);
  end if;
  select w.name, p.display_name into v_name, v_inviter from public.worlds w join public.profiles p on p.id = i.created_by where w.id = i.world_id;
  return jsonb_build_object('valid', true, 'world', v_name, 'inviter', v_inviter);
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare i public.invitations;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from public.invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if i.id is null or i.revoked_at is not null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'invitation is invalid or expired';
  end if;
  if exists (select 1 from public.world_members where user_id = auth.uid()) then raise exception 'already in a world'; end if;
  insert into public.world_members (world_id, user_id, role) values (i.world_id, auth.uid(), 'partner'); -- cap trigger guards size
  update public.invitations set accepted_by = auth.uid(), accepted_at = now() where id = i.id;
  update public.invitations set revoked_at = now() where world_id = i.world_id and accepted_at is null and revoked_at is null;
  perform public.log_activity(i.world_id, 'world', 'moved into this little world 💞');
  return i.world_id;
end $$;

-- ───────────────────────────── activity triggers ─────────────────────────────
create or replace function public.activity_from_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'memories' then
    perform public.log_activity(new.world_id, 'memory', case new.kind
      when 'letter' then 'wrote a love letter' when 'photo' then 'saved a photo memory'
      when 'voice' then 'saved a voice memory' when 'capsule' then 'sealed a time capsule'
      when 'open_when' then 'left an “Open when…” note' else 'added a milestone' end);
  elsif tg_table_name = 'calendar_events' then
    perform public.log_activity(new.world_id, 'calendar', 'added a date to the love calendar');
  elsif tg_table_name = 'music_links' then
    perform public.log_activity(new.world_id, 'music', 'shared a song: ' || new.title);
  end if;
  return new;
end $$;

create trigger memories_activity after insert on public.memories for each row execute function public.activity_from_row();
create trigger calendar_activity after insert on public.calendar_events for each row execute function public.activity_from_row();
create trigger music_activity after insert on public.music_links for each row execute function public.activity_from_row();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger memories_touch before update on public.memories for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ───────────────────────────── row level security ─────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.worlds enable row level security;
alter table public.world_members enable row level security;
alter table public.invitations enable row level security;
alter table public.activity enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.media enable row level security;
alter table public.calls enable row level security;
alter table public.story_sessions enable row level security;
alter table public.memories enable row level security;
alter table public.calendar_events enable row level security;
alter table public.music_links enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_answers enable row level security;
alter table public.daily_entries enable row level security;
alter table public.daily_rewards enable row level security;
alter table public.decor_items enable row level security;
alter table public.world_rewards enable row level security;
alter table public.room_state enable row level security;
alter table public.city_visits enable row level security;

-- Profiles: yourself and your partner only.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_world_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy prefs_all on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Worlds: members read; members may rename / set the date, never touch points.
create policy worlds_select on public.worlds for select to authenticated using (public.is_world_member(id));
create policy worlds_update on public.worlds for update to authenticated
  using (public.is_world_member(id)) with check (public.is_world_member(id));
revoke update on public.worlds from authenticated;
grant update (name, relationship_start) on public.worlds to authenticated;

create policy members_select on public.world_members for select to authenticated using (public.is_world_member(world_id));
-- (no insert/update/delete policies: membership changes only through functions)

create policy invitations_select on public.invitations for select to authenticated
  using (created_by = auth.uid());

create policy activity_select on public.activity for select to authenticated using (public.is_world_member(world_id));

-- Messages
create policy messages_select on public.messages for select to authenticated using (public.is_world_member(world_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_world_member(world_id)
              and (media_path is null or split_part(media_path, '/', 1) = world_id::text));
create policy messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (deleted_at, body) on public.messages to authenticated;

create policy reads_select on public.message_reads for select to authenticated using (public.is_world_member(world_id));
create policy reads_upsert on public.message_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_world_member(world_id));
create policy reads_update on public.message_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_world_member(world_id));

create policy media_select on public.media for select to authenticated using (public.is_world_member(world_id));
create policy media_insert on public.media for insert to authenticated
  with check (uploader_id = auth.uid() and public.is_world_member(world_id) and split_part(path, '/', 1) = world_id::text);
create policy media_delete on public.media for delete to authenticated using (uploader_id = auth.uid());

-- Calls: inserts by the caller to their partner; status via update_call().
create policy calls_select on public.calls for select to authenticated using (public.is_world_member(world_id));
create policy calls_insert on public.calls for insert to authenticated
  with check (caller_id = auth.uid() and public.is_world_member(world_id) and public.shares_world_with(callee_id)
              and callee_id <> auth.uid() and status = 'ringing');

create policy stories_select on public.story_sessions for select to authenticated using (public.is_world_member(world_id));

-- Memories: unlocked or own; author edits/deletes their own.
create policy memories_select on public.memories for select to authenticated
  using (public.is_world_member(world_id) and (author_id = auth.uid() or unlock_at is null or unlock_at <= now()));
create policy memories_insert on public.memories for insert to authenticated
  with check (author_id = auth.uid() and public.is_world_member(world_id)
              and (media_path is null or split_part(media_path, '/', 1) = world_id::text));
create policy memories_update on public.memories for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_world_member(world_id));
create policy memories_delete on public.memories for delete to authenticated using (author_id = auth.uid());

create policy calendar_select on public.calendar_events for select to authenticated using (public.is_world_member(world_id));
create policy calendar_insert on public.calendar_events for insert to authenticated
  with check (author_id = auth.uid() and public.is_world_member(world_id));
create policy calendar_update on public.calendar_events for update to authenticated
  using (public.is_world_member(world_id)) with check (public.is_world_member(world_id));
create policy calendar_delete on public.calendar_events for delete to authenticated using (public.is_world_member(world_id));

create policy music_select on public.music_links for select to authenticated using (public.is_world_member(world_id));
create policy music_insert on public.music_links for insert to authenticated
  with check (author_id = auth.uid() and public.is_world_member(world_id));
create policy music_delete on public.music_links for delete to authenticated using (author_id = auth.uid());

create policy games_select on public.game_sessions for select to authenticated using (public.is_world_member(world_id));
-- Answers stay hidden from the partner until you have answered the same round yourself.
create or replace function public.has_answered(p_session uuid, p_round int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_answers where session_id = p_session and round = p_round and user_id = auth.uid());
$$;
create or replace function public.has_daily_entry(p_world uuid, p_day date, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.daily_entries where world_id = p_world and day = p_day and kind = p_kind and user_id = auth.uid());
$$;
create policy answers_select on public.game_answers for select to authenticated using (
  user_id = auth.uid() or public.has_answered(session_id, round));

create policy daily_select on public.daily_entries for select to authenticated using (
  public.is_world_member(world_id) and (user_id = auth.uid() or public.has_daily_entry(world_id, day, kind)));
create policy daily_rewards_select on public.daily_rewards for select to authenticated using (public.is_world_member(world_id));

create policy decor_select on public.decor_items for select to authenticated using (true);
create policy rewards_select on public.world_rewards for select to authenticated using (public.is_world_member(world_id));

create policy room_select on public.room_state for select to authenticated using (public.is_world_member(world_id));
create policy room_update on public.room_state for update to authenticated
  using (public.is_world_member(world_id)) with check (public.is_world_member(world_id) and updated_by = auth.uid());

create policy visits_select on public.city_visits for select to authenticated using (public.is_world_member(world_id));
create policy visits_insert on public.city_visits for insert to authenticated
  with check (user_id = auth.uid() and public.is_world_member(world_id));

-- Placed decor must be unlocked: validated on write.
create or replace function public.validate_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.placed) e
     where not exists (select 1 from public.world_rewards r where r.world_id = new.world_id and r.item_id = e ->> 'item')
  ) then raise exception 'decor not unlocked'; end if;
  if jsonb_array_length(new.placed) > 12 or cardinality(new.photo_paths) > 6 then raise exception 'too many items'; end if;
  if exists (select 1 from unnest(new.photo_paths) p where split_part(p, '/', 1) <> new.world_id::text) then
    raise exception 'invalid photo';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger room_validate before update on public.room_state for each row execute function public.validate_room();

-- Lock down function execution: only the intended RPCs are callable by signed-in users.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_world_member(uuid), public.my_world_id(), public.shares_world_with(uuid),
  public.has_answered(uuid, int), public.has_daily_entry(uuid, date, text),
  public.toggle_reaction(uuid, text), public.toggle_star(uuid), public.update_call(uuid, text),
  public.story_start(text, text), public.story_vote(uuid, text, int), public.story_advance(uuid, text, text, int, text),
  public.story_reset(uuid, text, text), public.story_set_mode(uuid, text), public.sealed_capsules(),
  public.game_start(text, text, uuid), public.game_submit(uuid, int, jsonb), public.game_judge(uuid, int, boolean),
  public.game_next(uuid, int, text, uuid), public.submit_daily(text, date, text), public.unlock_decor(text),
  public.create_world(text, date), public.create_invitation(), public.revoke_invitations(),
  public.invitation_preview(text), public.accept_invitation(text)
to authenticated;
revoke execute on function public.log_activity(uuid, text, text), public.add_points(uuid, int) from authenticated;
