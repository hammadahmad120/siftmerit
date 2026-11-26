-- Siftmerit, seventh SQL file: a run can belong to a job.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- Until now a run belonged to a company only, and a company could have one
-- unfinished run of a kind. The requirements draft is the first work done for
-- one job: two jobs of a company may be drafted at the same time, but the
-- same job never twice.

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261125140000_work_runs_job');

-- ---------------------------------------------------------------------------
-- job_id: the job the run is for. Empty for work that belongs to no job,
-- such as the demo runs. Every row that exists today keeps it empty.
--
-- Together with tenant_id it points at the job's row, so the database refuses
-- a run that names one company and another company's job. Deleting a job
-- removes its runs: the status of work for a job that is gone has no use.
-- (The cost log is different: its rows stay, because the money was spent.)
-- ---------------------------------------------------------------------------

alter table public.work_runs
  add column job_id uuid;

alter table public.work_runs
  add constraint work_runs_job foreign key (tenant_id, job_id)
    references public.jobs (tenant_id, id)
    on delete cascade;

-- ---------------------------------------------------------------------------
-- "One unfinished run" becomes two rules.
--
-- A run without a job: one unfinished run per company and kind, as before.
-- A run with a job:    one unfinished run per job and kind. This is what
--                      refuses a second "Draft requirements" click while the
--                      first draft is still waiting or running.
--
-- The old index covered every row. It is dropped and made again for the rows
-- without a job, and a second index is added for the rows with one.
-- ---------------------------------------------------------------------------

drop index public.idx_work_runs_one_unfinished;

create unique index idx_work_runs_one_unfinished
  on public.work_runs (tenant_id, kind)
  where status in ('waiting', 'running') and job_id is null;

create unique index idx_work_runs_one_unfinished_per_job
  on public.work_runs (tenant_id, job_id, kind)
  where status in ('waiting', 'running') and job_id is not null;

-- For "the newest run of this kind for this job", which the job's page asks
-- for every few seconds while a draft is running.
create index idx_work_runs_job_kind_created
  on public.work_runs (tenant_id, job_id, kind, created_at desc)
  where job_id is not null;

commit;
