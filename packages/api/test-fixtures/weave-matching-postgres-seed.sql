-- Run after the private-saving baseline and Certified predicate, before matching.
create function pg_temp.matching_actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object(
    'sub','01000000-0000-4000-8000-00000000000'||n,
    'session_id','02000000-0000-4000-8000-00000000000'||n,
    'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,false)
$$;
create function pg_temp.check_matching(ok boolean, assertion text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'matching check failed: %', assertion; end if;
end $$;
create function pg_temp.matching_reject(expected text, sql text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if sqlstate=expected then return; end if;
    raise;
  end;
  raise exception 'expected % from %',expected,sql;
end $$;
insert into auth.users(id) select ('01000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,3) n;
insert into auth.sessions(id,user_id)
  select ('02000000-0000-4000-8000-00000000000'||n)::uuid,('01000000-0000-4000-8000-00000000000'||n)::uuid
  from generate_series(1,3) n;
insert into auth.identities
  select ('01000000-0000-4000-8000-00000000000'||n)::uuid,'custom:certified','https://certified.one|did:plc:synthetic'||n
  from generate_series(1,2) n;
set role authenticated;
select pg_temp.matching_actor(1);
select weave.save_initiative('03000000-0000-4000-8000-000000000001',0,
  '04000000-0000-4000-8000-000000000001', :'document'::jsonb) as legacy_a \gset
reset role;
