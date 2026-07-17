# Test Plan

## Success Scenario (manual walkthrough)
1. Open `/meetings` — 3 seeded meetings visible ✓
2. Click **New Meeting** — fill company "Acme Bhd", type "Board", date today, 5 attendees, quorum Yes → Save
3. Meeting appears in list; click to open ✓
4. Click **Add Transcript** — paste 500-word sample board transcript → Save
5. Click **Generate Minutes** — spinner shows; within 90 s draft appears ✓
6. Verify: `minutes_drafts` row in DB with content; at least 1 resolution; at least 1 action item ✓
7. Edit one resolution text in UI → auto-save → refresh page → edit persists ✓
8. Mark draft status **Reviewed** → confirm modal → status badge updates ✓
9. Click **Export DOCX** → file downloads; open in Word — content present ✓
10. Click **Export PDF** → file downloads; opens correctly ✓

## Empty / Error Cases
| Scenario | Expected |
|---|---|
| No transcript saved, click Generate | Error banner: "Please add a transcript first" |
| OpenAI timeout (mock 30 s) | Error banner: "Generation failed — try again"; no partial DB write |
| Meeting list with no meetings | Empty state: "No meetings yet — create your first one" |
| Transcript field blank on submit | Inline validation: "Transcript text is required" |
| Export on draft status (not final) | Warning: "Draft not yet marked as reviewed" + allow override |

## Confidence Flag Check
- Inject a transcript where owner is ambiguous → action item `owner_confidence` < 0.75 → row displays amber badge in UI ✓

## Security Smoke Test
- `OPENAI_API_KEY` not present in any browser network response ✓
- Direct `POST /api/generate` with oversized payload (>50 KB) → 413 response ✓
- After Sprint 5: unauthenticated `GET /api/meetings` → 401 ✓
