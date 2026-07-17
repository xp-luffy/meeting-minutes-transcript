# Data Model — Meeting Minutes Transcript

## meetings
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | owner (populated at lock-down sprint) |
| company_name | text | |
| meeting_type | text | Board, AGM, EGM, Audit Committee, etc. |
| meeting_date | date | |
| location | text | |
| chairperson | text | |
| attendees | jsonb | [{name, designation}] |
| apologies | jsonb | [{name, designation}] |
| quorum_met | boolean | |
| quorum_required | int | |
| quorum_present | int | |
| status | text | draft / reviewed / final |
| created_at | timestamptz | |

## transcripts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK → meetings | cascade delete |
| raw_text | text | full transcript |
| source_type | text | paste / upload |
| file_url | text nullable | Supabase Storage path |
| word_count | int | |
| created_at | timestamptz | |

## minutes_drafts
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK → meetings | |
| attendance_section | text | editable |
| quorum_section | text | editable |
| deliberations_section | text | editable |
| resolutions_section | text | editable |
| actions_section | text | editable |
| full_draft_md | text | full markdown draft |
| full_draft_source | text | **AI field** — model name |
| full_draft_confidence | numeric | **AI field** — 0–1 |
| full_draft_review_status | text | **AI field** — unreviewed / reviewed / approved |
| ai_model | text | |
| ai_prompt_version | text | |
| generation_status | text | pending / running / complete / failed |
| review_status | text | unreviewed / reviewed / final |
| reviewed_by | text | |
| reviewed_at | timestamptz | |
| export_docx_url | text | |
| export_pdf_url | text | |
| created_at | timestamptz | |

## resolutions
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK → meetings | |
| resolution_number | text | e.g. 1/2025 |
| resolution_text | text | **AI field** |
| resolution_text_source | text | **AI field** |
| resolution_text_confidence | numeric | **AI field** |
| resolution_text_review_status | text | **AI field** — unreviewed / reviewed / approved |
| mover | text | |
| seconder | text | |
| vote_outcome | text | Carried / Defeated / Carried unanimously |
| resolution_type | text | ordinary / special |
| created_at | timestamptz | |

## action_items
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| meeting_id | uuid FK → meetings | |
| description | text | **AI field** |
| description_source | text | **AI field** |
| description_confidence | numeric | **AI field** |
| description_review_status | text | **AI field** — unreviewed / reviewed / approved |
| owner | text | |
| due_date | date | |
| status | text | open / closed |
| created_at | timestamptz | |

## RLS
All tables: RLS enabled. v1 permissive policies (select + all) — any visitor can read/write. Lock-down sprint replaces with `auth.uid() = user_id`.