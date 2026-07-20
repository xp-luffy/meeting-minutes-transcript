-- 0019 — close two forgeable cross-tenant write paths found by an independent
-- (Codex) review and confirmed against the live policies.
--
-- 1. entity_links_update never checked meeting_id.
--    Migration 0010 bound the INSERT path after a forged directorship edge was
--    found, but left UPDATE with only a user_id + entity ownership check. An
--    existing edge could therefore be RE-POINTED at another tenant's meeting.
--    That is not self-pollution: entity_links_read grants access via
--    can_access_meeting, so the victim would see a fabricated directorship
--    attached to their own minutes — the precise attack 0010 set out to stop.
--
-- 2. meetings_insert / meetings_update never checked company_id.
--    company_id arrived later (0006) and no policy was updated to bind it, so a
--    caller could attach their meeting to any company UUID they happened to
--    know. No disclosure (reads stay RLS-scoped), but it corrupts the company
--    record an auditor would rely on, which is the asset this product sells.
--
-- Both follow the established pattern: bind BOTH sides of the relationship,
-- and apply the same check on UPDATE as on INSERT. A policy that authenticates
-- the actor but authorizes nothing about the target is not a boundary.

drop policy if exists "entity_links_update" on entity_links;
create policy "entity_links_update" on entity_links for update to authenticated
  using (
    (select auth.uid()) = user_id
    or ((meeting_id is not null) and can_access_meeting(meeting_id))
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from entities e
      where e.id = entity_links.entity_id
        and (e.user_id = (select auth.uid()) or is_workspace_member(e.workspace_id))
    )
    -- the half that was missing: the meeting side must be bound too
    and ((meeting_id is null) or can_access_meeting(meeting_id))
  );

drop policy if exists "meetings_insert" on meetings;
create policy "meetings_insert" on meetings for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      workspace_id is null
      or is_workspace_member(workspace_id)
      or exists (select 1 from workspaces w
                  where w.id = meetings.workspace_id and w.created_by = (select auth.uid()))
    )
    and ((company_id is null) or can_access_company(company_id))
  );

drop policy if exists "meetings_update" on meetings;
create policy "meetings_update" on meetings for update to authenticated
  using ((select auth.uid()) = user_id or is_workspace_member(workspace_id))
  with check (
    ((select auth.uid()) = user_id or is_workspace_member(workspace_id))
    and ((company_id is null) or can_access_company(company_id))
  );
