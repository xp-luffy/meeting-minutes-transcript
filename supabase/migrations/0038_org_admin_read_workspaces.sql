-- 0038 — the workspaces row 0037 missed.
--
-- 0037 granted an org admin read over every domain table except `workspaces`,
-- leaving orphaned workspaces after a leaver just as invisible as the records
-- were before 0037. Same rule, same scope, one table.

create policy org_admin_read on public.workspaces
  for select to authenticated using (public.is_org_admin(org_id));
