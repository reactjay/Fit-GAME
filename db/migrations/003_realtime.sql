-- Change feed for the realtime server. Each change is published with NOTIFY on
-- channel "justus_changes"; the server forwards it only to sockets of members of
-- that world. Every table streamed here is readable by all members under RLS.

create or replace function public.notify_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  payload jsonb;
begin
  payload := jsonb_build_object(
    'table', tg_table_name,
    'op', tg_op,
    'world', case when tg_table_name = 'worlds' then r ->> 'id' else r ->> 'world_id' end,
    'row', r);
  -- NOTIFY payloads are capped at 8000 bytes; for big rows send the id and let the server re-read it.
  if octet_length(payload::text) > 7500 then
    payload := payload - 'row' || jsonb_build_object('id', r ->> 'id');
  end if;
  perform pg_notify('justus_changes', payload::text);
  return null;
end $$;
revoke execute on function public.notify_change() from public, authenticated;

do $$
declare t text;
begin
  foreach t in array array['messages', 'message_reads', 'calls', 'story_sessions', 'game_sessions', 'room_state',
                           'world_members', 'daily_rewards', 'world_rewards', 'activity'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.notify_change()', t || '_notify', t);
  end loop;
end $$;
create trigger worlds_notify after update on public.worlds for each row execute function public.notify_change();
