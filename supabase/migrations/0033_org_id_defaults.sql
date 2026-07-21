-- 0033 — stamp org_id automatically on insert.
--
-- 0029 made org_id NOT NULL, which broke every INSERT in the application at a
-- stroke: none of them supply it. The fix is a DEFAULT rather than edits to
-- dozens of call sites.
--
-- It cannot be used to forge a row into another organisation: the default only
-- fires when the caller omits org_id, and the restrictive org_isolation policy
-- from 0030 independently rejects any explicit value the caller is not a member
-- of. Defence does not depend on the default.
--
-- current_org_id() returns NULL for the service-role client (no auth.uid()), so
-- server-side writes must still pass org_id explicitly and cannot silently land
-- in an arbitrary tenant.

alter table public.companies alter column org_id set default public.current_org_id();
alter table public.entities alter column org_id set default public.current_org_id();
alter table public.workspaces alter column org_id set default public.current_org_id();
alter table public.meetings alter column org_id set default public.current_org_id();
alter table public.transcripts alter column org_id set default public.current_org_id();
alter table public.minutes_drafts alter column org_id set default public.current_org_id();
alter table public.resolutions alter column org_id set default public.current_org_id();
alter table public.action_items alter column org_id set default public.current_org_id();
alter table public.obligations alter column org_id set default public.current_org_id();
alter table public.entity_links alter column org_id set default public.current_org_id();
alter table public.assurance_reports alter column org_id set default public.current_org_id();
alter table public.audit_logs alter column org_id set default public.current_org_id();
alter table public.company_documents alter column org_id set default public.current_org_id();
alter table public.review_shares alter column org_id set default public.current_org_id();
alter table public.confirmations alter column org_id set default public.current_org_id();
