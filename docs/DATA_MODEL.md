# Data Model

## meetings
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | nullable until lock-down |
| company_name | text | |
| meeting_type | text | Board / AGM / EGM / Committee |
| meeting_date | date | |
| venue | text | |
| chairperson | text | |
| attendees | jsonb | [{name, role}] |
| quorum_met | boolean | |
| status | text | draft / reviewed / final |

## transcripts
| Field | Type |
|---|---|
| id | uuid PK |
| meeting_id | uuid FK → meetings |
| raw_text | text |
| source_type | text | paste / upload |
| word_count | integer |

## minutes_drafts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| meeting_id | uuid FK | |
| transcript_id | uuid FK | |
| body_html | text | **AI field** |
| body_html_source | text | e.g. openai_gpt4o |
| body_html_confidence | numeric | 0–1 |
| body_html_review_status | text | unreviewed / approved / amended |
| status | text | draft / reviewed / final |
| version | integer | increments on regenerate |

## resolutions
AI fields: `resolution_text` + `_source` + `_confidence` + `_review_status`
Other: `meeting_id`, `resolution_number`, `outcome` (carried/deferred/lapsed)

## action_items
AI fields: `description` + `_source` + `_confidence` + `_review_status`
Other: `meeting_id`, `owner_name`, `due_date`, `item_status` (open/done)

## audit_logs
`meeting_id`, `entity_type`, `entity_id`, `action`, `payload jsonb`

**RLS:** All tables have permissive v1 policies (read/write open). Lock-down sprint replaces with `auth.uid() = user_id`.
