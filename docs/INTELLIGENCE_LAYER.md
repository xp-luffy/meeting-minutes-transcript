# Intelligence Layer

## Messy Input
Raw meeting transcript: speaker labels inconsistent, agenda items mixed with side discussion, resolutions buried in prose, action owners implied not stated.

## Auto-Structured Output (v1)
```json
{
  "attendance": [{"name": "Dato Sri Lim", "role": "Chairman", "present": true}],
  "quorum_met": true,
  "deliberations": [{"agenda_item": "1. Approval of Previous Minutes", "summary": "..."}],
  "resolutions": [{
    "text": "RESOLVED that the audited financial statements for FY2024 be adopted.",
    "type": "ordinary",
    "outcome": "passed",
    "source": "openai-gpt4o",
    "confidence": 0.91
  }],
  "action_items": [{
    "description": "File annual return by 31 Aug",
    "owner": "Company Secretary",
    "due_date": "2024-08-31",
    "confidence": 0.85
  }],
  "minutes_prose": "<full statutory HTML draft>"
}
```

## Events Tracked
- Transcript submitted
- Generation completed / failed
- Resolution confidence < 0.7 (flag for review)
- Action item owner confidence < 0.75 (flag)

## Scoring Rules (rule-based v1)
- Confidence < 0.70 → `review_status = 'flagged'`, shown in amber in UI
- Confidence ≥ 0.85 → auto-accepted, shown in green
- All AI fields editable by user regardless of score

## v1 vs Later
- **v1:** Single GPT-4o prompt, structured JSON output, flag low-confidence items
- **Later:** Fine-tuned model on Maisca format, per-company template learning, confidence trend dashboard
