-- 0041 — hotfix for 0040. Derive org_id instead of demanding it.
--
-- WHAT 0040 BROKE. It made workspace_members.org_id / workspace_invites.org_id
-- NOT NULL with deliberately NO default, and updated none of the four writers:
--   handle_new_user()            (0034) — invite acceptance on signup
--   createWorkspace              app/workspaces/actions.ts:83
--   joinWorkspace                app/workspaces/actions.ts:122
--   inviteToWorkspace            app/workspaces/actions.ts:163
-- Every one omits org_id, so every one raised 23502. Worst is the signup
-- trigger: the violation propagates out and rolls back the auth.users INSERT,
-- so a user holding a pending workspace invite cannot create an account at all.
-- One such invite existed when this was found.
--
-- This is the exact scar recorded in HANDOFF.md — "NOT NULL added to live
-- tables without a DEFAULT breaks every INSERT at runtime while the build stays
-- green" — committed by the same hand that wrote it down. Two independent
-- reviews caught it; the migration's own author did not.
--
-- WHY A TRIGGER RATHER THAN A DEFAULT. current_org_id() is the wrong source:
-- the org must come from the WORKSPACE being joined, not from whoever is
-- joining, or an attacker stamps their own org and satisfies the policy. A
-- trigger can read the workspace; a column default cannot see the row.
--
-- WHY THIS REPLACES 0040's CHECK CONSTRAINT. check(workspace_in_org(...))
-- queries another table, which pg_restore cannot satisfy: it loads tables
-- alphabetically, so workspace_members arrives before workspaces has rows and
-- every row fails. That would have broken restore and PITR wholesale. A trigger
-- is disabled during restore, and derives rather than rejects.
--
-- VERIFIED AFTER APPLYING: insert without org_id is stamped from the workspace;
-- a forged org_id is refused; a nonexistent workspace is refused; a parent org
-- move cascades to children; and the ORIGINAL cross-tenant self-join is still
-- refused — the trigger stamps the rival org, then the restrictive
-- org_isolation policy rejects it because the caller is not a member.

alter table public.workspace_members drop constraint if exists workspace_members_org_matches_workspace;

create or replace function public.stamp_workspace_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select w.org_id into v_org from workspaces w where w.id = new.workspace_id;
  if v_org is null then
    raise exception 'workspace % does not exist', new.workspace_id;
  end if;

  if new.org_id is null then
    new.org_id := v_org;
  elsif new.org_id <> v_org then
    -- The forged-org_id path 0040's CHECK existed to close. Refuse loudly
    -- rather than silently correcting: a caller naming a different org is
    -- either confused or hostile.
    raise exception 'org_id % does not match workspace org %', new.org_id, v_org;
  end if;

  return new;
end $$;

drop trigger if exists stamp_org_on_workspace_members on public.workspace_members;
create trigger stamp_org_on_workspace_members
  before insert or update of workspace_id, org_id on public.workspace_members
  for each row execute function public.stamp_workspace_org();

drop trigger if exists stamp_org_on_workspace_invites on public.workspace_invites;
create trigger stamp_org_on_workspace_invites
  before insert or update of workspace_id, org_id on public.workspace_invites
  for each row execute function public.stamp_workspace_org();

-- Keep child rows consistent when a workspace moves org. A CHECK on the child
-- never re-evaluates when the PARENT changes — both reviews flagged this: the
-- stale org_id is what the restrictive policy would then filter on.
create or replace function public.cascade_workspace_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is distinct from old.org_id then
    update workspace_members set org_id = new.org_id where workspace_id = new.id;
    update workspace_invites set org_id = new.org_id where workspace_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists cascade_org_from_workspace on public.workspaces;
create trigger cascade_org_from_workspace
  after update of org_id on public.workspaces
  for each row execute function public.cascade_workspace_org();
