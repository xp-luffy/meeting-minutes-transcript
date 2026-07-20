-- 0022 — remove the ZZ-PILOT records created while testing on 2026-07-20.
--
-- Matched on an explicit test prefix, children before parents. Never delete by
-- a shared attribute: doing so destroyed real data on another project, and the
-- rule is in docs/PILOT_PLAYBOOK.md for that reason.
--
-- Storage objects are NOT removed here: Supabase blocks direct deletion from
-- storage tables (storage.protect_delete). One private orphan remains in the
-- company-documents bucket and needs the Storage API or the dashboard.
do $$
declare mids uuid[]; cids uuid[];
begin
  select array_agg(id) into mids from meetings where company_name like 'ZZ-PILOT%';
  select array_agg(id) into cids from companies where name like 'ZZ-PILOT%';
  if mids is null then mids := '{}'; end if;
  if cids is null then cids := '{}'; end if;

  delete from entity_links      where meeting_id = any(mids);
  delete from assurance_reports where meeting_id = any(mids);
  delete from review_shares     where meeting_id = any(mids);
  delete from obligations       where meeting_id = any(mids);
  delete from action_items      where meeting_id = any(mids);
  delete from resolutions       where meeting_id = any(mids);
  delete from minutes_drafts    where meeting_id = any(mids);
  delete from transcripts       where meeting_id = any(mids);
  delete from audit_logs        where meeting_id = any(mids);
  delete from company_documents where company_id = any(cids);
  delete from meetings          where id = any(mids);
  delete from companies         where id = any(cids);

  delete from entities e
   where e.kind = 'person'
     and e.canonical_name in ('Mr Pilot Chair','Ms Pilot Sec')
     and not exists (select 1 from entity_links l where l.entity_id = e.id);
end $$;
