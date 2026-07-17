create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  company_name text not null,
  meeting_type text not null,
  meeting_date date not null,
  venue text,
  chairperson text,
  attendees jsonb,
  quorum_met boolean default true,
  status text not null default 'draft'
);
alter table meetings enable row level security;
drop policy if exists "meetings_v1_read" on meetings;
create policy "meetings_v1_read" on meetings for select using (true);
drop policy if exists "meetings_v1_write" on meetings;
create policy "meetings_v1_write" on meetings for all using (true) with check (true);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid references meetings(id) on delete cascade,
  raw_text text not null,
  source_type text not null default 'paste',
  word_count integer
);
alter table transcripts enable row level security;
drop policy if exists "transcripts_v1_read" on transcripts;
create policy "transcripts_v1_read" on transcripts for select using (true);
drop policy if exists "transcripts_v1_write" on transcripts;
create policy "transcripts_v1_write" on transcripts for all using (true) with check (true);

create table if not exists minutes_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid references meetings(id) on delete cascade,
  transcript_id uuid references transcripts(id),
  body_html text,
  body_html_source text default 'openai_gpt4o',
  body_html_confidence numeric,
  body_html_review_status text default 'unreviewed',
  status text not null default 'draft',
  reviewed_at timestamptz,
  finalised_at timestamptz,
  version integer not null default 1
);
alter table minutes_drafts enable row level security;
drop policy if exists "minutes_drafts_v1_read" on minutes_drafts;
create policy "minutes_drafts_v1_read" on minutes_drafts for select using (true);
drop policy if exists "minutes_drafts_v1_write" on minutes_drafts;
create policy "minutes_drafts_v1_write" on minutes_drafts for all using (true) with check (true);

create table if not exists resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid references meetings(id) on delete cascade,
  resolution_number text,
  resolution_text text not null,
  resolution_text_source text default 'openai_gpt4o',
  resolution_text_confidence numeric,
  resolution_text_review_status text default 'unreviewed',
  outcome text not null default 'carried'
);
alter table resolutions enable row level security;
drop policy if exists "resolutions_v1_read" on resolutions;
create policy "resolutions_v1_read" on resolutions for select using (true);
drop policy if exists "resolutions_v1_write" on resolutions;
create policy "resolutions_v1_write" on resolutions for all using (true) with check (true);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid references meetings(id) on delete cascade,
  description text not null,
  description_source text default 'openai_gpt4o',
  description_confidence numeric,
  description_review_status text default 'unreviewed',
  owner_name text,
  due_date date,
  item_status text not null default 'open'
);
alter table action_items enable row level security;
drop policy if exists "action_items_v1_read" on action_items;
create policy "action_items_v1_read" on action_items for select using (true);
drop policy if exists "action_items_v1_write" on action_items;
create policy "action_items_v1_write" on action_items for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  payload jsonb
);
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

insert into meetings (id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status) values
  ('a1000000-0000-0000-0000-000000000001', 'Arca Holdings Sdn Bhd', 'Board Meeting', '2025-05-15', 'Level 12, Menara Arca, Kuala Lumpur', 'Dato'' Ahmad Fauzi bin Ismail', '[{"name":"Dato'' Ahmad Fauzi bin Ismail","role":"Chairman"},{"name":"Ms Priya Nair","role":"Executive Director"},{"name":"Mr Lim Wei Keong","role":"Independent Director"},{"name":"Ms Sarah Tan","role":"Company Secretary"}]', true, 'final'),
  ('a1000000-0000-0000-0000-000000000002', 'Arca Holdings Sdn Bhd', 'Audit Committee Meeting', '2025-06-02', 'Boardroom A, Level 12, Menara Arca', 'Mr Lim Wei Keong', '[{"name":"Mr Lim Wei Keong","role":"Chairman, Audit Committee"},{"name":"Encik Razif Othman","role":"Member"},{"name":"Ms Sarah Tan","role":"Company Secretary"}]', true, 'reviewed'),
  ('a1000000-0000-0000-0000-000000000003', 'Meridian Capital Bhd', 'Extraordinary General Meeting', '2025-06-18', 'Grand Ballroom, The Majestic Hotel, KL', 'Tan Sri Vijay Ramasamy', '[{"name":"Tan Sri Vijay Ramasamy","role":"Chairman"},{"name":"Ms Nur Aina Zulkifli","role":"Company Secretary"},{"name":"Shareholders","role":"Various"}]', true, 'draft');

insert into transcripts (id, meeting_id, raw_text, source_type, word_count) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Chairman: I call this meeting to order at 10:02 AM. A quorum is present. Moving to agenda item 3 — approval of Q1 financials. CFO presented the management accounts for Q1 2025 showing revenue of RM 12.4M. Directors discussed the variance in OPEX. Ms Priya proposed we approve the accounts. Mr Lim seconded. All in favour. Carried unanimously. Next, the proposed acquisition of Syntek Sdn Bhd for RM 4.2M. Legal counsel summarised due diligence. Board discussed risks. Resolved to approve subject to satisfactory completion of legal conditions precedent. Action: Legal to finalise SPA by 30 June 2025. Meeting closed at 11:45 AM.', 'paste', 120),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Chairman Lim called the meeting to order at 3:00 PM. Internal audit report for Q1 reviewed. No material findings. External auditors'' fees for FY2025 discussed and approved at RM 185,000. Committee noted management letter points from prior year — all resolved. Action: Finance to circulate updated risk register by 15 June 2025. Meeting adjourned 4:15 PM.', 'paste', 75),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Chairman called EGM to order at 10:00 AM. Proxy forms verified — quorum confirmed. Resolution 1: Proposed share consolidation on basis of 2 existing shares into 1 new share. Shareholder questions addressed by CFO. Poll conducted. Resolution carried with 78.3% in favour. Resolution 2: Proposed renewal of shareholders mandate for recurrent related-party transactions. Carried with 91.2% in favour. No other business. Meeting closed 11:30 AM.', 'paste', 88);

insert into minutes_drafts (id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '<h2>Minutes of Board Meeting</h2><p><strong>Company:</strong> Arca Holdings Sdn Bhd<br><strong>Date:</strong> 15 May 2025<br><strong>Venue:</strong> Level 12, Menara Arca, Kuala Lumpur</p><h3>1. Attendance &amp; Quorum</h3><p>A quorum being present, the Chairman declared the meeting duly constituted.</p><h3>2. Approval of Q1 2025 Financial Statements</h3><p>The Board reviewed and discussed the management accounts for Q1 2025 reflecting revenue of RM 12.4M. After deliberation, it was resolved that the Q1 2025 financial statements be and are hereby approved.</p><h3>3. Proposed Acquisition of Syntek Sdn Bhd</h3><p>The Board considered the due diligence findings on the proposed acquisition of Syntek Sdn Bhd for RM 4.2M. It was resolved that the acquisition be approved subject to satisfactory fulfilment of all legal conditions precedent.</p><h3>4. Action Items</h3><p>Legal counsel to finalise the Sale and Purchase Agreement by 30 June 2025.</p>', 'openai_gpt4o', 0.91, 'reviewed', 'final'),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', '<h2>Minutes of Audit Committee Meeting</h2><p><strong>Company:</strong> Arca Holdings Sdn Bhd<br><strong>Date:</strong> 2 June 2025</p><h3>1. Internal Audit Report Q1 2025</h3><p>The Committee noted the internal audit report with no material findings.</p><h3>2. External Auditors'' Fees FY2025</h3><p>It was resolved that the external audit fee for FY2025 be approved at RM 185,000.</p><h3>3. Action Items</h3><p>Finance team to circulate updated risk register by 15 June 2025.</p>', 'openai_gpt4o', 0.88, 'unreviewed', 'reviewed'),
  ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', '<h2>Minutes of Extraordinary General Meeting</h2><p><strong>Company:</strong> Meridian Capital Bhd<br><strong>Date:</strong> 18 June 2025</p><h3>1. Quorum</h3><p>Proxy forms verified. Quorum duly confirmed.</p><h3>2. Resolution 1 – Share Consolidation</h3><p>RESOLVED that the share consolidation on the basis of every 2 existing ordinary shares into 1 new ordinary share be and is hereby approved. (Carried: 78.3% in favour)</p><h3>3. Resolution 2 – Shareholders'' Mandate for RRPT</h3><p>RESOLVED that the renewal of shareholders'' mandate for recurrent related-party transactions be and is hereby approved. (Carried: 91.2% in favour)</p>', 'openai_gpt4o', 0.93, 'unreviewed', 'draft');

insert into resolutions (id, meeting_id, resolution_number, resolution_text, resolution_text_source, resolution_text_confidence, resolution_text_review_status, outcome) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'BD-2025-01', 'RESOLVED that the Q1 2025 management accounts of Arca Holdings Sdn Bhd reflecting revenue of RM 12.4M be and are hereby approved.', 'openai_gpt4o', 0.92, 'reviewed', 'carried'),
  ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'BD-2025-02', 'RESOLVED that the proposed acquisition of Syntek Sdn Bhd for a purchase consideration of RM 4.2M be and is hereby approved, subject to satisfactory fulfilment of all conditions precedent.', 'openai_gpt4o', 0.90, 'reviewed', 'carried'),
  ('d1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'AC-2025-01', 'RESOLVED that the external audit fee for FY2025 be approved at RM 185,000.', 'openai_gpt4o', 0.89, 'unreviewed', 'carried'),
  ('d1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'EGM-2025-01', 'RESOLVED that the share consolidation on the basis of every 2 existing ordinary shares into 1 new ordinary share be and is hereby approved.', 'openai_gpt4o', 0.94, 'unreviewed', 'carried'),
  ('d1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 'EGM-2025-02', 'RESOLVED that the renewal of the shareholders'' mandate for recurrent related-party transactions be and is hereby approved.', 'openai_gpt4o', 0.93, 'unreviewed', 'carried');

insert into action_items (id, meeting_id, description, description_source, description_confidence, description_review_status, owner_name, due_date, item_status) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Finalise Sale and Purchase Agreement for Syntek Sdn Bhd acquisition.', 'openai_gpt4o', 0.91, 'reviewed', 'Legal Counsel', '2025-06-30', 'open'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Circulate updated risk register to Audit Committee members.', 'openai_gpt4o', 0.88, 'unreviewed', 'Finance Team', '2025-06-15', 'done'),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'File EGM resolutions with SSM within the statutory period.', 'openai_gpt4o', 0.90, 'unreviewed', 'Ms Nur Aina Zulkifli', '2025-07-02', 'open');