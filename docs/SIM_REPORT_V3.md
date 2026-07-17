# V3 Simulation Report — Graph/Obligation Engine at 1,000-Firm Scale

Date: 2026-07-18
Project: `ntroucqdttcutphnrxqm`
Scope: migration `0009_graph_obligation_engine.sql` (entities, entity_links, obligations) plus the
hot queries in `app/obligations/page.tsx`, `app/people/data.ts`, `lib/conflicts.ts`, `lib/entities.ts`.

All synthetic rows used `user_id = '99999999-9999-4999-8999-999999999999'` (SIM owner) and
`SIM-` name prefixes. No non-SIM row was read, written, or deleted. Baseline counts were recorded
before seeding and the full SIM dataset was deleted at the end of this exercise (verification at
the bottom of this report).

## 1. Baseline (pre-simulation)

| table | count |
|---|---|
| entities | 43 |
| entity_links | 77 |
| obligations | 4 |
| meetings | 13 |
| companies | 11 |
| action_items | 15 |

## 2. Simulated volumes (SIM user)

| table | rows created | notes |
|---|---|---|
| companies | 5,000 | `SIM-Company-1..5000` |
| meetings | 20,000 | 4 meetings/company on average, spread across ~700 days, mixed `meeting_type`/`status` |
| action_items | 20,000 | 1 per meeting, mixed `status`/`item_status`, `owner_name = SIM-Person-N` |
| entities | 35,000 | 30,000 `kind='person'` + 5,000 `kind='org'`; `normalized_name` populated lowercase |
| entity_links | 121,434 | 60,000 person→meeting (attended/chaired), 41,434 person→company (director/shareholder/chairman/member), 20,000 person→action_item (owner) |
| obligations | 40,000 | 2 per meeting; kind mix (statutory_filing/resolution_followup/disclosure/custom); status 60% open / 20% done / 20% waived; due_date spread ±180 days |

**Directorship graph shape:** 50 "hub" people were each linked to 30 companies (1,500 edges) to
simulate interlocking directors; the remaining ~29,950 people received 1–2 company links each
(~39,934 edges). Person entity `0002d41b-9165-45f8-be78-058c038d5199` (hub, rn=1) was used for the
conflict-detection and person-detail traversal tests: 30 company directorships + 2 chaired
meetings.

Deviations from the brief: person→meeting edges came in at 60,000 rather than a smaller number,
and person→company edges at ~41.4k rather than ~40k, to land total entity_links at ~121k (close to
the ~120k target) while still guaranteeing the hub/interlocking-director shape needed for the
conflict-detection test. action_items (20,000) were created (1/meeting) purely as realistic
targets for the person→action_item edges; the brief didn't size this table explicitly.

## 3. Indexes present (migration 0009 + pre-existing)

Confirmed via `pg_indexes` before any new index was added:

```
entities:      idx_entities_scope_norm (user_id, workspace_id, normalized_name)
               idx_entities_norm_trgm  GIN (normalized_name gin_trgm_ops)
entity_links:  idx_entity_links_entity  (entity_id)
               idx_entity_links_target  (target_type, target_id)
               idx_entity_links_meeting (meeting_id)
obligations:   idx_obligations_meeting    (meeting_id)
               idx_obligations_status_due (status, due_date)
               idx_obligations_user       (user_id)
```

**No new indexes were created.** Every measured query below was already served by an existing
index scan (no seq scans on the indexed hot paths) except the two documented in §4.2/§4.5, which
are architectural/code problems that an index cannot fix (see recommendations).

## 4. Measurements (EXPLAIN ANALYZE, BUFFERS, warm run)

All queries below add the RLS-shaping `user_id = <SIM>` predicate by hand where the real
app query would rely on RLS to add it implicitly (execute_sql bypasses RLS).

### 4.1 `/obligations` register (app/obligations/page.tsx)

Query as issued by `getObligationsWithMeetings`: `status='open'`, `order by due_date asc nulls
last`, `limit 200`.

| query | plan | time |
|---|---|---|
| register page (200 rows) | Index Scan on `idx_obligations_status_due`, Index Cond `status='open'`, Filter `user_id` | **1.28 ms** |
| open count chip | Index Scan on `idx_obligations_status_due` (status='open'), 24,000 rows visited | 20.88 ms |
| overdue count chip | Index Scan on `idx_obligations_status_due` (status='open' AND due_date<today), 12,003 rows visited | 10.85 ms |
| done count chip | Index Scan on `idx_obligations_status_due` (status='done'), 8,000 rows visited | 8.55 ms |

**Verdict:** the register query itself is excellent — `idx_obligations_status_due` is used exactly
as intended and the LIMIT 200 keeps it sub-2ms even at 40k rows. The three count-chip queries are
`count(*, {count:'exact', head:true})` calls, which by Postgres/PostgREST semantics must visit
every matching row for MVCC visibility — a covering index can't avoid that. Total register-page
DB time is ~41ms across 4 parallel queries, which is fine.

**Multi-tenant caveat (not directly measurable here):** the real RLS policy on `obligations` is
`user_id = auth.uid() OR can_access_meeting(meeting_id)`, and `can_access_meeting()` is a
`STABLE SECURITY DEFINER` function that runs a subquery against `meetings`. Because our SIM user
owns ~100% of the obligations rows in this test project, every row hits the cheap left disjunct and
`can_access_meeting()` is never actually invoked — this test cannot exercise the case where many
*other* tenants' `open` rows are interleaved earlier in the `(status, due_date)` index order. In
that scenario, Postgres must evaluate the OR-predicate (including the `can_access_meeting()` call)
for every other tenant's row it walks past before accumulating 200 matches for *this* tenant,
which does not benefit from `idx_obligations_status_due` alone. This is a real scaling risk once
the platform has more than a handful of active firms sharing the table — flagged in §5, not fixed
by an index (see recommendation).

### 4.2 `/people` list (app/people/data.ts `getPeopleList`)

| query | plan | time |
|---|---|---|
| `entities` kind='person', order by canonical_name | **Seq Scan** on entities (30,000 of 35,043 rows), then Sort | 110.96 ms |
| bulk entity_links aggregate (`entity_id in (30,000 ids)`, `target_type in ('meeting','company')`) | **Seq Scan** on entity_links + Hash Join (planner rejects per-id index probing at this IN-list size), 101,434 rows returned | 115.82 ms |

**Verdict — worst-performing query pair in this report (~227ms combined, and unbounded).**
Two compounding problems:
1. `idx_entities_scope_norm` is `(user_id, workspace_id, normalized_name)` — it does not include
   `kind`, so a `kind='person'` filter can't use it as an index condition; Postgres seq-scans the
   whole `entities` table for this user/workspace. There is also no LIMIT/pagination on this page
   at all — the entire person list is loaded into the app on every request.
2. The bulk `entity_links` aggregate query has no LIMIT either: it pulls back **all**
   meeting/company edges for **every** person entity (101,434 rows in our test) just to compute two
   integer counts per person in JavaScript. At 1,000-firm scale this query only grows — it is the
   single query most likely to time out or blow the serverless response-size budget as the graph
   fills in.

### 4.3 `/people/[id]` detail (app/people/data.ts `getPersonDetail`)

Tested against the 30-company hub person.

| query | plan | time |
|---|---|---|
| entity_links for one entity_id (`target_type in (...)`) | Index Scan on `idx_entity_links_entity`, 32 rows | 0.25 ms |
| bulk `.in()` meetings/companies/action_items (≤32 ids each) | trivial (pkey lookups) | negligible |

**Verdict:** fine as-is. `getPersonDetail` is correctly scoped to one entity and the downstream
`.in()` selects are small and bulk-fetched (no N+1). No change needed.

### 4.4 Conflict detection (lib/conflicts.ts `detectConflicts`)

Tested against a meeting chaired by the 30-company hub person.

| step | plan | time |
|---|---|---|
| attendee entity_links for the meeting | Index Scan on `idx_entity_links_target` (target_type='meeting', target_id) | 0.16 ms |
| directorship edges for those attendees (`entity_id in (...)`, `relation in (director,chairman,shareholder)`) | Nested Loop, Index Scan on `idx_entity_links_entity`, 90 rows visited | 0.36 ms |
| **`companies` scan** (`select id,name limit 200`, no WHERE, no ORDER BY) | Seq Scan / arbitrary rows | fast, but see below |

**Verdict — this is the highest-severity finding in the report, and it is a correctness bug, not
just a performance one.** The graph traversal itself (attendees → directorship edges) is fast and
well-indexed even for a 20+ company hub — that part scales fine. The problem is the very next
step: `detectConflicts` loads only an **arbitrary first 200 of the user's companies** (SIM user has
5,000) with no `ORDER BY` and no filter tying it to the directorship edges just fetched, then
intersects that arbitrary slice against `interestCompanyIds` in JavaScript. At 1,000-firm scale
(5,000 companies for a single active user in our test), the probability that the actual
conflicted counterparty company falls inside that arbitrary 200-row slice is small — meaning
**most real conflicts of interest will silently go undetected** once a firm's company book exceeds
~200 rows. This is worse than slow: it's a compliance tool that quietly stops flagging conflicts as
the business scales, with no error or empty-state signal to the user.

### 4.5 Entity resolution match (lib/entities.ts `bestEntityMatch` / `resolveEntitiesForMeeting`)

| query | plan | time |
|---|---|---|
| candidate load: all `kind='person'` entities in scope (no LIMIT) | Seq Scan on entities, 30,000 rows | 14.34 ms |
| trigram prefilter test, uniform synthetic names (`% 'sim-person-14837'`) | **Seq Scan** (planner rejected the GIN index) | 274.79 ms |
| trigram prefilter test, realistic distinct name (`% 'ahmad fauzi bin ismail'`) | **Bitmap Index Scan** on `idx_entities_norm_trgm` | 0.46 ms |

**Verdict:** the candidate-load query itself (14ms for 30k rows) is not disastrous by itself, but it
is only the SQL half of the cost. `resolveEntitiesForMeeting` calls `bestEntityMatch()` once **per
attendee and per action-item owner** on every meeting generation, and `bestEntityMatch` runs a full
JS loop over the *entire* in-memory candidate array computing `nameSimilarity()` (a trigram Dice
coefficient, computed in JS) against every candidate. With 30,000 candidates and, say, 8–12
attendees/owners per meeting, that's roughly 250,000–360,000 JS-side trigram comparisons per
minutes-generation call — all CPU-bound, on every save. This is the part of the pipeline most
exposed as `entities` grows past 30k for a single scope.

The trigram-prefilter test is genuinely informative but has one caveat worth being explicit about:
our synthetic names are all `SIM-Person-N`, which share the literal prefix `sim-person-` across all
30,000 rows. Querying for `sim-person-14837` against that corpus makes nearly every row a trigram
match at the default 0.3 threshold, so the planner (correctly) chose a seq scan over the GIN index
— there's no selectivity to exploit. The moment the query string looks like a *real*, distinctive
name (`ahmad fauzi bin ismail`), the same GIN index is used and returns in well under a
millisecond. Real attendee names are naturally far more diverse than our uniform synthetic set, so
in production the trigram prefilter should behave like the second case, not the first — but this
recommendation should be validated against a more name-diverse fixture before relying on it as the
sole justification.

## 5. Prioritized code recommendations

These are **code changes for the app team** — no app code was modified in this exercise.

1. **`lib/conflicts.ts` — highest priority, correctness bug.** Replace the blanket
   `supabase.from("companies").select("id, name").limit(MAX_COMPANIES)` with a query scoped to the
   companies actually implicated by the directorship edges already fetched, e.g.
   `.in("id", [...interestCompanyIds])` (already known before this query runs — `interestCompanyIds`
   is computed from `dirLinks` a few lines above). This drops the query from "arbitrary 200 of
   potentially thousands" to "exactly the handful of companies an attendee actually directs," fixes
   the silent-false-negative bug at scale, and is *also* faster. `MAX_COMPANIES`/pagination becomes
   unnecessary once the query is properly scoped.

2. **`app/people/data.ts` (`getPeopleList`) — second priority, unbounded queries.**
   - Add pagination/LIMIT to the `entities` list query (currently loads the entire person list with
     no bound), and add a partial or composite index that includes `kind`, e.g.
     `(user_id, workspace_id, kind, canonical_name)`, so the `kind='person'` + ordering can be
     served by an index instead of a full seq scan + sort.
   - Replace the bulk `entity_links` fetch-everything-then-count-in-JS pattern with a server-side
     aggregate (`select entity_id, target_type, count(*) ... group by entity_id, target_type`, or a
     Postgres RPC) so the response carries per-person counts instead of ~100k raw edge rows. This is
     the single highest-growth query in the app — it scales with the *entire* graph, not with the
     number of people actually rendered on the page.

3. **`lib/entities.ts` (`bestEntityMatch` via `resolveEntitiesForMeeting`) — third priority,
   CPU cost.** `resolveEntitiesForMeeting` should trigram-prefilter candidates via a
   `normalized_name % $name` (or `ilike`) query with a `LIMIT` (e.g. 20–50) against
   `idx_entities_norm_trgm`, rather than loading the full scope of person entities into memory and
   running `bestEntityMatch`'s O(n) JS comparison for every attendee/owner. Confirmed the GIN index
   is usable for this (§4.5, second trigram test) once query strings are realistically distinct
   names rather than a uniform synthetic prefix — validate against production-like name diversity
   before shipping, but the direction is sound: bound the JS-side fanout by bounding the SQL-side
   candidate set first.

4. **Minor / lower priority:**
   - `app/obligations/page.tsx`: the three count-chip queries (open/done/overdue, ~20ms/8ms/11ms)
     are individually fine but run as three separate `count(*,{exact,head:true})` round trips; a
     single grouped count query (`select status, count(*) ... group by status` plus one overdue
     count) would cut this to ~1 query's worth of index-scan work instead of 3.
   - Multi-tenant RLS risk on `obligations` (§4.1 caveat): once multiple firms have significant
     `open` obligation volume, the `user_id = auth.uid() OR can_access_meeting(meeting_id)` policy
     means the register query's `LIMIT 200` walk over `idx_obligations_status_due` will invoke
     `can_access_meeting()` for every other tenant's row it passes before finding 200 of *this*
     tenant's. Worth re-measuring with a second heavily-seeded tenant once real multi-tenant volume
     exists; no index fixes this because the OR'd `SECURITY DEFINER` function call isn't sargable.
   - Advisors (see §6) flagged `idx_entity_links_meeting` as unused in this session — expected,
     since none of the five hot-path queries tested filter `entity_links` by `meeting_id` directly
     (they go through `entity_id` or `(target_type, target_id)`). Keep it; `resolveEntitiesForMeeting`
     and other write-path code may still rely on it, and migration 0009 cascade-deletes depend on
     the FK it backs, not the index itself — no action needed.

## 6. Advisors (performance) summary

Ran `get_advisors(type=performance)` after seeding. Relevant findings:

- **Unindexed FKs** (INFO level): `entities.workspace_id`, `companies.workspace_id`,
  `obligations.resolution_id`, plus several unrelated tables (`assurance_reports.meeting_id`,
  `confirmations.draft_id`/`share_id`, `minutes_drafts.transcript_id`, `review_shares.draft_id`/
  `meeting_id`, `workspace_members.user_id`). None of these were on the hot paths measured in this
  report (RLS's `is_workspace_member()` join wasn't exercised because our SIM data was scoped to a
  single user with `workspace_id is null`), so no index was added preemptively — worth a follow-up
  pass once workspace-scoped usage is simulated.
- **Unused index**: `idx_entity_links_meeting` and `resolutions_text_trgm` — expected given the
  query shapes tested here; not a signal to drop either index without broader coverage.
- **Auth DB connection strategy**: informational, unrelated to this simulation.

No new indexes were created as part of this simulation — every hot-path query already had a
usable index; the bottlenecks found are architectural (unbounded queries, wrong scoping) rather
than missing indexes.

## 7. Cleanup and verification

All SIM rows were deleted in dependency order (obligations/entity_links/action_items by
`user_id`, then entities, then meetings, then companies) after measurements completed.

Post-cleanup counts (must equal §1 baseline):

| table | baseline | post-cleanup |
|---|---|---|
| entities | 43 | 43 |
| entity_links | 77 | 77 |
| obligations | 4 | 4 |
| meetings | 13 | 13 |
| companies | 11 | 11 |
| action_items | 15 | 15 |

Verified equal — no non-SIM data was touched.
