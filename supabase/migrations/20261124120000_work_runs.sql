-- Siftmerit, second SQL file: the status table for background work.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- Who may reach this table: only the server (the secret key, which uses the
-- database role `service_role`). The browser-side roles `anon` and
-- `authenticated` get no rights and no policies.

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261124120000_work_runs');

-- ---------------------------------------------------------------------------
-- work_runs: one row per piece of background work, as HR sees it.
--
-- The work itself is done by work items in the queue (Redis). This row is the
-- truth the screens show: whether the work is waiting, running, done or
-- failed. The API adds the row before it queues anything, and the worker
-- updates it. One run can be made of many work items.
--
-- kind       what sort of work, for example 'demo'. The list of kinds lives
--            in the code, so a new kind needs no SQL file.
-- status     waiting -> running -> done or failed. A row that is done or
--            failed is never changed again (the code keeps that rule).
-- attempt    which try the run is on. 0 until a worker has started it.
-- error      a short fixed word for why it failed, for example
--            'queue_unavailable'. Never a raw error message, which could
--            repeat personal data.
-- started_at the time the latest try started.
--
-- Deleting a company removes its runs.
-- A link to a job (job_id) is added by the task that first needs it.
-- ---------------------------------------------------------------------------

create table public.work_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'running', 'done', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger work_runs_set_updated_at
  before update on public.work_runs
  for each row
  execute function public.set_updated_at();

-- For "the last runs of my company", newest first.
create index idx_work_runs_tenant_created
  on public.work_runs (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row rules on, no door for the browser-side roles, written-out rights for
-- the server.
-- ---------------------------------------------------------------------------

alter table public.work_runs enable row level security;

revoke all on table public.work_runs from anon, authenticated;

grant select, insert, update, delete
  on table public.work_runs
  to service_role;

commit;
