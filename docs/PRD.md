# PRD — Meeting Minutes Transcript

## Problem
Drafting statutory board/committee minutes from a meeting transcript is slow and error-prone. Company secretaries spend hours reformatting raw transcripts into properly structured minutes with resolutions, quorum statements, and action items.

## Target User
Company secretaries (Cosecs) and cosec support staff drafting board, AGM/EGM, and committee minutes — primarily Maisca members.

## Core Objects
- **Meeting** — company, type, date, attendees, quorum
- **Transcript** — raw pasted or uploaded text
- **Minutes Draft** — AI-generated statutory document (editable, versioned, status-tracked)
- **Resolution** — extracted resolution text, number, outcome
- **Action Item** — extracted task, owner, due date, status

## MVP Must-Haves
- [ ] Paste or upload a transcript against a meeting record
- [ ] Generate a statutory minutes draft via AI (attendance, deliberations, resolutions, action items)
- [ ] View and inline-edit the draft
- [ ] Status workflow: draft → reviewed → final
- [ ] Export to DOCX and PDF
- [ ] Seed demo meetings visible without login

## Non-Goals (v1)
Live audio transcription, e-signatures, SSM filing, billing, Fireflies/Zoom sync, real-time multi-user editing.

## Definition of Done
A cosec pastes a real ~500-word transcript, clicks **Generate Minutes**, and within 30 seconds sees an editable, properly formatted minutes draft with at least one resolution and one action item extracted — which they can edit, mark as reviewed, and export to DOCX. All data persists on refresh.
