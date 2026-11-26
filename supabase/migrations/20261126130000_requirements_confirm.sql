-- Siftmerit, ninth SQL file: HR confirms a job's requirements, and can go
-- back to editing them.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- It adds one column to the table jobs and two functions. Who may run the
-- functions: only the server (the database role `service_role`).

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261126130000_requirements_confirm');

-- ---------------------------------------------------------------------------
-- requirements_confirmed_at: the moment HR confirmed the job's requirements.
-- Empty while the job is a draft. Every job that exists today is a draft and
-- keeps it empty.
--
-- The rule below ties it to the status, so the two can never disagree: a
-- draft has no confirm time, and an open or closed job has one.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column requirements_confirmed_at timestamptz;

alter table public.jobs
  add constraint jobs_confirmed_matches_status
    check ((status = 'draft') = (requirements_confirmed_at is null));

-- ---------------------------------------------------------------------------
-- confirm_job_requirements: the job goes from draft to open.
--
-- The confirm is the gate of the product: nothing later (the mail search, the
-- CV reading) may start before it. A list needs at least one must-have, and
-- that is checked here, in the same step as the change of status, with the
-- job's row locked. So nobody can remove the last must-have in the moment
-- between the check and the confirm.
--
-- p_tenant_id  the company. Every statement uses it.
-- p_job_id     the job.
--
-- It answers with one word:
--   confirmed      the job is open now
--   job_not_found  this company has no such job
--   job_not_draft  the job's requirements are confirmed already
--   no_must_have   the list has no must-have (an empty list has none either)
-- ---------------------------------------------------------------------------

create function public.confirm_job_requirements(
  p_tenant_id uuid,
  p_job_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.jobs
    where tenant_id = p_tenant_id and id = p_job_id
    for update;

  if not found then
    return 'job_not_found';
  end if;

  if v_status <> 'draft' then
    return 'job_not_draft';
  end if;

  if not exists (
    select 1
      from public.job_requirements
      where tenant_id = p_tenant_id and job_id = p_job_id and kind = 'must'
  ) then
    return 'no_must_have';
  end if;

  update public.jobs
    set status = 'open', requirements_confirmed_at = now()
    where tenant_id = p_tenant_id and id = p_job_id;

  return 'confirmed';
end;
$$;

-- ---------------------------------------------------------------------------
-- reopen_job_requirements: the job goes from open back to draft, so HR can
-- edit the list again. The confirm time is emptied.
--
-- Today nothing is built on a confirmed list yet, so going back is always
-- allowed for an open job. The task that first reads a CV adds its own check
-- here: once CVs are read, a changed list means ticks must be redone, which
-- is a different piece of work.
--
-- It answers with one word:
--   reopened       the job is a draft again
--   job_not_found  this company has no such job
--   job_not_open   the job is a draft already, or it is closed
-- ---------------------------------------------------------------------------

create function public.reopen_job_requirements(
  p_tenant_id uuid,
  p_job_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.jobs
    where tenant_id = p_tenant_id and id = p_job_id
    for update;

  if not found then
    return 'job_not_found';
  end if;

  if v_status <> 'open' then
    return 'job_not_open';
  end if;

  update public.jobs
    set status = 'draft', requirements_confirmed_at = null
    where tenant_id = p_tenant_id and id = p_job_id;

  return 'reopened';
end;
$$;

-- Postgres lets everyone run a new function unless told otherwise.
revoke all
  on function public.confirm_job_requirements (uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.reopen_job_requirements (uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.confirm_job_requirements (uuid, uuid)
  to service_role;
grant execute
  on function public.reopen_job_requirements (uuid, uuid)
  to service_role;

commit;
