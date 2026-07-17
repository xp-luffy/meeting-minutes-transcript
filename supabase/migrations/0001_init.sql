create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_name text not null,
  meeting_type text not null,
  meeting_date date not null,
  attendees jsonb not null default '[]',
  quorum_met boolean not null default false,
  created_at timestamptz not null default now()
);
alter table meetings enable row level security;
drop policy if exists "meetings_v1_read" on meetings;
create policy "meetings_v1_read" on meetings for select using (true);
drop policy if exists "meetings_v1_write" on meetings;
create policy "meetings_v1_write" on meetings for all using (true) with check (true);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  meeting_id uuid references meetings(id) on delete cascade,
  raw_text text not null,
  file_url text,
  created_at timestamptz not null default now()
);
alter table transcripts enable row level security;
drop policy if exists "transcripts_v1_read" on transcripts;
create policy "transcripts_v1_read" on transcripts for select using (true);
drop policy if exists "transcripts_v1_write" on transcripts;
create policy "transcripts_v1_write" on transcripts for all using (true) with check (true);

create table if not exists minutes_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  meeting_id uuid references meetings(id) on delete cascade,
  content text not null default '',
  status text not null default 'draft',
  content_source text default 'openai-gpt4o',
  content_confidence numeric,
  content_review_status text default 'unreviewed',
  created_at timestamptz not null default now()
);
alter table minutes_drafts enable row level security;
drop policy if exists "minutes_drafts_v1_read" on minutes_drafts;
create policy "minutes_drafts_v1_read" on minutes_drafts for select using (true);
drop policy if exists "minutes_drafts_v1_write" on minutes_drafts;
create policy "minutes_drafts_v1_write" on minutes_drafts for all using (true) with check (true);

create table if not exists resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  meeting_id uuid references meetings(id) on delete cascade,
  resolution_text text not null,
  resolution_source text default 'openai-gpt4o',
  resolution_confidence numeric,
  resolution_review_status text default 'unreviewed',
  resolution_type text default 'ordinary',
  outcome text default 'passed',
  created_at timestamptz not null default now()
);
alter table resolutions enable row level security;
drop policy if exists "resolutions_v1_read" on resolutions;
create policy "resolutions_v1_read" on resolutions for select using (true);
drop policy if exists "resolutions_v1_write" on resolutions;
create policy "resolutions_v1_write" on resolutions for all using (true) with check (true);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  meeting_id uuid references meetings(id) on delete cascade,
  description text not null,
  owner_name text,
  owner_source text default 'openai-gpt4o',
  owner_confidence numeric,
  owner_review_status text default 'unreviewed',
  due_date date,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table action_items enable row level security;
drop policy if exists "action_items_v1_read" on action_items;
create policy "action_items_v1_read" on action_items for select using (true);
drop policy if exists "action_items_v1_write" on action_items;
create policy "action_items_v1_write" on action_items for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  target_table text,
  target_id uuid,
  payload_summary text,
  risk_level text,
  created_at timestamptz not null default now()
);
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

insert into meetings (id, company_name, meeting_type, meeting_date, attendees, quorum_met) values
  ('a1000000-0000-0000-0000-000000000001', 'Acme Holdings Bhd', 'Board', '2024-06-15', '[{"name":"Dato Sri Lim","role":"Chairman","present":true},{"name":"Ms Priya Nair","role":"Independent Director","present":true},{"name":"Mr Raj Kumar","role":"Executive Director","present":true}]', true),
  ('a1000000-0000-0000-0000-000000000002', 'Sigma Capital Sdn Bhd', 'AGM', '2024-05-20', '[{"name":"Encik Hafiz Zain","role":"Chairman","present":true},{"name":"Puan Siti Aminah","role":"Company Secretary","present":true}]', true),
  ('a1000000-0000-0000-0000-000000000003', 'Meridian Tech Bhd', 'Committee', '2024-07-02', '[{"name":"Dr Wong Mei Lin","role":"Audit Committee Chair","present":true},{"name":"Mr David Tan","role":"Member","present":true}]', true);

insert into transcripts (meeting_id, raw_text) values
  ('a1000000-0000-0000-0000-000000000001', 'Chairman: I call this board meeting to order. Quorum is confirmed with three directors present. First item — approval of minutes from the previous meeting. All in favour? Carried. Second item — financial results. CFO presented FY2024 audited accounts. After discussion, Raj Kumar proposed adoption. Seconded by Priya Nair. All in favour. Carried unanimously. Action: Company Secretary to file within 30 days.'),
  ('a1000000-0000-0000-0000-000000000002', 'Chairman: AGM convened at 10am. Quorum confirmed. Ordinary Resolution 1 — re-election of directors. Proposed by Hafiz, seconded by Siti. Passed. Ordinary Resolution 2 — re-appointment of auditors Messrs Grant Hassan. Proposed and seconded. Passed. No other business. Meeting closed 10:45am.');

insert into minutes_drafts (meeting_id, content, status, content_source, content_confidence, content_review_status) values
  ('a1000000-0000-0000-0000-000000000001', '<h1>Minutes of Board Meeting — Acme Holdings Bhd</h1><p>Date: 15 June 2024</p><h2>1. Attendance & Quorum</h2><p>Quorum confirmed. Three directors present.</p><h2>2. Approval of Previous Minutes</h2><p>Minutes of the previous meeting were confirmed and adopted.</p><h2>3. Financial Results</h2><p>The Board reviewed and adopted the FY2024 audited financial statements.</p><h2>Resolutions</h2><p>RESOLVED that the audited financial statements for FY2024 be adopted.</p>', 'reviewed', 'openai-gpt4o', 0.92, 'approved'),
  ('a1000000-0000-0000-0000-000000000002', '<h1>Minutes of AGM — Sigma Capital Sdn Bhd</h1><p>Date: 20 May 2024</p><h2>Ordinary Resolution 1</h2><p>Re-election of directors — passed.</p><h2>Ordinary Resolution 2</h2><p>Re-appointment of auditors Messrs Grant Hassan — passed.</p>', 'draft', 'openai-gpt4o', 0.88, 'unreviewed');

insert into resolutions (meeting_id, resolution_text, resolution_source, resolution_confidence, resolution_review_status, resolution_type, outcome) values
  ('a1000000-0000-0000-0000-000000000001', 'RESOLVED that the audited financial statements of Acme Holdings Bhd for the financial year ended 31 December 2024 be and are hereby adopted.', 'openai-gpt4o', 0.92, 'approved', 'ordinary', 'passed'),
  ('a1000000-0000-0000-0000-000000000002', 'RESOLVED that the directors of the Company be re-elected in accordance with the Company''s Constitution.', 'openai-gpt4o', 0.89, 'unreviewed', 'ordinary', 'passed'),
  ('a1000000-0000-0000-0000-000000000002', 'RESOLVED that Messrs Grant Hassan be re-appointed as auditors of the Company and that the Directors be authorised to fix their remuneration.', 'openai-gpt4o', 0.91, 'unreviewed', 'ordinary', 'passed');

insert into action_items (meeting_id, description, owner_name, owner_source, owner_confidence, owner_review_status, due_date, status) values
  ('a1000000-0000-0000-0000-000000000001', 'File audited financial statements with SSM within 30 days of adoption.', 'Company Secretary', 'openai-gpt4o', 0.88, 'approved', '2024-07-15', 'open'),
  ('a1000000-0000-0000-0000-000000000001', 'Circulate signed minutes to all directors within 14 days.', 'Company Secretary', 'openai-gpt4o', 0.85, 'unreviewed', '2024-06-29', 'open'),
  ('a1000000-0000-0000-0000-000000000002', 'Issue AGM notice to shareholders for next year''s meeting by April 2025.', 'Puan Siti Aminah', 'openai-gpt4o', 0.72, 'unreviewed', '2025-04-01', 'open');