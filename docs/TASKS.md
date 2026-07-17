# Tasks & Sprints

## Sprint 1 — DB + Meeting CRUD + Demo Data
**Goal:** Schema live, meetings list renders with seed data (no login needed).
- Run migration SQL on Supabase
- Build `/meetings` list page (loading / empty / seeded states)
- Build Meeting create/edit form (company, type, date, attendees, quorum)
- Confirm seed rows display; create + edit persists to DB
- Error handling on form submit

**Definition of Done:** `/meetings` shows 3 seeded meetings; a new meeting can be created and survives a page refresh.

---

## Sprint 2 — Core Engine: Transcript → Minutes Draft ✦ v1 functional
**Goal:** The one workflow works end-to-end.
- Transcript paste/upload form linked to a meeting
- `/api/generate` server route: sends transcript to GPT-4o, parses JSON response
- Writes `minutes_drafts`, `resolutions`, `action_items` to DB
- Draft view page with rich-text editor (Tiptap); auto-save on change
- Resolutions + Action Items panels beside draft
- Low-confidence items flagged amber
- Loading / error / empty states on Generate button

**Definition of Done:** Paste a real 1,000-word transcript → click Generate → draft + resolutions + action items appear in DB and UI within 90 seconds. Editing draft persists.

---

## Sprint 3 — Export + Status Workflow
**Goal:** Draft can be finalised and exported.
- Status toggle: draft → reviewed → final (confirmed before save)
- Export to DOCX (server-rendered)
- Export to PDF (server-rendered)
- Download triggers; both files open correctly
- Audit log row written on each export and status change

**Definition of Done:** A final-status draft exports to a valid DOCX and PDF containing the full minutes text.

---

## Sprint 4 — Polish, Reliability & Rate-Limiting
**Goal:** Production-ready for daily internal use.
- Rate-limit `/api/generate` (max 10/min per IP)
- Retry + timeout handling on OpenAI call
- Action items: mark open/done, edit owner + due date
- Meeting dashboard: counts of open action items, draft status badge
- Empty states, error banners, loading skeletons throughout
- Basic `npm audit`; no high-severity findings

**Definition of Done:** Generate fails gracefully (timeout shown, no DB partial write); action items updatable; audit passes.

---

## Sprint 5 — Lock It Down (Auth + Per-User RLS)
**Goal:** Real users, real data isolated.
- Supabase Auth (email/password, invite-only)
- Replace permissive RLS policies with `auth.uid() = user_id`
- Assign `user_id` on all writes
- Role model: cosec vs reviewer
- Walk login → create meeting → generate → export as a logged-in stranger on live URL

**Definition of Done:** An unauthenticated request to `/meetings` redirects to `/login`; user A cannot read user B's meetings.

---

## Gantt (rough)
```
Sprint 1 — Week 1 (days 1-2)
Sprint 2 — Week 1 (days 3-5)  ← v1 functional milestone
Sprint 3 — Week 2 (days 1-2)
Sprint 4 — Week 2 (days 3-4)
Sprint 5 — Week 2 (day 5) / Week 3
```
