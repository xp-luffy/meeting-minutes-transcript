# Tasks & Sprints

## Sprint 1 — DB, Seed & Core Engine ✦ v1 functional milestone
**Goal:** A cosec can paste a transcript and get a statutory minutes draft, with no login required.

- [x] Apply migration SQL to Supabase (meetings, transcripts, minutes_drafts, resolutions, action_items, audit_logs)
- [x] Verify seed data renders on homepage (meeting list, demo drafts)
- [x] Build `/meetings` list page — meeting card: company, type, date, status badge
- [x] Build `/meetings/new` form — company, type, date, venue, chairperson, attendees
- [x] Build `/meetings/[id]/transcript` — paste box + upload (txt/docx), saves to `transcripts`
- [x] Build `/api/generate-minutes` server route — calls OpenAI, parses JSON, writes draft + resolutions + action items
- [x] Build `/meetings/[id]/draft` — renders `body_html`, resolutions list, action items list
- [x] All DB writes confirmed (no dead buttons); loading/error/empty states on every page
- [x] Confidence < 0.75 fields highlighted in amber on draft view

**Definition of Done:** Paste the sample Arca Holdings Board Meeting transcript → click Generate → draft appears with ≥1 resolution and ≥1 action item within 30 s → data persists on hard refresh.

---

## Sprint 2 — Editor, Status & Export
**Goal:** Cosec can edit, approve, and export a minutes draft.

- [x] Inline rich-text editor for `body_html` (Tiptap or Quill) — auto-saves on blur
- [x] Editable resolutions: text, number, outcome dropdown
- [x] Editable action items: description, owner, due date, status toggle
- [x] Status buttons: Mark Reviewed / Mark Final (disabled when already final)
- [x] Export to DOCX (server route using `docx` library)
- [x] Export to PDF (server route using `@react-pdf/renderer`)
- [x] Audit log entry on every status change and export
- [x] Manual test: full journey with a 400-word real transcript

**Definition of Done:** Draft edited, marked Final, exported to DOCX — file opens correctly in Word with correct company name, resolutions, and action items.

---

## Sprint 3 — Action Item Dashboard & Attendance Editor
**Goal:** Operational view for tracking open items across meetings.

- [x] `/action-items` page — table of all open action items across meetings, filterable by owner/due date
- [x] Mark action item done inline
- [x] Attendance & quorum section editable on draft (add/remove attendees)
- [x] Regenerate draft button (with confirm dialog — overwrites body_html, increments version)
- [x] Activity feed per meeting (audit_logs rendered)

**Definition of Done:** Action item marked done on dashboard reflects in the meeting draft view without reload.

---

## Sprint 4 — Lock It Down (Auth + RLS)
**Goal:** Per-user data isolation before any real client data is entered.

- [x] Supabase Auth: email/password sign-up and login pages
- [x] Replace permissive RLS policies with `auth.uid() = user_id` owner policies
- [x] Role field on users: admin / cosec / reviewer
- [x] Gate Mark Final to cosec/admin only
- [x] Invite team member flow (Supabase invite email)
- [x] Confirm homepage returns 200 for logged-out stranger (public meeting list remains or redirects cleanly)
- [x] Security checklist: no secrets in client, rate limit on /api/generate-minutes, npm audit run

**Definition of Done:** Two test accounts in different roles — reviewer cannot click Mark Final; admin can. Data from account A not visible to account B.

---

## Gantt (sprint → week)
| Sprint | Week |
|---|---|
| 1 – DB + Core Engine | 1 |
| 2 – Editor + Export | 2 |
| 3 – Dashboard + Attendance | 3 |
| 4 – Lock It Down | 4 |
