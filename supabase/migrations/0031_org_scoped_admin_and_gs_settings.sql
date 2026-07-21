-- 0031 — admin becomes an ORGANISATION role, and the GroundStream credential
-- becomes per-organisation.
--
-- This is the finding that started the work: profiles.role = 'admin' was
-- APP-WIDE, so the single admin could read, rotate or disconnect every firm's
-- GroundStream credential — a tenant-wide write credential belonging to someone
-- else. /integrate §1: "one credential per customer, not per app".

-- is_admin() is NARROWED rather than dropped. Dropping it would break any call
-- site not yet found; narrowing means a missed call site becomes stricter,
-- never looser.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from organisation_members m
    where m.user_id = (select auth.uid()) and m.role in ('owner','admin')
  );
$$;

alter table public.gs_settings drop constraint if exists gs_settings_workspace_key;
create unique index if not exists gs_settings_org_uniq on public.gs_settings(org_id);

drop policy if exists "gs_settings_admin_read"   on public.gs_settings;
drop policy if exists "gs_settings_admin_write"  on public.gs_settings;
drop policy if exists "gs_settings_admin_update" on public.gs_settings;
drop policy if exists "gs_settings_admin_delete" on public.gs_settings;
drop policy if exists "gs_audit_admin_read"      on public.gs_settings_audit;

create policy gs_settings_org_admin_read   on public.gs_settings for select to authenticated using (public.is_org_admin(org_id));
create policy gs_settings_org_admin_write  on public.gs_settings for insert to authenticated with check (public.is_org_admin(org_id));
create policy gs_settings_org_admin_update on public.gs_settings for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy gs_settings_org_admin_delete on public.gs_settings for delete to authenticated using (public.is_org_admin(org_id));
create policy gs_audit_org_admin_read      on public.gs_settings_audit for select to authenticated using (public.is_org_admin(org_id));

-- The workspace lookup becomes per-organisation. The old zero-argument version
-- returned "the first enabled row in the whole table", which with two firms
-- configured would file one firm's confirmations into the other's workspace —
-- exactly the un-undoable mistake /gs §2.1 says to escalate rather than guess.
drop function if exists public.gs_active_workspace();

create or replace function public.gs_active_workspace(p_org uuid)
returns text language sql security definer set search_path = public stable as $$
  select workspace from gs_settings where org_id = p_org and enabled limit 1;
$$;

revoke execute on function public.gs_active_workspace(uuid) from public, anon, authenticated;
