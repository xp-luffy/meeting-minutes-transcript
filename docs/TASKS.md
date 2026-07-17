# Tasks & Sprints — Meeting Minutes Transcript

## Sprint 1 — Database, demo data, dashboard (Week 1, Days 1–2)
**Goal:** App loads at `/meetings` showing real seeded data. All CRUD works. No login required.

- [ ] Apply migration SQL to Supabase project
- [ ] Verify 3 seeded meetings, transcripts, resolutions, action items load from DB
- [ ] Build `/meetings` page: meeting cards with company, type, date, status badge
- [ ] Build `/meetings/new` form: company name, type, date, chairperson, transcript paste area
- [ ] `POST /api/meetings` — saves meeting + transcript, redirects to `/meetings/[id]`
- [ ] Build `/meetings/[id]` page: transcript panel + draft status + tabs (Draft / Resolutions / Actions)
- [ ] Edit and delete meeting from dashboard
- [ ] Handle loading, empty (no meetings yet), and error states on all pages

**Definition of Done:** `/meetings` renders 3 seeded cards without login; new meeting form saves and appears in list; delete removes the row.

---

## Sprint 2 — AI generation engine ✅ v1 functional milestone (Week 1, Days 3–4)
**Goal:** Paste a transcript, click Generate, get a structured minutes draft persisted to DB.

- [ ] `POST /api/generate` — sends transcript to OpenAI GPT-4o with structured output schema
- [ ] Parse JSON response; validate schema; write `minutes_drafts`, `resolutions`, `action_items` rows
- [ ] Store `source`, `confidence`, `review_status` on every AI-generated field
- [ ] Render draft sections on `/meetings/[id]` — attendance, quorum, deliberations, resolutions, actions
- [ ] Inline section editor: click to edit, save via `PATCH /api/minutes-drafts/[id]`
- [ ] Resolutions tab: list with confidence badge, mover/seconder, edit inline, mark reviewed
- [ ] Action items tab: list with owner, due date, open/closed toggle
- [ ] Status bar: Draft → Reviewed → Final buttons with confirmation
- [ ] Loading spinner during generation; error message if OpenAI fails; retry button
- [ ] Low-confidence flags (< 0.75 yellow, < 0.60 red) shown on resolution/action rows

**Definition of Done:** Cosec pastes real transcript, clicks Generate, draft sections appear with ≥1 resolution and ≥1 action item, edits one section, saves, refreshes — edit persists.

---

## Sprint 3 — Export and action item management (Week 2, Days 1–2)
**Goal:** Cosec can export finalized minutes as DOCX and PDF.

- [ ] `GET /api/export/[meetingId]/docx` — builds DOCX from DB rows, returns file download
- [ ] `GET /api/export/[meetingId]/pdf` — builds PDF, returns file download
- [ ] Export buttons on `/meetings/[id]` (visible when status = reviewed or final)
- [ ] DOCX template: statutory header, attendance table, quorum statement, deliberations, numbered resolutions, action items table
- [ ] Action items: bulk close, filter by status, edit owner/due date inline
- [ ] Empty state: meeting exists but no transcript — show prompt to add transcript

**Definition of Done:** Exported DOCX opens in Word and contains edited section content matching the DB; PDF renders all sections.

---

## Sprint 4 — Lock it down (Week 2, Days 3–4)
**Goal:** Auth, roles, per-user data isolation. Safe for real cosec data.

- [ ] Enable Supabase Auth (email/password)
- [ ] Sign-up and login pages; redirect after auth
- [ ] Populate `user_id` on all new records
- [ ] Replace permissive v1 RLS with `auth.uid() = user_id` owner policies
- [ ] Role model: Admin, Cosec, Reviewer — stored in `user_metadata` or profiles table
- [ ] Reviewer role: read-only (no edit, no generate, no export without Cosec role)
- [ ] Protect all API write routes: 401 if unauthenticated
- [ ] Run npm audit; fix critical CVEs; confirm API key not in client bundle
- [ ] Add rate limit (5 req/min) on `/api/generate`

**Definition of Done:** Logged-out user cannot write any record; two users cannot see each other's meetings; Reviewer cannot trigger generation.

---

## Sprint 5 — Polish and reliability (Week 3)
**Goal:** Custom templates, comments, reminders, audit log.

- [ ] Custom minutes templates per meeting type (Board, AGM, EGM, Committee)
- [ ] Inline comment threads on draft sections
- [ ] Action item email reminders (Resend)
- [ ] Audit log table + viewer page (Admin only)
- [ ] Pagination on meetings list (>20 meetings)
- [ ] Security red-team: prompt injection test with adversarial transcript

**Definition of Done:** Audit log shows every generate/export/status-change event with timestamp and actor.

---

## Gantt
```
Sprint 1  |##########|              (DB + dashboard + CRUD)
Sprint 2  |          |##########|   (AI engine — v1 functional)
Sprint 3  |          |          |########| (Export)
Sprint 4  |          |          |        |########| (Auth + lock-down)
Sprint 5  |          |          |        |        |########| (Polish)
          Day1      Day3       Day6     Day8     Day10    Day15
```