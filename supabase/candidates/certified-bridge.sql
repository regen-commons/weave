-- Candidate for the website migration owner. Not an applied production migration.
-- Provision the login and its password out of band. Never grant it other schemas.
create schema if not exists weave_auth;
revoke all on schema weave_auth from public;
create table weave_auth.records (
  namespace text not null,
  key_hash text not null,
  encrypted_payload text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  grant_hash text,
  uid_hash text,
  primary key(namespace, key_hash)
);
create index on weave_auth.records(expires_at);
create index on weave_auth.records(grant_hash) where grant_hash is not null;
create unique index on weave_auth.records(namespace, uid_hash) where uid_hash is not null;
create table weave_auth.revoked_grants (
  grant_hash text primary key,
  expires_at timestamptz not null
);
create table weave_auth.settings (
  name text primary key,
  encrypted_payload text not null
);
-- RLS with no policies denies ordinary roles even if accidental table grants occur.
alter table weave_auth.records enable row level security;
alter table weave_auth.revoked_grants enable row level security;
alter table weave_auth.settings enable row level security;
revoke all on all tables in schema weave_auth from public;
-- Runtime access is limited to this schema. This role has no BYPASSRLS or auth access.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'weave_auth_runtime') then
    create role weave_auth_runtime nologin;
  end if;
end $$;
grant usage on schema weave_auth to weave_auth_runtime;
grant select, insert, update, delete on weave_auth.records, weave_auth.revoked_grants to weave_auth_runtime;
grant select on weave_auth.settings to weave_auth_runtime;
create policy bridge_runtime on weave_auth.records to weave_auth_runtime using(true) with check(true);
create policy bridge_runtime on weave_auth.revoked_grants to weave_auth_runtime using(true) with check(true);
create policy bridge_runtime on weave_auth.settings for select to weave_auth_runtime using(true);
-- Settings are provisioned/rotated by the database owner, never by the runtime login.
