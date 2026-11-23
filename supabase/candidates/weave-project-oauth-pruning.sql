-- Candidate for the website migration owner; this repository applies nothing. Apply after
-- weave-project-oauth.sql, on a project where the pg_cron extension is available.
--
-- weave_project_oauth.records holds short-lived consent state and the Certified project grants, all
-- encrypted. Every read already ignores a row past its expires_at, and signing out deletes that
-- session's grants. A session that lapses without a sign-out leaves its grant behind, and nothing
-- else removes expired rows. This job deletes them once a day, so an expired grant's tokens do not
-- stay in the database.
--
-- The job runs as the role that schedules it. The table has row-level security with a policy for the
-- runtime role only, so schedule it as the table's owner (or a role that bypasses row-level security):
-- any other role deletes nothing and reports no error. It needs no new grant for
-- weave_project_oauth_runtime, and it touches no other table.
begin;
create extension if not exists pg_cron;
select cron.schedule(
  'weave-project-oauth-prune',
  '17 3 * * *',
  $$delete from weave_project_oauth.records where expires_at <= now()$$
);
commit;
-- To check that it is scheduled: select jobname, schedule, active from cron.job where jobname = 'weave-project-oauth-prune';
-- To check that it ran and deleted rows: select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'weave-project-oauth-prune') order by start_time desc limit 5;
-- To remove: select cron.unschedule('weave-project-oauth-prune');
