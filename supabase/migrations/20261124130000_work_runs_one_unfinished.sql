-- Siftmerit, third SQL file: a company may have only one unfinished run of a
-- kind. This is what refuses the same work being queued twice.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name)
  values ('20261124130000_work_runs_one_unfinished');

-- The rule below cannot be created while a company has two unfinished runs of
-- one kind. So any run that is still unfinished at this moment is closed
-- first. Only demo runs exist so far.
update public.work_runs
  set status = 'failed', error = 'work_failed', finished_at = now()
  where status in ('waiting', 'running');

-- One unfinished run (waiting or running) per company and kind. A finished
-- run (done or failed) is outside the rule, so a new run can start as soon as
-- the last one has ended.
--
-- The API saves a run's row before it queues anything. When a second click
-- arrives while the first run is unfinished, the database refuses the second
-- row: no row, no ID, and nothing is added to the queue. Two clicks at the
-- same moment are safe too, because the database lets only one row in.
--
-- When the jobs table exists, this becomes "one per job and kind".
create unique index idx_work_runs_one_unfinished
  on public.work_runs (tenant_id, kind)
  where status in ('waiting', 'running');

commit;
