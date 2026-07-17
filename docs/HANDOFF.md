# Handoff — state as of 2026-07-17

Live: **https://meeting-minutes-transcript.vercel.app** (Vercel project `meeting-minutes-transcript`, GitHub integration connected — pushes to `main` auto-deploy).

## What's built
All of docs/TASKS.md Sprints 1–4, plus the "Later" items from ARCHITECTURE / INTELLIGENCE / AGENTIC docs:
team workspaces (join-by-ID v1), DOCX transcript upload (`/api/parse-docx`), Tiptap draft editor,
per-meeting-type statutory templates + 4-pass rule-based extraction, precedent matching panel,
token-gated read-only review shares (`/review/[token]`, 14-day expiry).
PRD v1 non-goals intentionally not built (audio, e-sign, SSM filing, billing, integrations, co-editing).

## Getting set up on a new device
```bash
git clone https://github.com/xp-luffy/meeting-minutes-transcript
cd meeting-minutes-transcript
bun install
vercel link --project meeting-minutes-transcript --yes
vercel env pull .env.local --yes
bun dev
```

## Database (Supabase project ntroucqdttcutphnrxqm)
- Migrations 0001–0004 in `supabase/migrations/` are ALL applied to the live DB (via MCP `apply_migration`).
  0002 reconciled a pre-existing schema variant; don't run 0001 against the live DB.
- RLS is live: demo rows (`user_id IS NULL`) are public read-only; writes require auth;
  workspace members share access to workspace meetings; roles live in `profiles`
  (admin/cosec/reviewer — reviewer cannot Mark Final).

## Environment caveats
- **No `OPENAI_API_KEY` in Vercel** → generation uses the deterministic rule-based engine
  (`lib/minutes-engine.ts`, source `rule_based_v1`). Add the key in Vercel env to enable GPT-4o
  (type-aware prompt, zod-validated, engine stays as fallback).
- **No SMTP configured in Supabase Auth** → real signups stall at email confirmation; the
  built-in mailer is rate-limited. Configure an SMTP provider before onboarding real users.
- No `SUPABASE_SERVICE_ROLE_KEY` in env → invites are shareable-link/auto-join only.

## QA accounts (delete when done)
- `xienpuo+qa-cosec@onlyaiwork.com` (role cosec) / `xienpuo+qa-reviewer@onlyaiwork.com` (role reviewer),
  created directly in `auth.users` pre-confirmed. Their test meetings (Cosec Own Co, Reviewer Co,
  Nusantara Ventures, Maisca Demo Holdings + workspace "Maisca Secretarial") are QA data.

## Repo quirks
- A Launchpad bot pushes frequent `chore: sync CLAUDE.md/AGENTS.md` commits to `main` —
  always `git pull --rebase` before pushing.
- `next.config.ts` ignores TS/lint errors at build time; `bun run typecheck` is the real gate.
