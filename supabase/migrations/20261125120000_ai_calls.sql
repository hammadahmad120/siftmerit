-- Siftmerit, fifth SQL file: the cost log of the AI calls.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- Who may reach this table: only the server (the secret key, which uses the
-- database role `service_role`). The browser-side roles `anon` and
-- `authenticated` get no rights and no policies.
--
-- It needs Postgres 15 or newer, for "on delete set null (job_id)" below.

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261125120000_ai_calls');

-- ---------------------------------------------------------------------------
-- ai_calls: one row per call to an AI model. Written once, never changed.
--
-- It keeps numbers and IDs only. The instructions, the text that was sent
-- (a CV, a job description) and the answer are NOT stored here.
--
-- tenant_id            the company that pays for the call. Every call has one;
--                      a test call is booked on the test company.
-- job_id               the job the call was for. Empty when there is none, and
--                      emptied when the job is deleted: the row stays, because
--                      the money was spent.
-- purpose              what the call was for, for example 'cv_read'. The list
--                      of purposes lives in the code, so a new purpose needs
--                      no SQL file.
-- provider             the AI company, for example 'openai'.
-- model                the model, for example 'gpt-6-luna'.
-- thinking             how much the model was told to think: 'none', 'low',
--                      'medium', 'high', 'xhigh' or 'max'.
-- input_tokens         everything we sent.
-- cached_input_tokens  the part of input_tokens that the provider read from
--                      its cache, which is much cheaper.
-- output_tokens        everything that came back, thinking included.
-- thinking_tokens      the part of output_tokens that was thinking.
-- cost_usd             what the call cost in US dollars, to a millionth of a
--                      dollar. Worked out by our code at the moment of the
--                      call from the prices of that day, so the row keeps its
--                      cost when a price changes later.
-- result               ok            an answer came back and passed our checks
--                      wrong_answer  an answer came back and was refused
--                      failed        no answer came back
-- error                why it was not ok, as a short fixed word such as
--                      'timeout' or 'bad_form'. Never the provider's own
--                      message. Empty when the result is ok.
-- duration_ms          how long the call took.
-- trace_id             the ID of the request or the work item that made the
--                      call, to find the same call in the logs.
--
-- Deleting a company removes its rows.
-- ---------------------------------------------------------------------------

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid,
  purpose text not null check (char_length(purpose) between 1 and 60),
  provider text not null check (char_length(provider) between 1 and 60),
  model text not null check (char_length(model) between 1 and 120),
  thinking text not null
    check (thinking in ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thinking_tokens integer not null default 0 check (thinking_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  result text not null check (result in ('ok', 'wrong_answer', 'failed')),
  error text check (error is null or char_length(error) between 1 and 60),
  duration_ms integer not null check (duration_ms >= 0),
  trace_id text check (trace_id is null or char_length(trace_id) between 1 and 200),
  created_at timestamptz not null default now(),

  -- An ok call has no error word, and every other call has one.
  constraint ai_calls_error_matches_result check ((result = 'ok') = (error is null)),

  -- The job must be a job of the same company: the database refuses a row
  -- that names one company and another company's job. When the job is
  -- deleted only job_id is emptied; tenant_id stays.
  constraint ai_calls_job foreign key (tenant_id, job_id)
    references public.jobs (tenant_id, id)
    on delete set null (job_id)
);

-- For "this company's calls, newest first" and "this company's cost in a month".
create index idx_ai_calls_tenant_created
  on public.ai_calls (tenant_id, created_at desc);

-- For "what has this job cost so far". Rows with no job are left out.
create index idx_ai_calls_tenant_job
  on public.ai_calls (tenant_id, job_id)
  where job_id is not null;

-- ---------------------------------------------------------------------------
-- Row rules on, no door for the browser-side roles, written-out rights for
-- the server. The server may read rows and add rows. It gets no right to
-- change or delete one: a row of the cost log is written once. (Rows still
-- go when their company is deleted, and lose their job when the job is
-- deleted; the database does those two itself.)
-- ---------------------------------------------------------------------------

alter table public.ai_calls enable row level security;

revoke all on table public.ai_calls from anon, authenticated;

grant select, insert
  on table public.ai_calls
  to service_role;

commit;
