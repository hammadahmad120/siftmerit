-- Siftmerit, sixth SQL file: the requirements of a job, and the function that
-- swaps a job's whole list in one step.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- Who may reach the table and the function: only the server (the secret key,
-- which uses the database role `service_role`). The browser-side roles `anon`
-- and `authenticated` get no rights and no policies.

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261125130000_job_requirements');

-- ---------------------------------------------------------------------------
-- job_requirements: one row per requirement of a job.
--
-- The AI drafts the list from the job description (task 14). HR edits and
-- confirms it (task 16). Later every tick points at one of these rows.
--
-- tenant_id   the company the job belongs to.
-- job_id      the job. Together with tenant_id it points at the job's row, so
--             the database refuses a row that names one company and another
--             company's job.
-- text        the requirement, as one short sentence. 1 to 500 characters.
-- kind        must      -> must-have: a candidate who misses it is dropped
--             preferred -> strongly wanted
--             nice      -> nice to have: an extra
-- if_silent   what a CV that says nothing about the requirement means:
--             ask     -> ask the candidate (a city, a language, a soft skill)
--             missing -> count as missing (a skill, the years, a degree)
-- position    its place in the list, starting at 1. Not kept unique: how HR
--             moves a requirement up or down is decided in task 16.
--
-- Deleting a job removes its requirements. Deleting a company removes them
-- too.
-- ---------------------------------------------------------------------------

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid not null,
  text text not null check (char_length(text) between 1 and 500),
  kind text not null check (kind in ('must', 'preferred', 'nice')),
  if_silent text not null check (if_silent in ('ask', 'missing')),
  position integer not null check (position >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint job_requirements_job foreign key (tenant_id, job_id)
    references public.jobs (tenant_id, id)
    on delete cascade,

  -- A requirement's ID is already unique by itself. This second rule exists
  -- so that a later table (ticks) can point at a requirement together with
  -- its company, as this table does with a job.
  constraint job_requirements_tenant_and_id unique (tenant_id, id)
);

create trigger job_requirements_set_updated_at
  before update on public.job_requirements
  for each row
  execute function public.set_updated_at();

-- For "the requirements of this job, in order".
create index idx_job_requirements_job_position
  on public.job_requirements (tenant_id, job_id, position);

-- ---------------------------------------------------------------------------
-- Row rules on, no door for the browser-side roles, written-out rights for
-- the server.
-- ---------------------------------------------------------------------------

alter table public.job_requirements enable row level security;

revoke all on table public.job_requirements from anon, authenticated;

grant select, insert, update, delete
  on table public.job_requirements
  to service_role;

-- ---------------------------------------------------------------------------
-- replace_job_requirements: swaps a job's whole list for a new one.
--
-- Deleting the old rows and adding the new ones are two steps. A function
-- runs inside one transaction, so both happen or neither does: a job's list
-- is always the whole old one or the whole new one, never empty in between.
--
-- p_tenant_id     the company. Every statement below uses it, so the function
--                 only ever touches rows of this company.
-- p_job_id        the job.
-- p_requirements  the new list, as a JSON list of objects with the keys
--                 "text", "kind" and "ifSilent". Their order is the order of
--                 the list.
--
-- It answers with one word:
--   replaced       the list was swapped
--   job_not_found  this company has no such job; nothing was changed
--   job_not_draft  the job's requirements are confirmed already; nothing was
--                  changed
--
-- "for update" locks the job's row until the function ends. Two swaps for the
-- same job therefore run one after the other, and a swap cannot cross a
-- change of the job's status.
--
-- "security invoker" means the function has only the rights of whoever calls
-- it. "set search_path = ''" makes every table name below need its schema
-- written out, so no other schema can slip a table of the same name in.
-- ---------------------------------------------------------------------------

create function public.replace_job_requirements(
  p_tenant_id uuid,
  p_job_id uuid,
  p_requirements jsonb
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

  delete from public.job_requirements
    where tenant_id = p_tenant_id and job_id = p_job_id;

  insert into public.job_requirements (tenant_id, job_id, text, kind, if_silent, position)
  select
    p_tenant_id,
    p_job_id,
    item ->> 'text',
    item ->> 'kind',
    item ->> 'ifSilent',
    place::integer
  from jsonb_array_elements(p_requirements) with ordinality as list (item, place);

  return 'replaced';
end;
$$;

-- Postgres lets everyone run a new function unless told otherwise.
revoke all
  on function public.replace_job_requirements (uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute
  on function public.replace_job_requirements (uuid, uuid, jsonb)
  to service_role;

commit;
