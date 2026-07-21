-- 0029 — org_id on every domain table, backfilled, then NOT NULL.
--
-- ON EVERY TABLE, not just the roots. The child policies each carry a
-- `user_id = auth.uid()` branch that bypasses the parent chain entirely, so
-- narrowing only companies/meetings would leave that branch as an open
-- cross-org door.
--
-- NOT NULL at the end, after backfill: a row with no organisation must be
-- impossible to create, not merely invisible to everyone.

alter table public.companies add column if not exists org_id uuid references public.organisations(id);
alter table public.entities add column if not exists org_id uuid references public.organisations(id);
alter table public.workspaces add column if not exists org_id uuid references public.organisations(id);
alter table public.meetings add column if not exists org_id uuid references public.organisations(id);
alter table public.transcripts add column if not exists org_id uuid references public.organisations(id);
alter table public.minutes_drafts add column if not exists org_id uuid references public.organisations(id);
alter table public.resolutions add column if not exists org_id uuid references public.organisations(id);
alter table public.action_items add column if not exists org_id uuid references public.organisations(id);
alter table public.obligations add column if not exists org_id uuid references public.organisations(id);
alter table public.entity_links add column if not exists org_id uuid references public.organisations(id);
alter table public.assurance_reports add column if not exists org_id uuid references public.organisations(id);
alter table public.audit_logs add column if not exists org_id uuid references public.organisations(id);
alter table public.company_documents add column if not exists org_id uuid references public.organisations(id);
alter table public.review_shares add column if not exists org_id uuid references public.organisations(id);
alter table public.confirmations add column if not exists org_id uuid references public.organisations(id);
alter table public.gs_settings add column if not exists org_id uuid references public.organisations(id);
alter table public.gs_settings_audit add column if not exists org_id uuid references public.organisations(id);

update public.companies set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.entities set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.workspaces set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.meetings set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.transcripts set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.minutes_drafts set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.resolutions set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.action_items set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.obligations set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.entity_links set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.assurance_reports set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.audit_logs set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.company_documents set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.review_shares set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.confirmations set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.gs_settings set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;
update public.gs_settings_audit set org_id = (select id from public.organisations where slug='drive-funnels') where org_id is null;

alter table public.companies alter column org_id set not null;
alter table public.entities alter column org_id set not null;
alter table public.workspaces alter column org_id set not null;
alter table public.meetings alter column org_id set not null;
alter table public.transcripts alter column org_id set not null;
alter table public.minutes_drafts alter column org_id set not null;
alter table public.resolutions alter column org_id set not null;
alter table public.action_items alter column org_id set not null;
alter table public.obligations alter column org_id set not null;
alter table public.entity_links alter column org_id set not null;
alter table public.assurance_reports alter column org_id set not null;
alter table public.audit_logs alter column org_id set not null;
alter table public.company_documents alter column org_id set not null;
alter table public.review_shares alter column org_id set not null;
alter table public.confirmations alter column org_id set not null;
alter table public.gs_settings alter column org_id set not null;
alter table public.gs_settings_audit alter column org_id set not null;

create index if not exists companies_org_idx on public.companies(org_id);
create index if not exists entities_org_idx on public.entities(org_id);
create index if not exists workspaces_org_idx on public.workspaces(org_id);
create index if not exists meetings_org_idx on public.meetings(org_id);
create index if not exists transcripts_org_idx on public.transcripts(org_id);
create index if not exists minutes_drafts_org_idx on public.minutes_drafts(org_id);
create index if not exists resolutions_org_idx on public.resolutions(org_id);
create index if not exists action_items_org_idx on public.action_items(org_id);
create index if not exists obligations_org_idx on public.obligations(org_id);
create index if not exists entity_links_org_idx on public.entity_links(org_id);
create index if not exists assurance_reports_org_idx on public.assurance_reports(org_id);
create index if not exists audit_logs_org_idx on public.audit_logs(org_id);
create index if not exists company_documents_org_idx on public.company_documents(org_id);
create index if not exists review_shares_org_idx on public.review_shares(org_id);
create index if not exists confirmations_org_idx on public.confirmations(org_id);
create index if not exists gs_settings_org_idx on public.gs_settings(org_id);
create index if not exists gs_settings_audit_org_idx on public.gs_settings_audit(org_id);
