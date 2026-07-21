-- 0034 — every account belongs to an organisation from the moment it exists.
--
-- Without this a new signup has no membership, so current_org_id() returns NULL,
-- the org_id default resolves to NULL, and their FIRST write dies on a not-null
-- violation. The account would look fine and be unable to do anything.
--
-- NEVER AUTO-JOIN BY EMAIL DOMAIN. It reads as a convenience — everyone at
-- @firm.com lands together — right up until two unrelated people sign up with
-- gmail.com and share a tenant containing each other's statutory records.
-- Joining an existing organisation requires an explicit invite, always.

create table if not exists public.organisation_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists organisation_invites_email_idx on public.organisation_invites(lower(email));

alter table public.organisation_invites enable row level security;

drop policy if exists org_invites_admin_all on public.organisation_invites;
create policy org_invites_admin_all on public.organisation_invites
  for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- A URL-safe, unique slug. The random suffix is what makes it collision-proof:
-- two firms both called "Smith & Co" are a matter of time, and a slug clash
-- would fail the signup rather than merely look untidy.
create or replace function public.generate_org_slug(p_seed text)
returns text language plpgsql security definer set search_path = public as $$
declare v_base text; v_slug text; v_try int := 0;
begin
  v_base := regexp_replace(lower(coalesce(p_seed,'org')), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if length(v_base) < 2 then v_base := 'org'; end if;
  v_base := left(v_base, 32);
  loop
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from organisations where slug = v_slug);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'could not allocate an organisation slug'; end if;
  end loop;
  return v_slug;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid;
  v_role text;
  v_local text;
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;

  -- Existing workspace-invite behaviour, unchanged.
  insert into public.workspace_members (workspace_id, user_id, role)
  select wi.workspace_id, new.id, 'member' from public.workspace_invites wi
  where lower(wi.email) = lower(new.email)
  on conflict do nothing;
  delete from public.workspace_invites where lower(email) = lower(new.email);

  -- Organisation: an explicit invite joins an existing one, otherwise a new
  -- organisation is created and this user owns it.
  select oi.org_id, oi.role into v_org, v_role
  from public.organisation_invites oi
  where lower(oi.email) = lower(new.email)
  order by oi.created_at limit 1;

  if v_org is null then
    v_local := split_part(coalesce(new.email, 'organisation'), '@', 1);
    insert into public.organisations (name, slug, created_by)
    values (v_local || '''s organisation', public.generate_org_slug(v_local), new.id)
    returning id into v_org;
    v_role := 'owner';
  end if;

  insert into public.organisation_members (org_id, user_id, role)
  values (v_org, new.id, coalesce(v_role, 'member'))
  on conflict (org_id, user_id) do nothing;

  delete from public.organisation_invites where lower(email) = lower(new.email);

  return new;
end;
$function$;
