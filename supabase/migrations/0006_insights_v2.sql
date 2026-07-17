-- V2 pillars: company memory, assurance reports, confirmations + hot-path indexes.

-- Pillar B: companies (per-owner/workspace institutional memory)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  workspace_id uuid references workspaces(id),
  name text not null,
  reg_no text,
  defaults jsonb, -- {venue, chairperson, attendees, minutes_format, meeting_type}
  created_at timestamptz not null default now()
);
alter table companies enable row level security;
drop policy if exists "companies_read" on companies;
create policy "companies_read" on companies for select
  using (user_id is null or auth.uid() = user_id or is_workspace_member(workspace_id));
drop policy if exists "companies_insert" on companies;
create policy "companies_insert" on companies for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "companies_update" on companies;
create policy "companies_update" on companies for update to authenticated
  using (auth.uid() = user_id or is_workspace_member(workspace_id))
  with check (auth.uid() = user_id or is_workspace_member(workspace_id));

alter table meetings add column if not exists company_id uuid references companies(id);

-- Backfill: one company per distinct (owner-scope, name) across existing meetings
insert into companies (user_id, workspace_id, name)
select distinct m.user_id, m.workspace_id, m.company_name
from meetings m
where m.company_id is null and m.company_name is not null
on conflict do nothing;

update meetings m
set company_id = c.id
from companies c
where m.company_id is null
  and c.name = m.company_name
  and c.user_id is not distinct from m.user_id
  and c.workspace_id is not distinct from m.workspace_id;

-- Pillar A: assurance reports (latest completeness check per draft)
create table if not exists assurance_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  draft_id uuid not null references minutes_drafts(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  results jsonb not null, -- [{key,label,status:'pass'|'warn'|'fail',detail}]
  score numeric,
  acknowledged_at timestamptz,
  acknowledged_note text,
  created_at timestamptz not null default now()
);
alter table assurance_reports enable row level security;
drop policy if exists "assurance_read" on assurance_reports;
create policy "assurance_read" on assurance_reports for select
  using (user_id is null or auth.uid() = user_id or can_access_meeting(meeting_id));
drop policy if exists "assurance_insert" on assurance_reports;
create policy "assurance_insert" on assurance_reports for insert to authenticated
  with check (auth.uid() = user_id and can_access_meeting(meeting_id));
drop policy if exists "assurance_update" on assurance_reports;
create policy "assurance_update" on assurance_reports for update to authenticated
  using (auth.uid() = user_id or can_access_meeting(meeting_id))
  with check (auth.uid() = user_id or can_access_meeting(meeting_id));

-- Pillar C: confirmations captured from token-holders (chairman etc.)
create table if not exists confirmations (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references review_shares(id) on delete cascade,
  draft_id uuid not null references minutes_drafts(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  confirmed_name text not null,
  confirmed_role text,
  confirmed_at timestamptz not null default now()
);
alter table confirmations enable row level security;
drop policy if exists "confirmations_read" on confirmations;
create policy "confirmations_read" on confirmations for select
  using (can_access_meeting(meeting_id));
-- No direct insert policy: anonymous token-holders insert via the RPC below.

create or replace function confirm_shared_draft(share_token text, p_name text, p_role text)
returns table (confirmed_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_share review_shares%rowtype;
begin
  select * into v_share from review_shares
  where token = share_token and expires_at > now();
  if not found then
    raise exception 'invalid or expired share token';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'name required';
  end if;
  -- one confirmation per share per name (idempotent-ish)
  if exists (select 1 from confirmations c where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name))) then
    return query select c.confirmed_at from confirmations c
      where c.share_id = v_share.id and lower(c.confirmed_name) = lower(trim(p_name)) limit 1;
    return;
  end if;
  return query
  insert into confirmations (share_id, draft_id, meeting_id, confirmed_name, confirmed_role)
  values (v_share.id, v_share.draft_id, v_share.meeting_id, trim(p_name), nullif(trim(coalesce(p_role,'')), ''))
  returning confirmations.confirmed_at;
end;
$$;

-- Extend the shared-draft lookup so the review page can show confirmation state
drop function if exists get_shared_draft(text); -- return type changes
create or replace function get_shared_draft(share_token text)
returns table (
  company_name text, meeting_type text, meeting_date date, venue text,
  body_html text, body_html_source text, status text, version integer, expires_at timestamptz,
  already_confirmed_by text[]
)
language sql
security definer set search_path = public
stable
as $$
  select m.company_name, m.meeting_type, m.meeting_date, m.venue,
         d.body_html, d.body_html_source, d.status, d.version, rs.expires_at,
         coalesce((select array_agg(c.confirmed_name) from confirmations c where c.share_id = rs.id), '{}')
  from review_shares rs
  join minutes_drafts d on d.id = rs.draft_id
  join meetings m on m.id = rs.meeting_id
  where rs.token = share_token and rs.expires_at > now();
$$;

-- Hot-path indexes for portfolio scale
create index if not exists idx_meetings_user on meetings(user_id);
create index if not exists idx_meetings_workspace on meetings(workspace_id);
create index if not exists idx_meetings_company on meetings(company_id);
create index if not exists idx_meetings_date on meetings(meeting_date desc);
create index if not exists idx_transcripts_meeting on transcripts(meeting_id, created_at desc);
create index if not exists idx_drafts_meeting_version on minutes_drafts(meeting_id, version desc);
create index if not exists idx_resolutions_meeting on resolutions(meeting_id);
create index if not exists idx_actions_meeting on action_items(meeting_id);
create index if not exists idx_actions_status_due on action_items(item_status, due_date);
create index if not exists idx_audit_meeting_time on audit_logs(meeting_id, created_at desc);
create index if not exists idx_assurance_draft on assurance_reports(draft_id, created_at desc);
create index if not exists idx_confirmations_meeting on confirmations(meeting_id);
create index if not exists idx_companies_scope on companies(user_id, workspace_id, name);

-- Security hardening (advisor findings, applied as separate migration security_hardening_advisors):
-- trigger function must not be REST-callable; pg_trgm out of public schema.
revoke execute on function handle_new_user() from public, anon, authenticated;
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
