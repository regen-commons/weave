-- Synthetic Supabase auth boundary for a fresh, disposable PostgreSQL database only.
-- Apply before the website's 20261105082413_weave_private_accounts.sql.
do $$
declare name text;
begin
  foreach name in array array['anon','authenticated','service_role'] loop
    if not exists(select from pg_roles where rolname=name) then execute format('create role %I nologin',name); end if;
  end loop;
end $$;
create schema auth;
create schema extensions;
create schema private;
revoke all on schema auth,private from public;
grant usage on schema auth,private to authenticated;
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claims',true),'')::jsonb
$$;
create function auth.uid() returns uuid language sql stable set search_path='' as $$
  select (auth.jwt()->>'sub')::uuid
$$;
create table auth.users (id uuid primary key, is_anonymous boolean not null default false,banned_until timestamptz);
create table auth.sessions (id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
create table auth.identities (user_id uuid references auth.users,provider text,provider_id text);
