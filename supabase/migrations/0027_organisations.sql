-- 0027 — organisations: the tenant boundary.
--
-- WHY THIS EXISTS. Until now `profiles.role = 'admin'` was APP-WIDE, so the one
-- admin could manage every firm's GroundStream credential. A workspace is a
-- sharing group; it was never an ownership boundary. This adds the boundary.
--
-- THE ORGANISATION OWNS THE DATA, NOT THE USER. Every policy after this
-- migration reads `... AND is_org_member(org_id)` — an AND, never an OR. A
-- narrowing filter cannot widen access by construction, which is the only way
-- to make a change this broad safe to apply to live data. It also gives the
-- right leaver semantics: someone who resigns from Firm A and joins Firm B
-- loses Firm A's minutes, even the ones they personally created.

create table if not exists public.organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_members (
  org_id     uuid not null references public.organisations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organisation_members_user_idx on public.organisation_members(user_id);

alter table public.organisations       enable row level security;
alter table public.organisation_members enable row level security;

-- SECURITY DEFINER because a policy body runs as the CALLING role: an inlined
-- subquery against organisation_members would itself be subject to that table's
-- RLS, and the policy would recurse or silently deny. That exact mistake broke
-- company document uploads in migration 0018.

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select p_org is not null and exists (
    select 1 from organisation_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select p_org is not null and exists (
    select 1 from organisation_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  );
$$;

create or replace function public.current_org_id()
returns uuid language sql security definer set search_path = public stable as $$
  select m.org_id from organisation_members m
  where m.user_id = (select auth.uid())
  order by m.created_at limit 1;
$$;

revoke execute on function public.is_org_member(uuid), public.is_org_admin(uuid), public.current_org_id() from public, anon;
grant  execute on function public.is_org_member(uuid), public.is_org_admin(uuid), public.current_org_id() to authenticated;

drop policy if exists organisations_read on public.organisations;
create policy organisations_read on public.organisations
  for select to authenticated using (public.is_org_member(id));

drop policy if exists organisations_update on public.organisations;
create policy organisations_update on public.organisations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- No INSERT policy: organisations are created by the service-role client during
-- signup. A user minting their own org row would let them pick their own id and
-- attach to another firm's records before the membership row exists.

drop policy if exists org_members_read on public.organisation_members;
create policy org_members_read on public.organisation_members
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists org_members_admin_write on public.organisation_members;
create policy org_members_admin_write on public.organisation_members
  for insert to authenticated with check (public.is_org_admin(org_id));

drop policy if exists org_members_admin_update on public.organisation_members;
create policy org_members_admin_update on public.organisation_members
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

drop policy if exists org_members_admin_delete on public.organisation_members;
create policy org_members_admin_delete on public.organisation_members
  for delete to authenticated using (public.is_org_admin(org_id));
