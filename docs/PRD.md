# Product Requirements — Meeting Minutes Transcript

## Problem
Drafting statutory board/committee minutes from a raw transcript is slow and error-prone. Company secretaries spend hours reformatting deliberations, resolutions, and action items into the required legal structure.

## Target Users
Company secretaries (Cosecs) and support staff at Maisca member firms who draft board, AGM/EGM, and committee minutes.

## Core Objects
- **Meeting** — company, type (Board/AGM/EGM/Committee), date, attendees, quorum status
- **Transcript** — raw pasted or uploaded text, linked to a Meeting
- **MinutesDraft** — generated statutory document, status (draft → reviewed → final), editable content
- **Resolution** — extracted item, type (ordinary/special), mover, seconder, outcome
- **ActionItem** — task, owner, due date, status, linked to a Meeting

## MVP Checklist (v1 must-haves)
- [ ] Create a Meeting with metadata (company, type, date, attendees)
- [ ] Paste or upload a transcript
- [ ] AI generates a statutory-format minutes draft (attendance & quorum, deliberations, resolutions, action items)
- [ ] Edit the draft in-browser (rich text)
- [ ] Export draft to DOCX and PDF
- [ ] View extracted Resolutions and Action Items as structured lists
- [ ] Mark draft status: draft → reviewed → final
- [ ] Shared access — multiple team members see all meetings

## Non-Goals (v1)
Live audio capture, e-signatures, SSM filing, billing, Zoom/Fireflies sync, per-user data isolation (Sprint 5).

## Success Criteria
A cosec pastes a real 2,000-word board meeting transcript, clicks **Generate Minutes**, and within 60 seconds receives a correctly structured draft with resolutions and action items extracted — requiring only minor edits before export.
