# Security

## Secrets
- `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables only — never in client bundle or logs
- All AI calls go through `/api/generate-minutes` server route; client receives only the response

## Permissions (v1 → lock-down)
- **v1:** permissive RLS (open read/write) for demo — no PII should be entered during this phase
- **Lock-down sprint:** RLS policies replaced with `auth.uid() = user_id`; service-role key used only in server routes
- Agent inherits session user's permissions — no privilege escalation

## Approved Tools Only
- Only `openai_chat_completion`, `supabase_db_write`, `docx_export`, `pdf_export` are callable from the generation route
- No `eval`, `exec`, or arbitrary HTTP calls from the AI response path
- AI response is parsed into a typed schema before any DB write — raw model output never executed

## Prompt Injection Mitigation
- System prompt instructs model to output only valid JSON; response validated against Zod schema before use
- Transcript content is user-supplied text — treated as data, not instruction

## Audit
- Every `generate_minutes_draft` and status change writes to `audit_logs`
- Export actions logged with timestamp and user_id

## What Cannot Be Verified Pre-Launch
- Penetration testing and full npm audit should be run by a qualified person before real client data is entered
- Rate limiting on `/api/generate-minutes` must be confirmed active in Vercel
