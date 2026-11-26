-- Siftmerit, eighth SQL file: HR edits a job's requirements.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- It adds one rule to the table job_requirements and three functions: add a
-- requirement, change one, remove one. Who may run the functions: only the
-- server (the database role `service_role`).

begin;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261126120000_requirement_edits');

-- ---------------------------------------------------------------------------
-- No text twice in one job. Capital letters do not make a text different:
-- "Strong Python" and "strong python" are the same requirement.
--
-- It is a rule in the database and not only a check in our code, because two
-- requests at the same moment would both pass a check. It holds for every
-- writer: the AI's draft, HR's edits, and later the chat agent.
--
-- If this line fails, a job already holds the same text twice. Nothing of
-- the file is applied then.
-- ---------------------------------------------------------------------------

create unique index idx_job_requirements_text_once
  on public.job_requirements (tenant_id, job_id, lower(text));

-- ---------------------------------------------------------------------------
-- The three functions share one shape.
--
-- p_tenant_id  the company. Every statement uses it, so a function only ever
--              touches rows of this company.
-- p_job_id     the job.
--
-- Each one first locks the job's row ("for update") and checks that the job
-- is still a draft. The lock holds until the function ends, so two edits of
-- one job run one after the other, and an edit cannot cross a confirm.
--
-- Each one answers with a small JSON object. "result" is one word that says
-- how it went; a requirement that was added or changed comes back in
-- "requirement", as the row it is now.
--
-- The text, the kind and the mark are checked by our code before a function
-- is called. The table's own rules (500 characters, the three kinds, the two
-- marks) still stand behind that: a value that breaks one is refused by the
-- database with an error.
-- ---------------------------------------------------------------------------

-- add_job_requirement: adds one requirement at the end of the job's list.
--
-- p_max_count  the most requirements a job may have. Our code hands it in,
--              so the number is written in one place.
--
-- result: added | job_not_found | job_not_draft | too_many | duplicate
create function public.add_job_requirement(
  p_tenant_id uuid,
  p_job_id uuid,
  p_text text,
  p_kind text,
  p_if_silent text,
  p_max_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_count integer;
  v_last_position integer;
  v_row public.job_requirements;
begin
  select status into v_status
    from public.jobs
    where tenant_id = p_tenant_id and id = p_job_id
    for update;

  if not found then
    return jsonb_build_object('result', 'job_not_found');
  end if;

  if v_status <> 'draft' then
    return jsonb_build_object('result', 'job_not_draft');
  end if;

  select count(*), coalesce(max(position), 0)
    into v_count, v_last_position
    from public.job_requirements
    where tenant_id = p_tenant_id and job_id = p_job_id;

  if v_count >= p_max_count then
    return jsonb_build_object('result', 'too_many');
  end if;

  begin
    insert into public.job_requirements (tenant_id, job_id, text, kind, if_silent, position)
    values (p_tenant_id, p_job_id, p_text, p_kind, p_if_silent, v_last_position + 1)
    returning * into v_row;
  exception
    when unique_violation then
      return jsonb_build_object('result', 'duplicate');
  end;

  return jsonb_build_object('result', 'added', 'requirement', to_jsonb(v_row));
end;
$$;

-- change_job_requirement: changes the text, the kind or the mark of one
-- requirement. A value handed in as null stays as it is.
--
-- result: changed | not_found | job_not_found | job_not_draft | duplicate
create function public.change_job_requirement(
  p_tenant_id uuid,
  p_job_id uuid,
  p_requirement_id uuid,
  p_text text,
  p_kind text,
  p_if_silent text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_row public.job_requirements;
begin
  select status into v_status
    from public.jobs
    where tenant_id = p_tenant_id and id = p_job_id
    for update;

  if not found then
    return jsonb_build_object('result', 'job_not_found');
  end if;

  if v_status <> 'draft' then
    return jsonb_build_object('result', 'job_not_draft');
  end if;

  begin
    update public.job_requirements
      set text = coalesce(p_text, text),
          kind = coalesce(p_kind, kind),
          if_silent = coalesce(p_if_silent, if_silent)
      where tenant_id = p_tenant_id and job_id = p_job_id and id = p_requirement_id
      returning * into v_row;

    if not found then
      return jsonb_build_object('result', 'not_found');
    end if;
  exception
    when unique_violation then
      return jsonb_build_object('result', 'duplicate');
  end;

  return jsonb_build_object('result', 'changed', 'requirement', to_jsonb(v_row));
end;
$$;

-- remove_job_requirement: removes one requirement. The places of the others
-- are left as they are; a gap in the numbers does not change their order.
--
-- result: removed | not_found | job_not_found | job_not_draft
create function public.remove_job_requirement(
  p_tenant_id uuid,
  p_job_id uuid,
  p_requirement_id uuid
)
returns jsonb
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
    return jsonb_build_object('result', 'job_not_found');
  end if;

  if v_status <> 'draft' then
    return jsonb_build_object('result', 'job_not_draft');
  end if;

  delete from public.job_requirements
    where tenant_id = p_tenant_id and job_id = p_job_id and id = p_requirement_id;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  return jsonb_build_object('result', 'removed');
end;
$$;

-- Postgres lets everyone run a new function unless told otherwise.
revoke all
  on function public.add_job_requirement (uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all
  on function public.change_job_requirement (uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all
  on function public.remove_job_requirement (uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.add_job_requirement (uuid, uuid, text, text, text, integer)
  to service_role;
grant execute
  on function public.change_job_requirement (uuid, uuid, uuid, text, text, text)
  to service_role;
grant execute
  on function public.remove_job_requirement (uuid, uuid, uuid)
  to service_role;

commit;
