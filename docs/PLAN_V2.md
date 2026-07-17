# Plan V2 — Insight-Driven Build (2026-07-18)

Approved insights driving this phase:
1. **Defensibility** — minutes are insurance documents; the product guarantee is "nothing legally required is missing."
2. **Portfolio memory** — a cosec's asset is per-company institutional memory; the app must remember each company.
3. **Confirmation gap** — the window between meeting and confirmed minutes is exposure; shrink 90 days to 24 hours.

## Dev plan (Sprint V2-1 — feature pillars, parallel specialists)

| Workstream | Scope | Specialist | Model |
|---|---|---|---|
| A. Assurance engine | `lib/assurance.ts` completeness checks per meeting type (quorum stated, interest declarations, resolutions well-formed w/ outcome+number, every undertaking has an action item, previous-minutes confirmation, close recorded); report stored per draft (`assurance_reports`); Assurance panel on draft; Mark Final soft-gate with audit-logged acknowledgement of open flags | Rules/compliance engineer | Sonnet (high effort) |
| B. Company memory | `companies` table + backfill from meetings; `/companies` + `/companies/[id]` (history: meetings, resolutions register, open actions, defaults); new-meeting company picker autofilling venue/chair/attendees/format from last meeting; precedents weighted per-company | Data/product engineer | Sonnet |
| C. Confirmation flow | Acknowledgement on `/review/[token]` ("I confirm these minutes are accurate" → name/role captured via security-definer RPC); confirmations shown on draft + audit; unconfirmed-exposure counter (days since meeting) on draft + homepage badge; "Awaiting confirmation" surfacing | Workflow engineer | Sonnet |
| DB (0006) | companies, assurance_reports, confirmations, RPC confirm_shared_draft, hot-path indexes | Orchestrator | Fable (this session) |

## Sprint V2-2 — UI/UX polish + mobile
| Workstream | Scope | Model |
|---|---|---|
| D. Mobile + shell | Responsive nav (hamburger), homepage + meetings/new/transcript pages on 375px, tables in overflow containers, touch targets ≥44px, form ergonomics | Sonnet |
| E. Draft workspace polish | Draft page + action items + companies/workspaces on mobile; visual hierarchy, empty/loading states, consistent badges | Sonnet |

## Sprint V2-3 — 1,000-firm simulation & optimization
- Seed synthetic scale via SQL (SIM-prefixed: ~1,000 firms → ~20k meetings, ~60k resolutions, ~40k action items) in an isolated sim user scope.
- EXPLAIN ANALYZE hot paths (homepage, action items, precedents, company history); apply pagination + index fixes; re-measure; delete SIM data.
- Specialist: Performance engineer — Sonnet. Verification via Supabase MCP.

## Audit plan (Sprint V2-4)
1. Supabase advisors (security + performance) — orchestrator via MCP.
2. Independent security/code audit of new surface (assurance gate bypass, confirmation RPC abuse, RLS on new tables, token flows) — **Opus** agent, adversarial brief.
3. Engine regression suites (standard + Maisca + assurance) must stay green.
4. External second-model review: OpenAI Codex if CLI/key available on this machine; otherwise a second independent Opus pass substitutes (documented).

## Test plan (Sprint V2-5 — "Pilot")
Browser walk-through as a pilot cosec firm: sign in → company created from picker → meeting → transcript → generate (Maisca) → assurance panel findings → fix flagged gap → circulate for confirmation → confirm via anonymous token link → exposure counter clears → Mark Final → export DOCX → action items dashboard. Mobile viewport re-run (375px) of the same journey. Regression: original TEST_PLAN.md scenario.

## Deploy
Vercel git integration reconnects only after V2-5 passes (ignoreCommand now on main prevents sync-bot deploy floods). Push → verify production markers + smoke tests.

## Decision authority
User is away; orchestrator (Claude Fable session) resolves stalemates and makes final calls. Known substitutions decided in advance: Codex unavailable → second Opus pass; PILOT = scripted end-to-end pilot journey above.
