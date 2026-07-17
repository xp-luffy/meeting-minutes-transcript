# Plan V3 — The Graph / Obligation Engine (2026-07-18)

## Thesis
Minutes are not isolated documents — they are a graph over time. The value is in the
*edges*, especially edges that point at a future obligation. V3 turns the pile of
independent minutes into a connected record that surfaces obligations, contradictions,
and conflicts that are invisible one-document-at-a-time.

Prerequisite (invisible but foundational): **entity resolution** — "Dato' Ahmad Fauzi",
"Dato Ahmad", and "the Chairman" are one node.

## Architecture

### New tables (migration 0009 — orchestrator applies + SQL-backfills before agents start)
- `entities` — canonical people/orgs (graph nodes): kind, canonical_name, normalized_name,
  aliases[], reg_no. Owner/workspace scoped (like companies).
- `entity_links` — typed edges: entity → {meeting|company|resolution|action_item|entity},
  relation (attended/chaired/director/secretary/shareholder/owner/counterparty/subject),
  meeting_id (for RLS scoping), valid_from/to. This IS the graph.
- `obligations` — derived statutory duties: kind (ssm_filing/mandate_renewal/dividend_payment/
  matters_arising/confirm_previous/custom), title, detail, due_date, status (open/done/waived),
  source (rule id). RLS via can_access_meeting.
- All RLS uses `(select auth.uid())`; indexes on hot paths; pg_trgm on normalized_name.

### Engines (framework-free, unit-tested in scratchpad)
- `lib/entities.ts` — normalize (strip honorifics Dato'/Datuk/Mr/Ms/Encik/Tan Sri; resolve
  "the Chairman" against the attendee list), fuzzy-match to canonical entity (trigram in TS),
  create/link. `resolveEntitiesForMeeting(supabase, meetingId)`.
- `lib/obligations.ts` — `deriveObligations({meeting, resolutions, actionItems, transcript})`
  → Obligation[]: appointment/resignation→SSM filing; RRPT/buyback/"mandate"→renewal before
  next AGM; dividend→payment; "matters arising"/open actions→carry-forward; previous-minutes→
  confirm. Each with a computed due_date + rule source.
- `lib/consistency.ts` — dangling references ("as previously approved" with no prior approval
  in record), quorum stated ≠ required, contradictions → check results.
- `lib/conflicts.ts` — reads the directorship graph: a resolution counterparty/subject that is
  an org where a meeting attendee is also a director/shareholder → undeclared-interest flag.

## Sprint V3-1 — feature pillars (4 parallel specialists, Sonnet)
| # | Workstream | Owns | 
|---|---|---|
| A | Entity resolution engine | `lib/entities.ts`, scratchpad tests |
| B | Obligation engine + register | `lib/obligations.ts`, `app/api/generate-minutes/route.ts` (derive obligations + call entity resolution post-generation), `app/obligations/**` (register page + actions + toggle), `app/meetings/[id]/draft/obligations-panel.tsx` (unmounted) |
| C | Graph-powered detection | `lib/consistency.ts`, `lib/conflicts.ts`, `app/meetings/[id]/draft/governance-risk-panel.tsx` (unmounted) |
| D | Entity pages + local graph viz | `app/people/**` (list + `[id]`), `app/people/ego-graph.tsx` (dependency-free SVG local ego-graph, ≤40 nodes), wire people/directors into `app/companies/[id]/page.tsx` |

Orchestrator wires panels into draft page + nav links (layout.tsx) after agents finish (avoids contention). Contract: agents import from `lib/entities.ts` (read the exported signatures), never edit each other's files, never edit lib/types.ts.

## Sprint V3-2 — mobile + polish (2 agents, Sonnet)
New surfaces (obligations register, people pages, ego-graph, new panels) responsive at 375px;
ego-graph must be pannable/legible or gracefully degrade to a list on small screens.

## Sprint V3-3 — scale sim (Sonnet)
1,000 firms incl. entities/entity_links/obligations at volume; EXPLAIN hot paths
(obligations register, people ego-graph queries, conflict detection); apply fixes; cleanup.

## V3-4 — audit (Opus adversarial + Codex CLI second model)
Focus: RLS on 3 new tables, entity_links meeting scoping, obligation status mutation auth,
conflict-detection data leakage across scopes, ego-graph query injection, no new XSS surface.

## V3-5 — pilot + deploy
Browser pilot: generate a meeting whose transcript contains a director-appointment (→ SSM
obligation), an RRPT mandate (→ renewal obligation), and a counterparty an attendee directs
(→ conflict flag); verify obligations register, governance-risk panel, people ego-graph, and
that entity resolution merged the aliased chairman. Mobile re-run. Regression: V2 assurance +
Maisca still green. Deploy via `vercel deploy --prod --yes` (git still disconnected — Launchpad
bot loop). Verify production.

## Decision authority
User away; orchestrator resolves stalemates + final calls. Codex available (CLI v0.142.5).
