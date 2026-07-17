# Security

## Secrets
- `OPENAI_API_KEY` in Vercel environment variables only — never imported in any client component
- Supabase service-role key used only in server actions/API routes
- Anon key safe for client (RLS is the gate)

## Permission Model
- **v1 (demo):** Permissive RLS — all rows readable and writable without login; safe for internal team preview only
- **Lock-down sprint:** Policies replaced with `auth.uid() = user_id`; sign-up invite-only for Cosec team
- Roles planned: `cosec` (full access), `reviewer` (read + status change, no delete)

## Approved Tools Rule
Agent calls only the four named tools (`openai_chat_completion`, `supabase_db_write`, `docx_renderer`, `pdf_renderer`). No `eval`, no raw shell, no dynamic tool resolution.

## Audit Principle
Every AI generation, status transition, and export writes a row to `audit_logs` with actor, action, target, and timestamp. Logs are append-only (no delete policy on that table).

## Known Gaps (state plainly)
- Prompt-injection via malicious transcript content — mitigated by system-prompt separation; not fully penetration-tested
- PDF renderer (puppeteer) runs server-side; sandbox it or use a managed service before production
- Rate-limiting on Generate endpoint: implement in Sprint 4, not Sprint 1
