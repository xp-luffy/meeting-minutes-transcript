# Intelligence Layer

## Messy Input
Raw meeting transcript: unstructured dialogue, speaker labels inconsistent, resolutions embedded in conversation, action items stated informally.

## Structured Output (auto-extracted)
```json
{
  "attendance": [
    {"name": "Dato' Ahmad Fauzi", "role": "Chairman", "present": true}
  ],
  "quorum_met": true,
  "resolutions": [
    {
      "number": "BD-2025-01",
      "text": "RESOLVED that...",
      "outcome": "carried",
      "confidence": 0.92
    }
  ],
  "action_items": [
    {
      "description": "Finalise SPA for Syntek acquisition",
      "owner": "Legal Counsel",
      "due_date": "2025-06-30",
      "confidence": 0.88
    }
  ],
  "minutes_body_html": "<h2>Minutes of Board Meeting...</h2>"
}
```

## v1 Events Tracked
- Transcript submitted
- Draft generated (confidence score stored)
- Resolution confidence < 0.75 → flagged for review
- Action item with no owner → flagged
- Draft status changed

## Scoring Rules (rule-based first)
- Confidence < 0.75 → highlight in amber, show `review_status = unreviewed`
- No resolution extracted → warn cosec before export
- Missing quorum statement → warn

## v1 vs Later
**v1:** Single GPT-4o prompt, confidence from logprobs/model self-report, rule-based flags
**Later:** Fine-tuned prompt per meeting type, multi-pass extraction, precedent matching from past minutes
