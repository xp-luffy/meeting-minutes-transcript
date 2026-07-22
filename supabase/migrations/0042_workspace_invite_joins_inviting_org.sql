-- 0042 — a workspace invite must place the invitee in the INVITING organisation.
--
-- FOUND BY RUNNING THE PATH, not by reading it. A signup whose email matched a
-- pending workspace invite completed successfully after 0041 — profile created,
-- membership row created, org_id stamped — and then granted NOTHING:
--
--   workspaces visible to the invitee ....... 0
--   inviting firm's companies ............... 0
--   inviting firm's meetings ................ 0
--   their OWN workspace_members row ......... 0   (exists, invisible to them)
--
-- Because handle_new_user() minted them a PERSONAL organisation, and 0040 made
-- is_workspace_member() require org membership. The membership row was created
-- into an organisation the user does not belong to, so it is inert by
-- construction. The invite silently does nothing — no error anywhere.
--
-- The correct security outcome reached by an incorrect product route: isolation
-- held, but the feature was dead. Inviting someone to your firm's workspace IS
-- inviting them into your firm; there is no coherent reading where they belong
-- to another organisation and still work in your workspace.
--
-- Precedence: org invite > workspace invite > new personal org. An explicit
-- organisation invite states the intent directly, so it wins.
--
-- Does NOT weaken 0039 (one login = one organisation). The invitee still ends
-- up in exactly one org — the inviting one, instead of a useless private one.
--
-- VERIFIED after applying: invitee lands in drive-funnels as 'member', sees the
-- workspace and their own membership, sees ONLY the workspace-shared company
-- and meeting (1 each, not all 7 and 8), and is NOT an org admin — so they
-- cannot reach the firm's GroundStream credential.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid;
  v_role text;
  v_local text;
  v_ws_org uuid;
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;

  -- 1. An explicit ORGANISATION invite wins: it states the intent directly.
  select oi.org_id, oi.role into v_org, v_role
  from public.organisation_invites oi
  where lower(oi.email) = lower(new.email)
  order by oi.created_at limit 1;

  -- 2. Otherwise a WORKSPACE invite implies the organisation that owns it.
  if v_org is null then
    select w.org_id into v_ws_org
    from public.workspace_invites wi
    join public.workspaces w on w.id = wi.workspace_id
    where lower(wi.email) = lower(new.email)
    order by wi.created_at limit 1;

    if v_ws_org is not null then
      v_org := v_ws_org;
      v_role := 'member';   -- never owner/admin by way of a workspace invite
    end if;
  end if;

  -- 3. No invite at all: their own organisation, which they own.
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

  -- Workspace membership LAST, so org membership already exists when the stamp
  -- trigger and the restrictive policy evaluate. org_id is derived from the
  -- workspace by the 0041 trigger; supplying it here would be a second source
  -- of truth for the same fact.
  insert into public.workspace_members (workspace_id, user_id, role)
  select wi.workspace_id, new.id, 'member' from public.workspace_invites wi
  where lower(wi.email) = lower(new.email)
  on conflict do nothing;

  delete from public.workspace_invites where lower(email) = lower(new.email);
  delete from public.organisation_invites where lower(email) = lower(new.email);

  return new;
end;
$function$;
