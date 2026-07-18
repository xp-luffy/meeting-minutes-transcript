# Handoff — state as of 2026-07-18 (V2)

Live: **https://meeting-minutes-transcript.vercel.app**

## Deploys: AUTO (git reconnected 2026-07-18 after Launchpad loop fixed)
The Launchpad memory-sync bot is in a runaway loop (commits every ~2s to the repo).
Its flood cancels every git-triggered Vercel build before it finishes, so the
Vercel↔GitHub integration is **disconnected**. Deploy with:
```bash
vercel deploy --prod --yes    # from repo root, after `vercel link`
```
To restore auto-deploy: (1) STOP the Launchpad sync loop on your VPS, (2) `vercel git connect`.
`vercel.json` already has an ignoreCommand that skips CLAUDE/AGENTS-only commits once the loop is sane.

## What's built (V2 — insight-driven)
Three product pillars on top of the full v1 app + Maisca house-style:
1. **Assurance engine** — "will these minutes stand up later?" 11 completeness checks
   (quorum, interest declarations, malformed resolutions, undertakings-without-action-items,
   owners/dates, prev-minutes confirmation, close), scored per draft, Mark Final gated on
   unresolved fails with an acknowledge-the-risk flow. `lib/assurance.ts`.
2. **Company memory** — `companies` table, `/companies` (history: meetings, resolutions
   register, open actions), new-meeting picker auto-fills from the company's remembered
   defaults, per-company precedent matching. `lib/companies.ts`.
3. **Confirmation gap** — anonymous "I confirm these minutes are accurate" on `/review/[token]`,
   exposure-days counter on drafts + homepage chips, confirmed-by display. Shrinks the
   meeting→confirmed window from ~90 days to same-day.
Plus: full mobile pass (375px, hamburger nav, viewport meta), scale-tested to 1,000 firms.

## Verified
- Two independent audits (Opus + Codex CLI) — both initially BLOCK; all P1/P2 fixed
  (final-lock IDOR, XSS sanitizer, review-share binding, confirmation cap). docs/AUDIT_V2.md.
- Pilot walkthrough on production: Maisca minutes generate, assurance flags the planted
  owner-less undertaking (score 90/100), anonymous confirmation records, mobile 0-overflow.

## Migrations (all applied to Supabase ntroucqdttcutphnrxqm)
0001–0005 (v1 + Maisca), 0006 (companies/assurance/confirmations/RPCs/indexes),
0007 (scale: indexes + RLS initplan), 0008 (audit hardening: binding triggers, confirm cap).

## AI provider (OpenRouter or OpenAI)
Generation uses any OpenAI-compatible endpoint. In Vercel env set:
- `AI_API_KEY` = OpenRouter key (`sk-or-…`) or OpenAI key
- `AI_BASE_URL` = `https://openrouter.ai/api/v1` (omit for OpenAI default)
- `AI_MODEL` = `openai/gpt-4o`, `anthropic/claude-sonnet-4-5`, etc. (default `gpt-4o`)
Swap models by editing `AI_MODEL` + redeploy. Legacy `OPENAI_API_KEY` still works. With no key set, the deterministic rule-based engine runs.

## Env caveats
- No AI key in Vercel yet → rule-based engine (add `AI_API_KEY` per above for LLM generation).
- No SMTP in Supabase Auth → real signups stall at email confirmation.
- Enable "leaked password protection" in Supabase Auth (advisor WARN).

## New-device setup
```bash
git clone https://github.com/xp-luffy/meeting-minutes-transcript && cd meeting-minutes-transcript
bun install
vercel link --project meeting-minutes-transcript --yes
vercel env pull .env.local --yes
bun dev
```

## QA data in DB (delete when done)
QA accounts xienpuo+qa-cosec@ (cosec) / xienpuo+qa-reviewer@ (reviewer), and their
test meetings/companies/workspace ("Maisca", "Maisca Secretarial", Nusantara, etc.).
