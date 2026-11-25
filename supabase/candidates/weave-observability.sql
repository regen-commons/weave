-- Apply through the shared Platform database's migration owner.
begin;

create role weave_observation_owner nologin;
create role weave_observation_writer nologin;
create role weave_api_alert_reader nologin;
grant weave_observation_owner to current_user;

create table weave.api_failure_counts (
  bucket timestamptz not null,
  route text not null check (route in (
    'account', 'sign-in', 'feedback', 'health', 'initiatives-page', 'matching', 'mcp',
    'projects', 'public-projects', 'record-image', 'record-page', 'sitemap', 'transcribe',
    'certified-project-callback', 'certified-project-client', 'certified-project-consent',
    'certified-project-jwks', 'project-index-refresh'
  )),
  total bigint not null check (total > 0),
  primary key (bucket, route)
);

alter table weave.api_failure_counts enable row level security;
revoke all on weave.api_failure_counts from public, anon, authenticated, service_role;
grant usage, create on schema weave to weave_observation_owner;
grant usage on schema weave to weave_observation_writer, weave_api_alert_reader;
alter table weave.api_failure_counts owner to weave_observation_owner;

create function weave.count_api_failure(route_name text)
returns void language sql security definer set search_path = '' set lock_timeout = '500ms' as $$
  insert into weave.api_failure_counts as counts (bucket, route, total)
  values (date_trunc('minute', now()), route_name, 1)
  on conflict (bucket, route) do update set total = counts.total + 1;
$$;

-- The alert runner can only see route categories currently over the threshold.
create function weave.api_alert_routes()
returns setof text language sql stable security definer set search_path = '' as $$
  select route from weave.api_failure_counts
  where bucket >= date_trunc('minute', now()) - interval '14 minutes'
  group by route
  having sum(total) >= 5
  order by route;
$$;

alter function weave.count_api_failure(text) owner to weave_observation_owner;
alter function weave.api_alert_routes() owner to weave_observation_owner;
revoke create on schema weave from weave_observation_owner;
revoke all on function weave.count_api_failure(text), weave.api_alert_routes()
  from public, anon, authenticated, service_role;
grant execute on function weave.count_api_failure(text) to weave_observation_writer;
grant execute on function weave.api_alert_routes() to weave_api_alert_reader;

create extension if not exists pg_cron;
select cron.schedule('weave-observability-retention', '35 4 * * *', $job$
  delete from weave.api_failure_counts where bucket < now() - interval '7 days';
$job$);

commit;
