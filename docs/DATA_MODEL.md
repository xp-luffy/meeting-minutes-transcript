# Data Model

## meetings
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | owner; nullable until lock-down |
| company_name | text | |
| meeting_type | text | Board / AGM / EGM / Committee |
| meeting_date | date | |
| attendees | jsonb | [{name, role, present}] |
| quorum_met | boolean | |
| created_at | timestamptz | |

## transcripts
| Field | Type |
|---|---|
| id | uuid PK |
| user_id | uuid nullable |
| meeting_id | uuid FK → meetings |
| raw_text | text |
| file_url | text nullable |
| created_at | timestamptz |

## minutes_drafts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK → meetings | |
| content | text | Rich-text/HTML |
| status | text | draft / reviewed / final |
| content_source | text | 'openai-gpt4o' |
| content_confidence | numeric | 0–1 |
| content_review_status | text | unreviewed / approved |
| created_at | timestamptz | |

## resolutions
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK | |
| resolution_text | text | AI-extracted |
| resolution_source | text | 'openai-gpt4o' |
| resolution_confidence | numeric | |
| resolution_review_status | text | unreviewed / approved |
| resolution_type | text | ordinary / special |
| outcome | text | passed / deferred / rejected |
| created_at | timestamptz | |

## action_items
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK | |
| description | text | |
| owner_name | text | AI-extracted |
| owner_source | text | |
| owner_confidence | numeric | |
| owner_review_status | text | |
| due_date | date nullable | |
| status | text | open / done |
| created_at | timestamptz | |

**RLS:** v1 permissive (all read/write open). Lock-down sprint restricts to `auth.uid() = user_id`.
