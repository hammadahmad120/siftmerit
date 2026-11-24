-- Siftmerit, fourth SQL file: the jobs table.
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
insert into public.applied_migrations (name) values ('20261124140000_jobs');

-- ---------------------------------------------------------------------------
-- jobs: one row per hiring job of a company.
--
-- title         the job's short name on our screens, typed by HR. Never used
--               to search mail.
-- description   the job description, as free text.
-- subject_words the phrases the code looks for in email subjects, as a list.
--               1 to 10 phrases. The code checks each phrase (2 to 100
--               characters, no phrase twice) before it saves.
-- posting_date  mail from this day onward is looked at. A plain date.
-- status        draft  -> created, requirements not confirmed yet
--               open   -> requirements confirmed, mail is searched
--               closed -> HR closed the job
--               A new job is a draft. What is running at the moment is not
--               kept here; that is in work_runs.
-- create_key    a random key the form makes once and sends with the job. A
--               key is allowed once per company, so a double click or a
--               repeated request cannot save the same job twice: the second
--               insert is refused, and the API answers with the first job.
-- created_by    the sign-in account that created the job. Becomes empty when
--               that account is deleted; the job stays.
--
-- Deleting a company removes its jobs.
-- Columns that later steps need (strict or lenient, when the requirements
-- were confirmed, when the mailbox was last checked, when the job was closed)
-- are added by the tasks that first use them.
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 20000),
  subject_words text[] not null check (cardinality(subject_words) between 1 and 10),
  posting_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  create_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The one-time key, once per company.
  constraint jobs_create_key_once unique (tenant_id, create_key),

  -- A job's ID is already unique by itself. This second rule exists so that a
  -- later table (requirements, emails) can point at a job together with its
  -- company: "foreign key (tenant_id, job_id) references jobs (tenant_id, id)".
  -- The database then refuses a row that names one company and another
  -- company's job.
  constraint jobs_tenant_and_id unique (tenant_id, id)
);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

-- For "the jobs of my company", newest first.
create index idx_jobs_tenant_created
  on public.jobs (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row rules on, no door for the browser-side roles, written-out rights for
-- the server.
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;

revoke all on table public.jobs from anon, authenticated;

grant select, insert, update, delete
  on table public.jobs
  to service_role;

commit;
