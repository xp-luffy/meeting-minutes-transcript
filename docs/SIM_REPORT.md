# Portfolio-Scale Simulation Report — 1,000 Cosec Firms

**Date:** 2026-07-18
**Supabase project:** `ntroucqdttcutphnrxqm`
**Scope:** DB measurement only. No application code was changed. One index was added (justified below, applied, and noted). All synthetic data has been deleted; post-cleanup counts are verified against the pre-run baseline at the end of this report.

## 1. Method

- All synthetic rows used `user_id = '99999999-9999-4999-8999-999999999999'` (a UUID with no matching `auth.users` row, so RLS hides it from every real user) and `SIM-` prefixed names (`SIM-Firm-N` workspaces, `SIM-Co-N-J` companies).
- Data was generated with `generate_series` in 5 batches of 200 firms each (batch = 4,000 meetings + all child rows), using deterministic UUIDs so no round-trip was needed to wire up foreign keys.
- `execute_sql` runs with the service role and bypasses RLS, so every "app-shaped" measurement query below has the RLS predicate added back manually: `(user_id is null or user_id = '99999999-9999-4999-8999-999999999999')` — this is the same shape the real policies use for the demo-rows-visible-to-all + owner-scoped-rows pattern (see `supabase/migrations/0003_lockdown_auth_rls.sql`, `0004_workspaces_precedents.sql`).
- Every query was run twice with `EXPLAIN (ANALYZE, BUFFERS)`; the numbers below are the **second (warm) run**.

## 2. Data volumes created

| Table | Rows created | Shape |
|---|---:|---|
| `workspaces` | 1,000 | `SIM-Firm-1`..`SIM-Firm-1000` |
| `companies` | 5,000 | 5 per firm, `SIM-Co-N-1`..`SIM-Co-N-5` |
| `meetings` | 20,000 | 4 per company; `meeting_date` spread over 24 months; `status` cycling draft/reviewed/final; `minutes_format` alternating standard/maisca; `attendees` jsonb with 4 entries |
| `transcripts` | 20,000 | 1 per meeting, ~840 chars |
| `minutes_drafts` | 30,000 | 20,000 v1 (always) + 10,000 v2 (half of meetings, matches "latest version 2 for half") |
| `resolutions` | 60,000 | 3 per meeting |
| `action_items` | 40,000 | 2 per meeting; 24,000 open / 16,000 done (exactly 60% open); due dates spread ±120 days from the meeting date |
| `assurance_reports` | 20,000 | 1 per meeting, `results = '[]'::jsonb`, `score` 70–100 |
| `audit_logs` | 40,000 | 2 per meeting |
| `review_shares` | 1 | inserted to exercise the `get_shared_draft` RPC path |

Confirmed by count query immediately after generation; all totals matched the spec exactly (e.g. `action_items_open = 24000` = 60% of 40,000).

## 3. Existing indexes going in

`pg_indexes` showed the 13 hot-path indexes from `supabase/migrations/0006_insights_v2.sql` already in place (`idx_meetings_user/workspace/company/date`, `idx_transcripts_meeting`, `idx_drafts_meeting_version`, `idx_resolutions_meeting`, `idx_actions_meeting`, `idx_actions_status_due`, `idx_audit_meeting_time`, `idx_assurance_draft`, `idx_confirmations_meeting`, `idx_companies_scope`) plus `resolutions_text_trgm` (gin_trgm) from `0004`. No live-schema drift beyond what those migrations describe.

## 4. Query measurements (warm run)

### 4.1 Homepage — meetings list (`app/page.tsx`, `getMeetingsWithLatestDrafts`)

| Variant | Time | Rows | Plan |
|---|---:|---:|---|
| No `LIMIT` (current app behaviour) | **26.1 ms** | 20,007 | `Index Scan` on `idx_meetings_date`, but reads and returns **all** rows — 20,091 buffer hits |
| `LIMIT 50` | **0.46 ms** | 50 | Same index, stops after 50 — 53 buffer hits |

**57x** faster with a limit. The index is already correct; the problem is purely "no limit."

### 4.2 Homepage — drafts-for-meetings (`.in("meeting_id", meetingIds)`)

| Variant | Time | Rows | Plan |
|---|---:|---:|---|
| Unbounded (all 20,007 meeting ids) | **78.1 ms** | 30,009 | `Seq Scan` on `minutes_drafts` + `Seq Scan` on `meetings` + `Hash Join`, then an **external merge sort spilling 4.75 MB to disk** (because every version of every draft has to be sorted by `version DESC` before the client dedupes to "latest per meeting" in JS) |
| Meeting ids capped to 50 (matches §4.1 `LIMIT 50`) | **1.5 ms** | 75 | `Nested Loop` using `idx_meetings_date` → `idx_drafts_meeting_version`, in-memory quicksort |

**52x** faster. This query's cost is *entirely downstream* of the unbounded meetings query — capping the homepage list fixes both in one move.

### 4.3 Action-items dashboard (`app/action-items/page.tsx`, `getActionItemsWithMeetings`)

| Variant | Time | Rows | Plan |
|---|---:|---:|---|
| All items, no filter, no limit (current app behaviour — filtering happens in JS *after* fetch) | **70.7 ms** | 40,008 | `Seq Scan` on `action_items` (no usable index for an unfiltered scan) + external merge sort spilling 5.1 MB to disk |
| `item_status = 'open'` + `LIMIT 200` pushed into the query | **1.3 ms** | 200 | `Index Scan` on `idx_actions_status_due`, stops after 200 |

**54x** faster. Note the existing `idx_actions_status_due` index is already exactly right for this — it's unused today only because the app fetches everything unfiltered and filters/paginates in JavaScript.

### 4.4 Company history (`lib/companies.ts`, `getCompanyHistory`)

Already fast at this scale — no fix needed.

| Query | Time | Plan |
|---|---:|---|
| Meetings by `company_id` | 0.19 ms | `Index Scan` on `idx_meetings_company` |
| Last-50 resolutions for those meetings | 0.28 ms | `Nested Loop`: `idx_meetings_company` → `idx_resolutions_meeting` |

### 4.5 Precedents (`lib/precedents.ts`, `fetchCandidates` two-tier shape)

| Tier | Time (before) | Time (after) | Plan (before) | Plan (after) |
|---|---:|---:|---|---|
| Same-company (`mode: "same"`, `company_id = X`) | 0.26 ms | 0.26 ms | `Nested Loop` on `idx_meetings_company` → `idx_resolutions_meeting` | unchanged — already fine |
| **Other-company (`mode: "other"`, `company_id <> X`)** | **77.0 ms** | **1.0 ms** | `Parallel Seq Scan` on `resolutions` **and** `meetings` + `Hash Join` (2,948 buffer hits — a near-full-table scan, because `<>` can't use the equality index `idx_meetings_company`) | `Index Scan` on new `idx_resolutions_created_at` (walks newest-first) → `Memoize`+`Nested Loop` on `meetings_pkey`, stopping at `LIMIT 100` |

**This was the single worst query measured** (worse than the two unbounded queries above), and unlike those two it has **no UI-level escape hatch** — it fires in full every time a company secretary opens a draft with resolutions to check for precedent, regardless of any pagination elsewhere in the app. At 1,000-firm scale (60,000 resolutions) an inequality filter on `company_id` matches ~99.98% of rows, so Postgres can't use `idx_meetings_company` and instead scans nearly the whole table before sorting. **74x faster** after the index fix described in §5.

### 4.6 Homepage confirmations bulk select (20 meeting ids)

**0.09 ms**, `Bitmap Index Scan` on `idx_confirmations_meeting`. Already correct — no action needed.

### 4.7 `get_shared_draft` RPC (review-share token lookup)

| Query | Time | Plan |
|---|---:|---|
| Underlying join (token → share → draft → meeting) | 0.34 ms | `Index Scan` on `review_shares_token_key` → `minutes_drafts_pkey` → `meetings_pkey`, all index scans |
| Actual RPC call (`select * from get_shared_draft(...)`) | 3.9 ms | `Function Scan` (opaque to the planner — it's `SECURITY DEFINER` so not inlined; the 3.9ms is mostly function-call/type-conversion overhead, not query cost) |

Already fast. No action needed.

## 5. Index change applied

**Added:** `create index idx_resolutions_created_at on resolutions(created_at desc);` — applied as migration `resolutions_created_at_index`.

**Justification:** measured first (§4.5) — this is the only query in the whole battery that a b-tree index can meaningfully fix that wasn't already indexed correctly. It took the worst query in the suite (77 ms warm, near-full-table parallel scan) down to ~1 ms (74x), and it's on the hot path for every single "open a draft with resolutions" action across the whole portfolio, not just a paginable list view. Low-risk, single btree column, no write-path impact of consequence at this table's size (60k rows/portfolio, single INSERT per resolution).

I did **not** apply any other schema changes — the remaining query costs are all "the app fetches an unbounded result set" problems, which are code-shaped fixes (below), not index-shaped ones.

## 6. Performance advisor findings (relevant subset)

Ran `get_advisors(type: performance)` before cleanup. Full output has ~59 findings; the ones relevant to this measurement:

- **RLS `auth.<function>()` re-evaluated per row** (`0003_auth_rls_initplan`) — nearly every RLS policy on `meetings`, `transcripts`, `minutes_drafts`, `resolutions`, `action_items`, `audit_logs`, `companies`, `workspaces`, `workspace_members`, `workspace_invites`, `review_shares`, `assurance_reports`, `profiles` calls `auth.uid()` directly instead of `(select auth.uid())`. Postgres can't turn the direct call into a one-time InitPlan, so it re-evaluates per row. **This measurement used a literal UUID instead of live RLS, so the numbers in §4 do not include this cost** — in production, with real RLS active, the unbounded queries in §4.1–4.3 will be *slower than measured here*, proportional to row count. This is a real fix but it's a schema/policy change beyond the "index only" mandate for this task — flagging it as the top non-index follow-up.
- **Unindexed foreign keys** (`0001_unindexed_foreign_keys`): `assurance_reports.meeting_id`, `companies.workspace_id`, `confirmations.draft_id`, `confirmations.share_id`, `minutes_drafts.transcript_id`, `review_shares.draft_id`, `review_shares.meeting_id`, `workspace_members.user_id`. None of these showed up as a bottleneck in the six measured query shapes (their access patterns go through other already-indexed columns), so I did not add indexes for them — flagging for awareness only, not urgent.
- **Unused indexes** (`0005_unused_index`): `idx_transcripts_meeting`, `idx_actions_meeting`, `idx_audit_meeting_time`, `idx_assurance_draft`, `idx_companies_scope`, `resolutions_text_trgm`, `idx_meetings_workspace` showed zero usage. This reflects that this run only exercised 6 query shapes, not the full app (e.g. `idx_transcripts_meeting` is used by the meeting-detail/transcript page, `idx_actions_meeting` by company history's open-actions query, `resolutions_text_trgm` per the code comment in `lib/precedents.ts` is dead — PostgREST doesn't expose trigram operators, so nothing queries through it today). Not a recommendation to drop anything; noted for context.
- Auth server connection pool note (10 connections, percentage-based scaling recommended) — infra note, unrelated to this schema.

## 7. Prioritized code recommendations (DB-side facts only; orchestrator to apply)

1. **Homepage meetings list — add pagination.** `app/page.tsx`, function `getMeetingsWithLatestDrafts` (lines ~21–26): the `.from("meetings").select(...).order("meeting_date", {ascending:false})` call has no `.limit(...)`. At 1,000-firm scale this is a 26ms/20k-row fetch that also balloons the payload sent to the browser. **Fix:** add `.limit(50)` (or similar) and a "Showing latest 50 of N — view all" affordance; this simultaneously fixes the downstream drafts/confirmations bulk queries since they're keyed off the same `meetingIds` array (§4.1, §4.2 measured 57x/52x faster with this one change).

2. **Action-items dashboard — push filtering/limit into the query.** `app/action-items/page.tsx`, function `getActionItemsWithMeetings` (lines ~48–53): fetches **all** action items unconditionally, then filters by `status`/`due`/`owner` in JavaScript (lines ~103–123) after the fact. The existing index `idx_actions_status_due` is exactly right for `item_status = 'open' ORDER BY due_date` but is never used because nothing is pushed to the DB. **Fix:** default the query itself to `.eq("item_status", statusFilter === "all" ? undefined : statusFilter)` (or two branches) and add `.limit(200)` (or a real pager), only falling back to fetch-all when the user explicitly picks "All" + no limit is acceptable. Measured 54x faster (70.7ms → 1.3ms) doing this.

3. **Precedents "other company" tier — defense in depth beyond the index.** `lib/precedents.ts`, `fetchCandidates` (lines ~109–139), `mode: "other"` branch: builds `.neq("meetings.company_id", companyId)`. The new `idx_resolutions_created_at` index (§5) fixes this at the DB level for now (77ms → 1ms), but the query shape itself — an inequality filter that matches ~100% of rows — is inherently fragile as the portfolio grows (e.g. if a single company/workspace ever holds a large share of the tenant's resolutions, the near-full-scan pattern returns even with the index, since the nested-loop-with-early-exit strategy only works because matches are dense). **Optional hardening:** consider dropping the `company_id <> X` filter entirely for the "other" tier — since the "same" tier query already gets same-company rows exclusively, "other" doesn't strictly need to exclude company X client-side (a handful of same-company duplicates would just be deduped by the existing `seenResolutionIds` set at line ~210). This removes the join-with-inequality shape altogether. Not urgent given the index fix; flagging as a robustness note, not a required change.

4. **(Minor/optional) Company/action-items growth guard.** `lib/companies.ts`, `getCompanyHistory` (lines ~108–132) and `getCompanyStatsMap` (lines ~178–224) are correctly scoped per-company today and measured fast (§4.4), but both do `.in("meeting_id", meetingIds)` over an unbounded list of that one company's meetings. Fine at 4 meetings/company (this simulation's shape); if a single company ever accumulates hundreds/thousands of meetings this pattern would need the same kind of limit — no action needed now, just noting it uses the same pattern as items 1–2 so the same fix class applies if/when it becomes hot.

## 8. Post-cleanup verification

Cleanup order: `delete from meetings where user_id = SIM` (cascades to `transcripts`, `minutes_drafts`, `resolutions`, `action_items`, `assurance_reports`, `confirmations`, `review_shares` via their `ON DELETE CASCADE` FKs) → `delete from companies where user_id = SIM` → `delete from workspaces where name like 'SIM-%'` → `delete from audit_logs where user_id = SIM` (no cascade FK exists on `audit_logs.meeting_id`, so deleted explicitly).

| Table | Baseline (before) | After SIM insert | After cleanup | Match? |
|---|---:|---:|---:|:---:|
| meetings | 11 | 20,011 | 11 | ✅ |
| transcripts | 11 | 20,011 | 11 | ✅ |
| minutes_drafts | 14 | 30,014 | 14 | ✅ |
| resolutions | 25 | 60,025 | 25 | ✅ |
| action_items | 13 | 40,013 | 13 | ✅ |
| audit_logs | 23 | 40,023 | 23 | ✅ |
| companies | 10 | 5,010 | 10 | ✅ |
| workspaces | 1 | 1,001 | 1 | ✅ |
| workspace_members | 2 | 2 (untouched) | 2 | ✅ |
| workspace_invites | 1 | 1 (untouched) | 1 | ✅ |
| review_shares | 1 | 2 | 1 | ✅ |
| confirmations | 0 | 0 (none generated) | 0 | ✅ |
| assurance_reports | 0 | 20,000 | 0 | ✅ |
| profiles | 2 | 2 (untouched) | 2 | ✅ |

All tables verified back to baseline. The one schema change left in place is `idx_resolutions_created_at` (§5), applied as tracked migration `resolutions_created_at_index`.
