-- Candidate for the website migration owner; apply only after private saving exists.
-- Certified is the sole Weave identity. Email and user-editable metadata grant nothing.
create or replace function private.weave_actor() returns uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid() where auth.uid() is not null
    and auth.jwt()->>'role' = 'authenticated'
    and coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
    and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
    and exists(select 1 from auth.users u where u.id = auth.uid()
      and coalesce(u.is_anonymous, false) = false
      and (u.banned_until is null or u.banned_until <= now())
      and exists(select 1 from auth.identities i where i.user_id = u.id
        and i.provider = 'custom:certified'
        and i.provider_id ~ '^https://certified[.]one[|]did:[a-z]+:[A-Za-z0-9._:%-]+$'
        and length(i.provider_id) <= 2069))
    and exists(select 1 from auth.sessions s where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function private.weave_actor() from public, anon;
grant execute on function private.weave_actor() to authenticated;

-- App callback state is isolated from upstream OAuth tokens and issuer signing keys.
create schema if not exists weave_auth;
revoke all on schema weave_auth from public;
create table weave_auth.app_signins (
  key_hash text primary key,
  encrypted_payload text not null,
  expires_at timestamptz not null
);
create index on weave_auth.app_signins(expires_at);
alter table weave_auth.app_signins enable row level security;
revoke all on weave_auth.app_signins from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'weave_app_auth_runtime') then
    create role weave_app_auth_runtime nologin;
  end if;
end $$;
grant usage on schema weave_auth to weave_app_auth_runtime;
grant select, insert, delete on weave_auth.app_signins to weave_app_auth_runtime;
create policy app_signin_runtime on weave_auth.app_signins to weave_app_auth_runtime using(true) with check(true);
-- No app role grant on bridge records/settings or on Auth/private initiative tables.
