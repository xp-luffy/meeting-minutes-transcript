-- 0040 — close the membership-graph leak left by 0029/0030.
--
-- THE BUG, reproduced live before writing this fix: a user in org A could
-- INSERT themselves into a workspace belonging to org B, because wm_insert's
-- WITH CHECK only asks that the row NAMES them:
--     user_id = auth.uid() OR (they created the workspace)
-- Having joined, wm_read (is_workspace_member) returned org B's full member
-- list. Verified: the self-join succeeded and 2 foreign members appeared.
--
-- WHY IT HAPPENED: 0029/0030 enumerated 15 domain tables by hand and missed
-- these two. An enumerated list is only as good as the enumeration.
--
-- WHAT SAVED THE RECORDS: in the same probe, companies stayed at 7 and
-- meetings at 8. org_isolation is RESTRICTIVE, so it ANDs over
-- can_access_company / can_access_meeting regardless of what
-- is_workspace_member returns. The "cannot widen by construction" property
-- contained a hole in the very migration that introduced it.
--
-- Left unfixed this is a membership leak today and a full record leak the day
-- any new table is gated on is_workspace_member alone.

alter table public.workspace_members  add column if not exists org_id uuid references public.organisations(id);
alter table public.workspace_invites  add column if not exists org_id uuid references public.organisations(id);

update public.workspace_members m set org_id = w.org_id from public.workspaces w
 where w.id = m.workspace_id and m.org_id is null;
update public.workspace_invites i set org_id = w.org_id from public.workspaces w
 where w.id = i.workspace_id and i.org_id is null;

delete from public.workspace_members where org_id is null;
delete from public.workspace_invites where org_id is null;

alter table public.workspace_members alter column org_id set not null;
alter table public.workspace_invites alter column org_id set not null;

-- No DEFAULT current_org_id() here, deliberately: the org must come from the
-- WORKSPACE being joined, not from whoever is joining. Defaulting to the
-- caller's org would let an attacker stamp their own org onto a foreign
-- membership row and satisfy the very policy below.
create index if not exists workspace_members_org_idx on public.workspace_members(org_id);
create index if not exists workspace_invites_org_idx on public.workspace_invites(org_id);

create policy org_isolation on public.workspace_members as restrictive to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.workspace_invites as restrictive to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create or replace function public.workspace_in_org(p_workspace uuid, p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from workspaces w where w.id = p_workspace and w.org_id = p_org);
$$;
revoke execute on function public.workspace_in_org(uuid, uuid) from public, anon;
grant  execute on function public.workspace_in_org(uuid, uuid) to authenticated;

alter table public.workspace_members
  add constraint workspace_members_org_matches_workspace
  check (public.workspace_in_org(workspace_id, org_id)) not valid;
alter table public.workspace_members validate constraint workspace_members_org_matches_workspace;

-- Defence in depth: is_workspace_member feeds can_access_meeting and
-- can_access_company, so it must never answer true across a tenant boundary
-- even if a membership row somehow exists.
create or replace function public.is_workspace_member(wid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select wid is not null and exists (
    select 1 from workspace_members m
    join workspaces w on w.id = m.workspace_id
    where m.workspace_id = wid
      and m.user_id = (select auth.uid())
      and public.is_org_member(w.org_id)
  );
$$;

-- gs_settings holds the encrypted tenant-wide write credential and was the one
-- sensitive table defended ONLY by permissive is_org_admin policies.
create policy org_isolation on public.gs_settings as restrictive to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.gs_settings_audit as restrictive to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
