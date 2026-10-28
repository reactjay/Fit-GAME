-- The 3D home (furniture you can buy and place), daily streaks and hidden love notes.

-- ── furniture for the 3D house (same shop + points as the small decor) ──
insert into public.decor_items (id, name, emoji, cost) values
  ('sofa_green', 'Emerald sectional sofa', '🛋️', 60),
  ('rug_round', 'Ankara round rug', '🟣', 20),
  ('piano', 'Grand piano', '🎹', 120),
  ('tv', 'Big-screen TV', '📺', 80),
  ('bed_round', 'Round dream bed', '🛏️', 100),
  ('armchair', 'Cosy armchair', '🪑', 30),
  ('bookshelf', 'Bookshelf', '📚', 35),
  ('aquarium', 'Aquarium', '🐠', 70),
  ('floor_lamp', 'Arc floor lamp', '💡', 25),
  ('palm', 'Indoor palm', '🌴', 15),
  ('dining', 'Dinner table for two', '🍽️', 45),
  ('bathtub', 'Bubble bathtub', '🛁', 90),
  ('beanbag', 'Beanbag pair', '🫘', 25),
  ('art', 'Wall art', '🖼️', 20)
on conflict (id) do nothing;

-- A whole house holds more than the old 12 decor spots.
create or replace function public.validate_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.placed) e
     where not exists (select 1 from public.world_rewards r where r.world_id = new.world_id and r.item_id = e ->> 'item')
  ) then raise exception 'decor not unlocked'; end if;
  if jsonb_array_length(new.placed) > 40 or cardinality(new.photo_paths) > 6 then raise exception 'too many items'; end if;
  if exists (select 1 from unnest(new.photo_paths) p where split_part(p, '/', 1) <> new.world_id::text) then
    raise exception 'invalid photo';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ── daily streak: a day counts when you BOTH visit ──
create table public.world_checkins (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (world_id, user_id, day)
);
create table public.world_streak_awards (
  world_id uuid not null references public.worlds (id) on delete cascade,
  day date not null,
  primary key (world_id, day)
);
alter table public.world_checkins enable row level security;
alter table public.world_streak_awards enable row level security;
create policy checkins_select on public.world_checkins for select to authenticated using (public.is_world_member(world_id));
create policy streak_awards_select on public.world_streak_awards for select to authenticated using (public.is_world_member(world_id));

-- Records today's visit and returns the streak. The first time both of you have visited on a
-- day, the world earns 5 love points plus 1 per streak day (up to +10).
create or replace function public.check_in() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid := public.my_world_id();
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_day date;
  v_both boolean;
  v_streak int := 0;
  v_award int := 0;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  insert into public.world_checkins (world_id, user_id, day) values (v_world, auth.uid(), v_today) on conflict do nothing;
  v_both := (select count(*) from public.world_checkins where world_id = v_world and day = v_today) >= 2;
  v_day := case when v_both then v_today else v_today - 1 end;
  while v_streak < 3660 and (select count(*) from public.world_checkins where world_id = v_world and day = v_day) >= 2 loop
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;
  if v_both then
    insert into public.world_streak_awards (world_id, day) values (v_world, v_today) on conflict do nothing;
    if found then
      v_award := 5 + least(v_streak, 10);
      perform public.add_points(v_world, v_award);
      perform public.log_activity(v_world, 'streak', format('kept your streak alive — %s days together 🔥', v_streak));
    end if;
  end if;
  return jsonb_build_object('streak', v_streak, 'today', v_both, 'awarded', v_award, 'points', (select points from public.worlds where id = v_world));
end $$;

-- ── hidden love notes left somewhere in Lagos ──
create table public.love_notes (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  x real not null check (x between -2000 and 2000),
  z real not null check (z between -2000 and 2000),
  place text check (char_length(place) <= 80),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now(),
  found_at timestamptz
);
create index love_notes_world_idx on public.love_notes (world_id, created_at desc);
alter table public.love_notes enable row level security;
create policy love_notes_select on public.love_notes for select to authenticated using (public.is_world_member(world_id));
create policy love_notes_insert on public.love_notes for insert to authenticated
  with check (author_id = auth.uid() and public.is_world_member(world_id) and found_at is null);
create policy love_notes_delete on public.love_notes for delete to authenticated using (author_id = auth.uid());

-- Only the partner (not the author) can mark a note as found.
create or replace function public.find_note(p_note uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.love_notes;
begin
  update public.love_notes set found_at = now()
   where id = p_note and found_at is null and author_id <> auth.uid() and public.is_world_member(world_id)
   returning * into n;
  if n.id is null then return jsonb_build_object('ok', false); end if;
  perform public.log_activity(n.world_id, 'note', format('found a love note at %s 💌', coalesce(n.place, 'a secret spot')));
  return jsonb_build_object('ok', true);
end $$;

create trigger love_notes_notify after insert or update or delete on public.love_notes for each row execute function public.notify_change();

revoke execute on function public.check_in(), public.find_note(uuid) from public, anon;
grant execute on function public.check_in(), public.find_note(uuid) to authenticated;
