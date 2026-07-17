# Test Plan — Meeting Minutes Transcript

## v1 Success Scenario (manual walkthrough)

### Setup
- Open live URL as a logged-out stranger in an incognito window
- Confirm `/meetings` loads with 3 seeded meeting cards (no redirect to login)

### Step 1 — Create a new meeting
1. Click **New Meeting**
2. Fill: Company = "Test Co Sdn Bhd", Type = "Board of Directors", Date = today, Chair = "Ms Tan"
3. Paste a 200-word sample board transcript (include one clear resolution and one action)
4. Click **Save** → expect redirect to `/meetings/[new-id]`
5. Refresh page → meeting still present ✅

### Step 2 — Generate minutes
1. On meeting detail page, click **Generate Minutes**
2. Expect loading spinner during generation (5–20 sec)
3. Draft sections render: attendance, quorum, deliberations, resolutions, action items ✅
4. At least 1 resolution card visible with confidence badge ✅
5. At least 1 action item visible with owner field ✅

### Step 3 — Edit and save
1. Click into **Deliberations** section, change one sentence, click **Save**
2. Refresh page → edited text persists ✅
3. Mark resolution as **Reviewed** → badge updates ✅
4. Advance status to **Reviewed** → status badge on dashboard updates ✅

### Step 4 — Export
1. Click **Export DOCX** → file downloads
2. Open in Word → confirm edited deliberation text is present ✅
3. Click **Export PDF** → file downloads and renders all sections ✅

---

## Empty / Error Cases

| Scenario | Expected behaviour |
|---|---|
| `/meetings` with no meetings in DB | Empty state: "No meetings yet — create your first" with New Meeting button |
| Generate clicked with blank transcript | Validation error: "Transcript cannot be empty" — no API call made |
| OpenAI API returns error | Error banner: "Generation failed — please try again"; retry button shown; no partial rows written |
| OpenAI returns malformed JSON | Schema validation rejects response; error shown; draft_status set to `failed` |
| Export clicked before generation | Export button disabled / tooltip: "Generate a draft first" |
| Low-confidence resolution (< 0.60) | Red badge; export blocked until marked reviewed |
| Delete meeting | Confirm dialog → row removed → redirect to `/meetings` → meeting gone from list |
| Section edit save fails (network) | Inline error: "Save failed — your changes are not lost"; retry available |

## Regression Check (run after each sprint)
- Seeded demo rows still visible after migrations
- New meeting form still submits and persists
- Generate still produces draft with sections
- Export still returns correct file
- Status advance still updates badge on dashboard