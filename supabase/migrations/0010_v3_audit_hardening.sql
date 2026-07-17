-- V3 audit hardening (docs/AUDIT_V3.md). P1: entity_links_insert/update only
-- checked user_id — a user could forge a link onto another user's entity to
-- poison their conflict detection / people graph. Require the entity_id to
-- belong to the caller (or their workspace), and that a supplied meeting_id is
-- accessible. (App-layer P2 ilike-escaping fix is in app/people/data.ts.)
drop policy if exists "entity_links_insert" on entity_links;
create policy "entity_links_insert" on entity_links for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from entities e
      where e.id = entity_id
        and (e.user_id = (select auth.uid()) or is_workspace_member(e.workspace_id))
    )
    and (meeting_id is null or can_access_meeting(meeting_id))
  );

drop policy if exists "entity_links_update" on entity_links;
create policy "entity_links_update" on entity_links for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from entities e
      where e.id = entity_id
        and (e.user_id = (select auth.uid()) or is_workspace_member(e.workspace_id))
    )
  );
