-- 0030 — the tenant boundary, enforced.
--
-- RESTRICTIVE, NOT PERMISSIVE. Postgres ANDs restrictive policies with the
-- permissive ones already on the table. That buys two things:
--
--   1. It CANNOT widen access. Whatever the existing rule allowed, this only
--      subtracts from. For a change touching every table in a database holding
--      a firm's statutory records, "cannot widen by construction" is worth more
--      than any amount of review.
--   2. It does not require reproducing ~50 existing policy expressions.
--      Rewriting them by hand is precisely how a subtle widening gets
--      introduced.

-- Close the demo-era hole first: `m.user_id is null` made an unowned meeting
-- readable by EVERY authenticated user. Zero such rows existed, so nothing was
-- exposed — but any future insert omitting user_id would have silently
-- published that meeting to every account in the system.
create or replace function public.can_access_meeting(mid uuid)
returns boolean language sql security definer set search_path to 'public' stable as $$
  select mid is not null and exists (
    select 1 from meetings m
    where m.id = mid
      and public.is_org_member(m.org_id)
      and (m.user_id = (select auth.uid()) or public.is_workspace_member(m.workspace_id))
  );
$$;

create or replace function public.can_access_company(cid uuid)
returns boolean language sql security definer set search_path to 'public' stable as $$
  select cid is not null and exists (
    select 1 from companies c
    where c.id = cid
      and public.is_org_member(c.org_id)
      and (c.user_id = (select auth.uid()) or public.is_workspace_member(c.workspace_id))
  );
$$;

-- USING bounds what can be read/updated/deleted; WITH CHECK bounds what can be
-- written — without the latter a user could insert a row INTO another
-- organisation, or move one there.
create policy org_isolation on public.companies as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.entities as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.workspaces as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.meetings as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.transcripts as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.minutes_drafts as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.resolutions as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.action_items as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.obligations as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.entity_links as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.assurance_reports as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.audit_logs as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.company_documents as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.review_shares as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy org_isolation on public.confirmations as restrictive to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- confirmations and review_shares are also reached ANONYMOUSLY via
-- confirm_shared_draft(), which is SECURITY DEFINER and bypasses RLS entirely.
-- These policies are scoped `to authenticated` so that path is untouched: the
-- share token remains the credential for an outside director who has no account
-- and belongs to no organisation.
