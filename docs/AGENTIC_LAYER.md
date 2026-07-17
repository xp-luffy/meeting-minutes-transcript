# Agentic Layer

## Risk Levels & Actions

### Low — Auto-execute (no approval)
- `generate_minutes_draft` — calls GPT-4o, writes draft + resolutions + action items to DB
- `flag_low_confidence_items` — marks items with confidence < 0.70 as 'flagged'
- `auto_save_draft` — patches `minutes_drafts.content` on edit debounce

### Medium — Shown to user before save
- `update_draft_status` — promote draft → reviewed → final (user clicks confirm)
- `bulk_approve_resolutions` — mark all flagged resolutions as approved

### High — Explicit user approval required
- `export_final_document` — generates and streams DOCX/PDF (irreversible download)

### Critical — Human only
- `delete_meeting` — removes meeting + all child records; requires confirmation modal + cannot be undone by agent

## Named Tools (server-side only)
- `openai_chat_completion` — structured prompt → JSON
- `supabase_db_write` — all DB mutations
- `docx_renderer` — DOCX generation
- `pdf_renderer` — PDF generation

## Audit Log Fields
`id, actor_user_id, action, target_table, target_id, payload_summary, risk_level, created_at`

Every Generate, status change, and export is logged.

## v1 vs Later
- **v1:** generate_minutes_draft + export only
- **Later:** scheduled action-item reminders (email), re-generate on transcript edit
