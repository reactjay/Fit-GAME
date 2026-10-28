-- JustUs on plain PostgreSQL (Railway or local).
-- The app connects as the database owner, then for every user request runs
--   SET LOCAL ROLE authenticated; set_config('request.jwt.claim.sub', <user id>)
-- so every query is checked by the row-level security policies in 002.

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
-- The owner must be allowed to switch into the restricted role.
grant authenticated to current_user;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 254),
  password_hash text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index if not exists users_email_key on auth.users (lower(email));

-- Only a SHA-256 hash of each session token is stored.
create table if not exists auth.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index if not exists sessions_user_idx on auth.sessions (user_id);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- The restricted role can call auth.uid() but can never read users or sessions.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
revoke all on auth.users, auth.sessions from authenticated, anon, public;

grant usage on schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
