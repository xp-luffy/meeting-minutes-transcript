# Agentic Layer — Meeting Minutes Transcript

## Risk Classification

### Low — Auto-execute (no approval needed)
- **extract_structure:** Parse transcript → structured JSON fields (attendance, resolutions, actions) and write to DB with confidence scores
- **flag_low_confidence:** Set `review_status = 'flagged'` on any AI field with confidence < 0.75
- **generate_draft_sections:** Assemble section text from structured data and write to `minutes_drafts`

### Medium — Show result, one-click confirm
- **update_meeting_status:** Advance status from `draft → reviewed → final` (shown to cosec, confirmed with button)
- **assign_action_owner:** AI suggests owner from attendee list; cosec confirms before saving

### High — Always requires explicit approval
- **export_and_share:** Generate DOCX/PDF and send via email to attendees (not v1 — requires approval flow)
- **overwrite_reviewed_section:** Replace a section the cosec has already marked reviewed

### Critical — Human only
- **delete_meeting:** Permanent deletion of meeting + all linked records
- **finalise_minutes:** Advance to `final` status (irreversible; requires cosec role)

## Named Tools (v1)
- `openai.chat.completions` — structured extraction only, called server-side
- `supabase.storage.upload` — transcript file upload
- `docx.build` — DOCX generation from DB rows
- `pdf.render` — PDF generation from DB rows

## Audit Log Fields
Each meaningful action logs: `action_type`, `actor_id` (null pre-auth), `target_table`, `target_id`, `before_value` (jsonb), `after_value` (jsonb), `timestamp`, `ip_address`.

## v1 vs Later
**v1:** Auto-extract + flag; manual status advance; manual export
**Later:** Email distribution with approval gate; resolution cross-reference against company register; SSM filing agent (critical — human-only approval)