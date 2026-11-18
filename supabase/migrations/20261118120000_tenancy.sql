-- Siftmerit, first SQL file: the list of applied files and the company tables.
--
-- How to apply: after the go-ahead for this file, paste all of it into the
-- Supabase SQL editor and run it once. It applies completely or not at all.
-- A second run stops at the insert below and changes nothing.
--
-- Who may reach these tables: only the server (the secret key, which uses the
-- database role `service_role`). The browser-side roles `anon` and
-- `authenticated` get no rights and no policies. The rights are written out
-- here and never left to the project's defaults.

begin;

-- ---------------------------------------------------------------------------
-- The list of applied SQL files. A name is allowed only once.
-- It has no tenant_id: it holds file names only, no company data.
-- Nobody reaches it through the API, not even the server key. Only the SQL
-- editor touches it.
-- ---------------------------------------------------------------------------

create table if not exists public.applied_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

alter table public.applied_migrations enable row level security;
revoke all on table public.applied_migrations from anon, authenticated, service_role;

-- A second run of this file stops here, and nothing below runs.
insert into public.applied_migrations (name) values ('20261118120000_tenancy');

-- ---------------------------------------------------------------------------
-- Keeps updated_at current whenever a row is changed. Copied from InstantBot.
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- tenants: one row per company.
-- slug is the short name: lower-case letters, digits and dashes, 1 to 63 long.
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_members: which sign-in account belongs to which company.
-- Deleting a company removes its member rows. Deleting a sign-in account
-- removes its member row, never the company.
-- ---------------------------------------------------------------------------

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- One user belongs to one company.
create unique index idx_tenant_members_user_id on public.tenant_members (user_id);

-- ---------------------------------------------------------------------------
-- Row rules on, no door for the browser-side roles, written-out rights for
-- the server.
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

revoke all on table public.tenants, public.tenant_members from anon, authenticated;

grant select, insert, update, delete
  on table public.tenants, public.tenant_members
  to service_role;

commit;
