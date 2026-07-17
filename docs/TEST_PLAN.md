# Test Plan

## Success Scenario (manual walk-through)
1. Open app homepage — meeting list shows 3 demo meetings without login ✓
2. Click **New Meeting** → fill in company name, type=Board, date, chairperson, 3 attendees → Save
3. On meeting page, paste a 200-word mock transcript → click **Save Transcript**
4. Click **Generate Minutes** → spinner shows → within 30 s draft appears
5. Verify draft contains: meeting heading, attendance list, ≥1 resolution in RESOLVED THAT format, ≥1 action item with owner
6. Edit one resolution text inline → click outside → reload page → edit persists
7. Click **Mark Reviewed** → status badge updates → click **Mark Final** → edit fields disable
8. Click **Export DOCX** → file downloads → open in Word → correct company name and resolutions present
9. Click **Export PDF** → file downloads → renders correctly
10. Check `audit_logs` in Supabase: generation event + status-change events present

## Empty States
- New meeting with no transcript → transcript page shows empty state with **Paste Transcript** prompt, no Generate button
- Generate called but OpenAI returns no resolutions → warning banner: "No resolutions extracted — please review transcript"

## Error Cases
- OpenAI API key missing/invalid → server returns 500 → UI shows "Minutes generation failed. Try again."
- Transcript > 15,000 tokens → server truncates and warns user before generating
- Export with empty `body_html` → Export button disabled with tooltip "Draft is empty"
- DB write fails → toast error "Save failed — your changes were not stored"

## Confidence Flag Check
- Seed a resolution with `confidence = 0.60` → verify amber highlight visible on draft page
- Approve it (click Accept on flag) → `review_status` updates to `approved` in DB

## Regression Check (after each sprint)
- Re-run steps 1–5 above; confirm prior sprint features still work after each new deploy
