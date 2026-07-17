create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_name text not null,
  meeting_type text not null,
  meeting_date date not null,
  location text,
  chairperson text,
  attendees jsonb,
  apologies jsonb,
  quorum_met boolean,
  quorum_required int,
  quorum_present int,
  status text not null default 'draft',
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
  source_type text not null default 'paste',
  file_url text,
  word_count int,
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
  attendance_section text,
  quorum_section text,
  deliberations_section text,
  resolutions_section text,
  actions_section text,
  full_draft_md text,
  ai_model text,
  ai_prompt_version text,
  generation_status text not null default 'pending',
  review_status text not null default 'unreviewed',
  reviewed_by text,
  reviewed_at timestamptz,
  finalised_at timestamptz,
  export_docx_url text,
  export_pdf_url text,
  full_draft_source text,
  full_draft_confidence numeric,
  full_draft_review_status text default 'unreviewed',
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
  resolution_number text,
  resolution_text text not null,
  mover text,
  seconder text,
  vote_outcome text,
  resolution_type text,
  resolution_text_source text,
  resolution_text_confidence numeric,
  resolution_text_review_status text default 'unreviewed',
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
  owner text,
  due_date date,
  status text not null default 'open',
  description_source text,
  description_confidence numeric,
  description_review_status text default 'unreviewed',
  created_at timestamptz not null default now()
);
alter table action_items enable row level security;
drop policy if exists "action_items_v1_read" on action_items;
create policy "action_items_v1_read" on action_items for select using (true);
drop policy if exists "action_items_v1_write" on action_items;
create policy "action_items_v1_write" on action_items for all using (true) with check (true);

insert into meetings (id, company_name, meeting_type, meeting_date, location, chairperson, attendees, apologies, quorum_met, quorum_required, quorum_present, status) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Maju Berhad', 'Board of Directors', '2025-04-15', 'Boardroom, Level 32, Menara Maju, Kuala Lumpur', 'Tan Sri Ahmad Razali', '[{"name":"Tan Sri Ahmad Razali","designation":"Chairman"},{"name":"Datin Seri Lim Peck Yin","designation":"Executive Director"},{"name":"Encik Rashid Mohd Noor","designation":"Independent Non-Executive Director"},{"name":"Ms Priya Nair","designation":"Independent Non-Executive Director"}]', '[{"name":"Dato Seri Faiz Othman","designation":"Non-Executive Director"}]', true, 3, 4, 'reviewed'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Awan Hijau Sdn Bhd', 'Audit Committee', '2025-04-22', 'Meeting Room 3A, Shah Alam Office', 'Mr Lee Chin Huat', '[{"name":"Mr Lee Chin Huat","designation":"Chairman, Audit Committee"},{"name":"Puan Suraya Abdul Hamid","designation":"Member"},{"name":"Mr David Raj","designation":"Member"}]', '[]', true, 2, 3, 'draft'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Techvance Global Bhd', 'Annual General Meeting', '2025-05-02', 'Grand Ballroom, Hotel Istana, Kuala Lumpur', 'Datuk Seri Ng Wei Lun', '[{"name":"Datuk Seri Ng Wei Lun","designation":"Chairman"},{"name":"Ms Kavitha Subramaniam","designation":"Group CEO"},{"name":"Encik Hairul Azmi","designation":"CFO"}]', '[]', true, 5, 3, 'draft');

insert into transcripts (meeting_id, raw_text, source_type, word_count) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Chairman: I call this meeting to order. We have quorum with four directors present. Dato Seri Faiz has tendered his apologies. First item on the agenda — approval of the minutes of the previous meeting. All in favour? Agreed. Second item — quarterly financials. The CFO presented Q1 results showing revenue of RM 12.4 million, up 8% year on year. The Board discussed cost controls. Rashid proposed we engage an external consultant to review procurement. Priya seconded. Agreed unanimously. Third item — dividend declaration. The Board resolved to declare an interim dividend of 3 sen per share. Mover: Datin Seri Lim. Seconder: Encik Rashid. Passed. Any other business — none. Meeting closed at 3:45 PM.', 'paste', 120),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Chairman Lee called the meeting to order at 2:00 PM. Quorum confirmed — all three members present. Agenda item 1: Review of internal audit report on procurement controls. The internal auditor walked the committee through findings. Three high-risk items identified. Suraya asked management to provide remediation plan within 30 days. Agreed. Agenda item 2: External auditor fees for FY2025 recommended at RM 185,000. Proposed by David, seconded by Suraya. Approved. Action: CFO to issue engagement letter to auditors by 30 April 2025. Meeting adjourned at 3:30 PM.', 'paste', 95),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Chairman Datuk Seri Ng declared the AGM open at 10:00 AM. The company secretary confirmed sufficient proxies received. Quorum declared. Resolution 1 — adoption of audited financial statements for FY2024. Show of hands: all in favour. Carried. Resolution 2 — re-election of Encik Hairul Azmi as director. Proposed by chairman. Carried. Resolution 3 — approval of directors'' remuneration of RM 2.1 million. Proposed. Two abstentions noted. Carried. No questions from the floor. Meeting closed at 11:15 AM.', 'paste', 88);

insert into minutes_drafts (meeting_id, attendance_section, quorum_section, deliberations_section, resolutions_section, actions_section, generation_status, review_status, full_draft_source, full_draft_confidence, full_draft_review_status) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Present: Tan Sri Ahmad Razali (Chairman), Datin Seri Lim Peck Yin (Executive Director), Encik Rashid Mohd Noor (INED), Ms Priya Nair (INED). Apologies: Dato Seri Faiz Othman (NED).', 'A quorum of four (4) directors was present. The Chairman declared the meeting duly constituted.', 'The Board noted Q1 revenue of RM 12.4 million, an increase of 8% year-on-year. The Board discussed cost management initiatives and agreed to engage an external procurement consultant.', 'RESOLVED that the Company engage an external consultant to review procurement processes (Proposed: Encik Rashid; Seconded: Ms Priya Nair; Carried unanimously). RESOLVED that an interim dividend of 3 sen per ordinary share be declared (Proposed: Datin Seri Lim; Seconded: Encik Rashid; Carried unanimously).', 'Action: CFO to identify and shortlist procurement consultants for Board approval — Owner: CFO — Due: 16 May 2025.', 'complete', 'reviewed', 'openai-gpt-4o', 0.91, 'reviewed'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Present: Mr Lee Chin Huat (Chairman), Puan Suraya Abdul Hamid, Mr David Raj.', 'All three members of the Audit Committee were present. Quorum confirmed.', 'The Committee reviewed the internal audit report on procurement controls. Three high-risk findings were noted. Management was directed to submit a remediation plan within 30 days. External auditor fees for FY2025 were presented and approved at RM 185,000.', 'RESOLVED that the external auditor fees for FY2025 be approved at RM 185,000 (Proposed: Mr David Raj; Seconded: Puan Suraya; Carried).', 'Action: CFO to issue engagement letter to external auditors — Owner: CFO — Due: 30 April 2025. Action: Management to submit procurement remediation plan — Owner: Head of Procurement — Due: 22 May 2025.', 'complete', 'unreviewed', 'openai-gpt-4o', 0.87, 'unreviewed');

insert into resolutions (meeting_id, resolution_number, resolution_text, mover, seconder, vote_outcome, resolution_type, resolution_text_source, resolution_text_confidence, resolution_text_review_status) values
  ('a1b2c3d4-0001-0001-0001-000000000001', '1/2025', 'That the Company engage an external consultant to review procurement processes.', 'Encik Rashid Mohd Noor', 'Ms Priya Nair', 'Carried unanimously', 'ordinary', 'openai-gpt-4o', 0.92, 'reviewed'),
  ('a1b2c3d4-0001-0001-0001-000000000001', '2/2025', 'That an interim dividend of 3 sen per ordinary share be declared for the financial quarter ended 31 March 2025.', 'Datin Seri Lim Peck Yin', 'Encik Rashid Mohd Noor', 'Carried unanimously', 'ordinary', 'openai-gpt-4o', 0.95, 'reviewed'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'AC-1/2025', 'That the external auditor fees for FY2025 be approved at RM 185,000.', 'Mr David Raj', 'Puan Suraya Abdul Hamid', 'Carried', 'ordinary', 'openai-gpt-4o', 0.89, 'unreviewed'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'AGM-1/2025', 'Adoption of the audited financial statements for the financial year ended 31 December 2024.', 'Chairman', null, 'Carried', 'ordinary', 'openai-gpt-4o', 0.93, 'unreviewed'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'AGM-2/2025', 'Re-election of Encik Hairul Azmi as Director of the Company.', 'Chairman', null, 'Carried', 'ordinary', 'openai-gpt-4o', 0.90, 'unreviewed'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'AGM-3/2025', 'Approval of Directors'' remuneration of RM 2,100,000 for FY2025.', 'Chairman', null, 'Carried (two abstentions)', 'ordinary', 'openai-gpt-4o', 0.88, 'unreviewed');

insert into action_items (meeting_id, description, owner, due_date, status, description_source, description_confidence, description_review_status) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Identify and shortlist procurement consultants for Board approval.', 'CFO', '2025-05-16', 'open', 'openai-gpt-4o', 0.88, 'reviewed'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Issue engagement letter to external auditors for FY2025.', 'CFO', '2025-04-30', 'open', 'openai-gpt-4o', 0.93, 'unreviewed'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Submit procurement controls remediation plan to Audit Committee.', 'Head of Procurement', '2025-05-22', 'open', 'openai-gpt-4o', 0.85, 'unreviewed');