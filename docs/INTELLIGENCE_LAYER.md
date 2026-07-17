# Intelligence Layer — Meeting Minutes Transcript

## Messy Input
Raw transcript: unstructured speaker-tagged text, varying quality, abbreviations, Malaysian legal terms, mixed English/Malay, missing mover/seconder names, informal vote descriptions.

## Auto-Structure Schema (AI → JSON)
```json
{
  "attendance": [
    {"name": "Tan Sri Ahmad Razali", "designation": "Chairman", "present": true}
  ],
  "apologies": [
    {"name": "Dato Seri Faiz Othman", "designation": "NED"}
  ],
  "quorum_met": true,
  "quorum_required": 3,
  "quorum_present": 4,
  "deliberations": "The Board reviewed Q1 financials...",
  "resolutions": [
    {
      "number": "1/2025",
      "text": "That the Company engage an external procurement consultant.",
      "mover": "Encik Rashid",
      "seconder": "Ms Priya Nair",
      "outcome": "Carried unanimously",
      "type": "ordinary",
      "confidence": 0.92
    }
  ],
  "action_items": [
    {
      "description": "Shortlist procurement consultants for Board approval.",
      "owner": "CFO",
      "due_date": "2025-05-16",
      "confidence": 0.88
    }
  ]
}
```

## Events to Track
- Transcript submitted (word count, source type)
- Generation triggered (model, prompt version)
- Generation completed or failed (duration, token count)
- Section edited post-generation (which section, before/after length)
- Resolution review_status changed
- Minutes exported (format)

## Scoring Rules (v1 — rule-based)
- Confidence < 0.75 → flag for mandatory cosec review (yellow badge)
- Confidence < 0.60 → flag as low confidence (red badge, block export until reviewed)
- Resolution missing mover or seconder → flag incomplete
- Action item missing owner → flag unassigned

## What Gets Ranked
- Resolutions sorted by confidence ascending (lowest first in review list)
- Action items sorted: unassigned owner first, then by due date

## v1 vs Later
**v1:** Single OpenAI call, structured JSON output, rule-based confidence flags
**Later:** Fine-tuned prompt per meeting type, multi-pass extraction, similarity check against prior resolutions, automatic resolution numbering from company register