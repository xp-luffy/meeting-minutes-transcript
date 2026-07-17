# Product Requirements — Meeting Minutes Transcript

## Problem
Drafting statutory board/committee minutes from a raw transcript is slow, error-prone, and requires expert judgment on format. Company secretaries spend hours producing what should be a structured, predictable document.

## Target User
Company secretaries (Cosecs) and cosec support staff — specifically Maisca members who draft Board, AGM/EGM, and Committee minutes regularly.

## Core Objects
| Object | Purpose |
|---|---|
| Meeting | Company, type, date, attendees, quorum, status |
| Transcript | Raw pasted or uploaded text linked to a meeting |
| Minutes Draft | AI-generated, section-structured draft (attendance, quorum, deliberations, resolutions, actions) |
| Resolution | Extracted resolution with mover, seconder, vote outcome, review status |
| Action Item | Extracted task with owner, due date, open/closed status |

## MVP Must-Haves
- [ ] Paste or upload a meeting transcript
- [ ] Trigger AI generation → receive structured minutes draft
- [ ] View draft in section editor (attendance, quorum, deliberations, resolutions, action items)
- [ ] Edit any section and save to database
- [ ] Review and approve individual resolutions and action items
- [ ] Advance meeting status: draft → reviewed → final
- [ ] Export minutes to DOCX and PDF
- [ ] Meetings dashboard showing all meetings and their status
- [ ] Works without login (demo-first; auth added later)

## Non-Goals (v1)
Live audio transcription, Zoom/Teams sync, e-signatures, SSM filing, billing, real-time collaboration, email reminders.

## Success Criteria
A cosec pastes a real 500-word board meeting transcript, clicks Generate, receives a correctly structured minutes draft with at least 2 resolutions and 1 action item extracted, edits one section inline, advances status to Reviewed, and exports a DOCX — all within 5 minutes. The exported document matches the on-screen draft.

## Definition of Done
Pass/fail: a tester can complete the above scenario on the live URL from a fresh browser session with no login, and the exported DOCX contains the edited content persisted in the database.