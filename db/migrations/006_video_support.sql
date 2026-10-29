-- Migration 006: Add full support for videos in chat messages and media registry
do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'
  ) loop
    execute 'alter table public.messages drop constraint ' || quote_ident(r.conname);
  end loop;

  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.media'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind%' or pg_get_constraintdef(oid) like '%size_bytes%')
  ) loop
    execute 'alter table public.media drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'voice', 'gift', 'call'));
alter table public.media add constraint media_kind_check check (kind in ('image', 'video', 'voice'));
alter table public.media add constraint media_size_bytes_check check (size_bytes > 0 and size_bytes <= 52428800);
