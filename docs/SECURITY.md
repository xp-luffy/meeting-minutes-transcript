# Security — Meeting Minutes Transcript

## Secret Handling
- `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stored in Vercel environment variables only — never referenced in client-side code or logged
- All AI calls made from `/api/*` server routes; client receives only the parsed result
- Supabase anon key is safe to expose; service role key is never sent to the browser

## Permission Model (v1 — demo)
- All tables: RLS enabled with permissive v1 policies (read + write open to all)
- No secrets derivable from open RLS — transcripts are not sensitive in demo mode
- Lock-down sprint: replace with `auth.uid() = user_id`; add role check (Admin / Cosec / Reviewer) enforced at row level

## Approved Tools Rule
- Agent calls only named tools: `openai.chat.completions`, `supabase.*`, `docx.build`, `pdf.render`
- No `eval`, `exec`, `run_any`, or dynamic code execution paths
- Transcript text is passed as a user message to OpenAI — prompt-injection risk: system prompt instructs model to output only valid JSON; output is parsed with strict schema validation before DB write; malformed output is rejected, not executed

## Audit Principle
- Every status change, generation trigger, and export event writes an audit row
- Audit rows are append-only (no update/delete RLS for audit_logs table)
- Pre-auth: actor_id is null; post-auth: actor_id = auth.uid()

## What Cannot Be Verified Without a Human
- Prompt-injection resilience under adversarial transcript input — requires manual red-team test
- DOCX/PDF output does not contain injected HTML/script — requires file inspection
- Rate-limiting on `/api/generate` (cost control) — must be confirmed in production config

## Lock-Down Checklist (before real data)
- [ ] Replace v1 RLS policies with owner-scoped policies
- [ ] Add role column to users; enforce Reviewer = read-only at RLS level
- [ ] Run `npm audit`; resolve critical/high CVEs
- [ ] Confirm `OPENAI_API_KEY` not in any client bundle (bundle analysis)
- [ ] Add rate limit (5 requests/minute) on `/api/generate`