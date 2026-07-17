# Agentic Layer

## Risk Levels & Actions

### Low Risk — Auto-execute
- `generate_minutes_draft` — call OpenAI, parse response, write draft + resolutions + action items to DB
- `flag_low_confidence` — mark fields with confidence < 0.75 as `review_status = unreviewed`
- `auto_number_resolutions` — assign resolution numbers sequentially per meeting

### Medium Risk — Shown to user, one-click confirm
- `regenerate_draft` — overwrites existing draft body; user confirms before overwrite
- `mark_final` — locks the draft; user clicks Finalise button

### High Risk — Explicit approval required
- `export_to_docx` / `export_to_pdf` — generates file for download; user initiates
- *(future)* `send_draft_for_review` — emails draft to board members

### Human-Only (never automated)
- Delete a finalised minutes record
- Amend a resolution on a final minutes document
- Any SSM lodgement action

## Named Tools (v1)
- `openai_chat_completion` — server-side only, scoped to minutes generation
- `supabase_db_write` — all DB writes via Supabase client with RLS
- `docx_export` — server route, no external call
- `pdf_export` — server route, no external call

## Audit Log Fields
`entity_type`, `entity_id`, `action`, `payload`, `user_id`, `created_at`
Every draft generation and status change writes an audit row.

## v1 vs Later
**v1:** generate + flag + number (all low-risk, auto)
**Later:** email distribution (high), SSM filing (human-only)
