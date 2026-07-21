-- 0037 — an organisation admin can see their own organisation's records.
--
-- WHY THIS IS REQUIRED, not a nicety. The rule is that the organisation owns
-- the data and a leaver does not take it with them. Without this, "staying with
-- the organisation" is technically true and practically useless: the records
-- remain in the org and become invisible to EVERY human in it, because
-- visibility was still per-user. A firm would lose sight of its own statutory
-- records the day a secretary resigned.
--
-- THIS IS A WIDENING, and the only one in this work. Scoped as tightly as it
-- can be while still delivering the rule:
--   * admins and owners only — a plain member sees exactly what they saw before
--   * own organisation only — the restrictive org_isolation policy from 0030
--     still ANDs over the top, so this cannot reach another tenant
--   * UPDATE only on companies and meetings, so an admin can reassign an
--     orphaned record's owner. No blanket write access to minutes or drafts: an
--     admin overseeing the book is not the same as an admin editing the
--     statutory record, and only the second one is forgery.

create policy org_admin_read on public.companies for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.entities for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.workspaces for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.meetings for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.transcripts for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.minutes_drafts for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.resolutions for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.action_items for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.obligations for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.entity_links for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.assurance_reports for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.audit_logs for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.company_documents for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.review_shares for select to authenticated using (public.is_org_admin(org_id));
create policy org_admin_read on public.confirmations for select to authenticated using (public.is_org_admin(org_id));

-- Reassignment of an orphaned record's owner.
create policy org_admin_reassign on public.companies for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy org_admin_reassign on public.meetings  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
