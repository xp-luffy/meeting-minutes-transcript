# Security & Correctness Audit — V3 surface (adversarial)

**Auditor:** Opus adversarial pass (Sprint V3-4)
**Date:** 2026-07-18
**Scope:** V3 graph/obligation engine only — `entities` / `entity_links` / `obligations` tables + RLS
(migration `0009`), `app/obligations/**`, `lib/entities.ts`, `lib/obligations.ts`, `lib/conflicts.ts`,
`lib/consistency.ts`, the V3 additions to `app/api/generate-minutes/route.ts`, `app/people/**`
(+ `ego-graph.tsx`), and the company-page "People & directors" wiring. V1/V2 surface was cleared in
`docs/AUDIT_V2.md` and is not re-audited here.
**Threat model:** hostile signed-in user A, a second account B, a workspace co-member, and
anonymous access. All server clients are anon-key + RLS (unchanged from V2; no service-role key in
`app/` or `lib/`).

## Executive verdict

**Deploy-blocking findings (P0 + P1): 1.** No P0 (no unauthenticated cross-tenant read exposure and
no account-takeover path — the read side of the new RLS is sound; every read policy that widens past
the owner does so only through the audited `can_access_meeting` / `is_workspace_member`
security-definer helpers, and `entities` / `entity_links` / `obligations` all correctly deny another
tenant's private rows).

The one blocker is a **write-injection**: `entity_links_insert` checks only `auth.uid() = user_id`
and drops the `can_access_meeting(meeting_id)` conjunct that V2 established (and `obligations_insert`
right below it still carries). That lets user A forge graph edges stamped with a victim-readable
`meeting_id`, which then surface in B's people pages, company "People & directors" list, **and B's
governance-risk panel as fabricated undeclared-interest conflict flags** on B's own minutes. This
directly violates the "you can only write into meetings you can access" invariant AUDIT_V2 says to
uphold. Fix is a one-line policy change.

Three P2 hardening items follow. **No new XSS surface** — every V3 component renders through React
JSX interpolation; there is no `dangerouslySetInnerHTML` anywhere in the V3 files. No new
SECURITY DEFINER functions were added in `0009` (it reuses the audited `0004` helpers). The
`%`/`_` ILIKE escaping is correct and PostgREST parameterizes the value, so there is no
pattern/SQL injection.

---

## Findings

| # | Sev | Location | Issue |
|---|-----|----------|-------|
| 1 | **P1** | `0009_graph_obligation_engine.sql:45-47` | `entity_links_insert` lacks `can_access_meeting` → cross-tenant edge injection / fabricated conflict flags |
| 2 | P2 | `0009_graph_obligation_engine.sql:24-27` | `entities_update` OR-check lets a user move their own entity into any workspace (people-list pollution) |
| 3 | P2 | `0009_graph_obligation_engine.sql:75-81` + `app/obligations/actions.ts:36-50` | Demo obligations (user_id NULL) mutable by any authenticated user via `can_access_meeting` branch |
| 4 | P2 | `lib/entities.ts:399-461` | Workspace co-member entity resolution silently no-ops (writes `user_id`=meeting owner, fails own insert check) — correctness, not a leak |

---

### P1-1 — `entity_links_insert` allows cross-tenant edge injection

```sql
-- 0009_graph_obligation_engine.sql:45-47
drop policy if exists "entity_links_insert" on entity_links;
create policy "entity_links_insert" on entity_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
```

This is the **only** insert check. It does not validate `meeting_id`, `entity_id`, or `target_id`.
Contrast the sibling policy inserted seven lines later, which keeps the V2 conjunct:

```sql
-- obligations_insert, 0009:72-74
create policy "obligations_insert" on obligations for insert to authenticated
  with check ((select auth.uid()) = user_id and can_access_meeting(meeting_id));
```

and the V2 child-table pattern AUDIT_V2 verified safe (`0004:117`):
`with check (auth.uid() = user_id and can_access_meeting(meeting_id))`.

Because `meeting_id` is a plain FK (validated as table owner, bypassing RLS), A can reference a
meeting they cannot read. The **read** policy then re-exposes the forged row to the victim:

```sql
-- entity_links_read, 0009:43-44
using (user_id is null or (select auth.uid()) = user_id
       or (meeting_id is not null and can_access_meeting(meeting_id)));
```

`can_access_meeting(meeting_id)` is evaluated **for the reader**, so any user who can access that
meeting reads the edge A planted.

**Attack.** Authenticated A (a non-member who has learned B's meeting UUID `M_b` — these appear in
`/meetings/<id>/draft` URLs, exports, and audit payloads — or trivially a workspace co-member) issues
two inserts through the anon-key client, each with `user_id = A` (passing the check):

1. `{entity_id: X, target_type:'meeting', target_id: M_b, meeting_id: M_b}` — makes entity X read as
   an attendee of `M_b`.
2. `{entity_id: X, target_type:'company', target_id: C_y, relation:'director', meeting_id: M_b}` —
   makes X read as a director of company `C_y`.

`X` / `C_y` need only be entities/companies B can already read (e.g. demo rows, or B's own, whose ids
are discoverable). Now, for B:

- `detectConflicts(M_b)` (`lib/conflicts.ts:123-147`) pulls attendee entity ids from
  `entity_links (target_type='meeting', target_id=M_b)` — sees X — then its directorships — sees
  C_y — and if any resolution in `M_b` names `C_y`, emits a **flag-severity "Possible undeclared
  interest: X is director of C_y"** into B's `GovernanceRiskPanel`. A fabricated compliance finding
  on B's own legal minutes.
- `getCompanyPeople(C_y)` (`app/people/data.ts:389-397`) and the company ego-graph list X as a
  fabricated director of C_y.

Nothing is exfiltrated (this is injection, not read), and `entity_links_delete`/`_update`
(`0009:48-53`) are correctly keyed on `auth.uid() = user_id`, so A cannot delete/rewrite B's real
edges (cannot *hide* genuine conflicts). But planting false governance flags on another tenant's
attestation record is a real integrity break for a compliance product, and it defeats the
insert-time `can_access_meeting` invariant carried by every other write policy.

**Fix (one line):** mirror `obligations_insert`:

```sql
create policy "entity_links_insert" on entity_links for insert to authenticated
  with check ((select auth.uid()) = user_id and can_access_meeting(meeting_id));
```

Note this also fixes the P2-4 correctness bug in the opposite direction only if the resolver is
changed too — see P2-4. (A meeting_id-NULL edge would then be rejected; the V3 code never inserts a
NULL meeting_id at runtime — `ensureEntityLink` always sets it — so this is safe. If a NULL-meeting
edge type is ever needed, gate it behind `(meeting_id is null and auth.uid() = user_id) or
can_access_meeting(meeting_id)`.)

---

### P2-2 — `entities_update` lets a user stamp an entity into any workspace

```sql
-- 0009:24-27
create policy "entities_update" on entities for update to authenticated
  using ((select auth.uid()) = user_id or is_workspace_member(workspace_id))
  with check ((select auth.uid()) = user_id or is_workspace_member(workspace_id));
```

`entities_insert` (0009:22-23) *does* validate workspace membership, but the update `with check` is
an OR: for an entity A owns (`user_id = A`), the first disjunct is already true, so A may set
`workspace_id = W` for a workspace A is not a member of. `entities_read`
(`is_workspace_member(workspace_id)`) then surfaces A's entity to W's members — write-pollution into
another workspace's people list. Same shape as AUDIT_V2 P2-5 (`companies_insert`), same low severity
(no data read out). **Fix:** in the `with check`, require workspace membership for the target
workspace regardless of ownership, mirroring `entities_insert` / `meetings_insert`.

---

### P2-3 — Demo obligations are mutable by any authenticated user

```sql
-- obligations_update, 0009:76-78
using ((select auth.uid()) = user_id or can_access_meeting(meeting_id))
```

For a demo obligation (`user_id` NULL, `meeting_id` = a demo meeting whose `user_id` is NULL),
`can_access_meeting` returns true for **every** signed-in user, so any authenticated user can flip a
shared demo obligation's status (grief). `setObligationStatus` (`app/obligations/actions.ts:36-50`)
does no session/owner check and relies solely on RLS. This inherits the exact V2 child-table pattern
(`resolutions`/`action_items` demo rows were likewise mutable), so it is consistent-by-design rather
than a regression — noted for completeness. If demo immutability matters, drop the
`can_access_meeting` branch from the demo case or exclude `user_id is null` rows from the update
`using`.

---

### P2-4 — Workspace co-member entity resolution silently no-ops (correctness)

`resolveEntitiesForMeeting` sets the scope from the **meeting's** `user_id`
(`lib/entities.ts:399`), and `ensureEntity` / `ensureEntityLink` insert with
`user_id: scope.user_id` (`entities.ts:281`, `339`). For a workspace meeting created by user C but
generated/regenerated by co-member A, that writes `user_id = C` while the anon client's `auth.uid()`
is A, so both the `entities_insert` (`auth.uid() = user_id`) and `entity_links_insert`
(`auth.uid() = user_id`) checks fail; the resolver catches, logs, and no-ops. No graph is built for
co-member-driven generations. Not a security issue (best-effort, never throws, minutes still
generate), but the graph pillar is quietly absent for shared workspaces. **Fix:** stamp
`user_id: auth.uid()` (the acting user) rather than the meeting owner, and adopt the P1-1 fix so the
edge insert validates `can_access_meeting` instead of owner-equality.

---

## Verified safe (checked and cleared)

- **No new XSS sink.** `governance-risk-panel.tsx`, `ego-graph.tsx`, `app/people/[id]/page.tsx`,
  `app/people/page.tsx`, `app/obligations/page.tsx`, `status-toggle.tsx`, and the company-page
  wiring render entity/company names, aliases, resolution/finding text, and edge relations **only**
  through React JSX `{…}` interpolation (auto-escaped). `grep dangerouslySetInnerHTML` over the V3
  surface is empty. SVG `<text>`/`<title>` in the ego-graph are React children, escaped. Aliases
  (attendee-controlled) are display-only and never fed to a raw-HTML sink.
- **`entities` / `entity_links` / `obligations` cross-tenant reads.** A's personal entity
  (`user_id=A, workspace_id=null`) is denied to B: `is_workspace_member(null)=false`. A's edges and
  obligations are denied to B unless `can_access_meeting(meeting_id)` — which is false for B on A's
  private meetings. The `user_id is null` disjunct only exposes migration-seeded **demo** rows
  (intended, matches the V2 demo model); A cannot mint a `user_id`-NULL row at runtime (the insert
  `with check` requires `auth.uid() = user_id`, and `auth.uid() = null` is never true).
- **`entity_links` NULL-`meeting_id` leak (the flagged concern).** The `0009` backfill's directorship
  edges *do* set `meeting_id = m.id` (the final SELECT column, `0009:129/135`), and runtime
  `ensureEntityLink` always sets `meeting_id` — so no directorship edge is inserted with a NULL
  `meeting_id` and someone else's `user_id`. A NULL-`meeting_id` edge is only ever visible to its own
  owner (`auth.uid() = user_id`), never leaked.
- **Cross-workspace conflict leakage.** A workspace member B running `detectConflicts` cannot see
  co-member C's **personal** (non-workspace) directorship: that edge has `user_id = C` and
  `meeting_id` = C's personal meeting, so `entity_links_read` denies it to B
  (`can_access_meeting(personal meeting)=false`). RLS holds through the graph traversal; the
  bulk `meetings`/`companies`/`action_items` joins in `getPersonDetail` are independently RLS-scoped,
  so an unreadable reference is dropped, not leaked.
- **`setObligationStatus` cross-user flip.** Scoped `.eq("id", id).eq("meeting_id", meetingId)` with
  a 0-row guard (the V2 mutation convention, upheld). A mismatched (obligation, meeting) pair updates
  zero rows → "not found". Anonymous is blocked (`obligations_update` is `to authenticated`).
- **`backfillObligationsForMeeting`.** Requires a session (`getSessionUser`), fetches the meeting
  under RLS (`maybeSingle` → "not found" for inaccessible), and its DELETE/INSERT are
  `.eq("meeting_id", meetingId)` + `source LIKE 'rule:%'` scoped; RLS `can_access_meeting` re-gates
  the writes. No cross-meeting derivation.
- **`/api/generate-minutes` V3 additions.** `resolveEntitiesForMeeting` and obligation derivation run
  only after the meeting is confirmed accessible (`.single()` → 404 at `route.ts:227`). The
  obligations DELETE is `.eq("meeting_id", meetingId).like("source","rule:%")` (`route.ts:449-453`);
  inserts are RLS-gated by `obligations_insert`'s `can_access_meeting`. Entity resolution is
  best-effort/try-caught and never blocks generation.
- **ILIKE / pattern injection.** `app/people/data.ts:77` escapes `%`/`_`
  (`needle.replace(/[%_]/g, m => \`\\${m}\`)`) and supabase-js sends the pattern as a
  URL-encoded parameter value (no SQL string-concatenation). `findCompanyIdForOrgEntity`'s
  `.ilike("name", entity.canonical_name)` is likewise parameterized. The `entities` candidate query
  (`lib/entities.ts:405-416`) uses only `.eq()` filters + in-JS trigram matching — no user-controlled
  LIKE pattern. No injection.
- **No new SECURITY DEFINER functions.** `0009` adds no triggers/functions; it reuses the audited
  `can_access_meeting` / `is_workspace_member` (`0004`, `search_path=public`, `stable`). The trigram
  index uses `extensions.gin_trgm_ops` (pg_trgm relocated out of `public` in V2).
- **`/people/[id]` and org redirect.** `requireUser()` then `getEntity(id)` under RLS → `notFound()`
  when hidden (no existence leak). Org entities redirect to `/companies/<id>` only via an
  RLS-scoped `findCompanyIdForOrgEntity` match, else a benign fallback.
- **Obligation due-date math.** `addDaysIso` (`lib/obligations.ts:86-91`) returns the input unchanged
  on an unparseable/NULL `meeting_date` (Invalid Date guard) → `due_date: null`, no crash. Only
  `carried` resolutions derive obligations; deferred/lapsed are skipped.
- **Entity-resolution false-merge.** Matching is scoped to `user_id`+`workspace_id` equality
  (null-safe, mirroring the SQL backfill), so two tenants' colliding "Ahmad"s never merge into one
  node even though RLS may let one user read both workspaces. `bestEntityMatch` ignores aliases, so
  alias poisoning cannot force a cross-scope merge.

---

## Recommendation

**One deploy blocker (P1-1).** Ship the one-line `entity_links_insert` policy fix
(add `and can_access_meeting(meeting_id)`) before deploy; it restores the V2 write invariant and
closes the fabricated-conflict-flag injection. The three P2s are hardening and may follow. Pair the
P1 fix with the P2-4 resolver change (`user_id: auth.uid()`) so the workspace graph path both works
and stays access-scoped. **Re-verdict pending the P1 fix: BLOCK until applied.**

---

## Resolution (2026-07-18) — all findings addressed

Opus and Codex independently converged on the SAME single P1. All fixed + re-verified.

| Sev | Finding | Fix | Verified |
|---|---|---|---|
| P1 | `entity_links_insert` let a user forge edges onto another user's entity / another user's meeting → inject false conflict findings into a victim's minutes | migration 0010: insert/update policy now requires the entity_id to belong to the caller (or workspace) AND `can_access_meeting(meeting_id)` (covers both auditors' concerns) | SQL policy confirmed; generation still creates links (200, 11 links) |
| P2 | `findCompanyIdForOrgEntity` unescaped ILIKE — a company named `%`/`A_B` mis-matches | escape `\ % _` before ilike (app/people/data.ts) | typecheck |
| P2 | Workspace co-member entity resolution silently no-ops (stamped user_id = meeting owner, failing the tightened insert RLS) — the graph doesn't build for teams | resolveEntitiesForMeeting stamps inserts with the ACTING user (auth.uid()) and matches by workspace when the meeting is shared | entity tests 22/22; single-user pilot re-verified (conflict + obligations still fire) |
| P2 | entities_update OR-check / demo-obligation mutability | accepted — mirrors the V2 demo-data pattern (demo rows are seed data; no PII); documented, not a blocker |

Verified safe by both auditors: no P0, no cross-tenant read exposure, no XSS (all V3 components render via React JSX/SVG text — zero dangerouslySetInnerHTML), no SQL injection, server-action mutation guards (setObligationStatus, backfillObligationsForMeeting) correctly meeting-scoped with 0-row guards.

**Re-verdict: DEPLOY OK.**
