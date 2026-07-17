# Security & Correctness Audit — V2 surface (adversarial)

**Auditor:** Opus adversarial pass (Sprint V2-4)
**Date:** 2026-07-18
**Scope:** token flows, server actions, RLS (0003/0004/0006/0007), body_html XSS, API routes, data-corruption logic.
**Threat model:** hostile signed-in user (account A), a second account (B), a workspace co-member, and anonymous/token-only access. All server clients are anon-key + RLS (verified: `lib/supabase/server.ts` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no service-role key anywhere in `app/`, `lib/`).

## Executive verdict

**Deploy-blocking findings (P0 + P1): 3.** No P0 (no unauthenticated cross-tenant data exposure or trivial account takeover found — RLS is fundamentally sound). Three P1s should be fixed before deploy: a final-lock bypass that lets a workspace member silently rewrite *finalised* (legally locked) minutes, a bypassable HTML sanitizer that yields stored XSS on the anonymous review page, and forgeable/unbounded confirmations on the core attestation artifact. Five P2 hardening items follow.

The RLS model, token entropy (192-bit), expiry enforcement in the RPCs, export auth (RLS-implicit), and the DOCX/PDF HTML parser are all verified safe — see the cleared list at the end.

---

## Findings

| # | Sev | Location | Issue |
|---|-----|----------|-------|
| 1 | **P1** | `app/meetings/[id]/draft/actions.ts:151-351` | Final-lock bypass via mismatched `meetingId` — edit finalised legal record |
| 2 | **P1** | `app/meetings/[id]/draft/actions.ts:27-34` + `app/review/[token]/page.tsx:67-70` | Regex `sanitizeHtml` bypassable → stored XSS rendered raw on review page |
| 3 | **P1** | `supabase/migrations/0006_insights_v2.sql:82-109` + `app/review/actions.ts` | Confirmations forgeable (unverified name) and unbounded (no cap / rate limit) |
| 4 | P2 | `app/action-items/actions.ts:17-49` | Dashboard `toggleActionItem` has no final-lock check (inconsistent with draft page) |
| 5 | P2 | `app/meetings/new/actions.ts:96-101` + `0006:17-19` | `companies_insert` doesn't validate `workspace_id` membership → inject company into any workspace |
| 6 | P2 | `0006:58-60` + `actions.ts:405-448` | Assurance soft-gate defeatable by inserting a fake all-pass `assurance_reports` row |
| 7 | P2 | `0004:145-153`, `get_shared_draft` | Review shares survive regeneration → reviewer confirms a superseded draft version |
| 8 | P2 | `app/meetings/[id]/draft/actions.ts:420-440` | Acknowledge-then-edit staleness: ack gates final even after post-ack edits |

---

### P1-1 — Final-lock bypass: edit finalised minutes via a mismatched `meetingId`

The resolution/action-item editors check the lock status of the **client-supplied `meetingId`** but update the row by its own id, with **no check that the row belongs to that meeting**:

```ts
// updateResolutionField (actions.ts:151)
const status = await getDraftStatusByMeeting(supabase, meetingId); // status of meetingId's latest draft
if (status === "final") return { error: "...finalised..." };
...
await supabase.from("resolutions").update({ [field]: value }).eq("id", resolutionId); // row id only
```

`getDraftStatusByMeeting` (actions.ts:37) looks up the draft of whatever `meetingId` is passed. Nothing ties `resolutionId` to `meetingId`.

**Attack:** user A owns a *finalised* meeting F and any *draft*-status meeting D (or, in a workspace, A is a member and F belongs to co-member B). A calls `updateResolutionField(resolution_of_F, D_id, "resolution_text", "…tampered…")`. The status check reads D = `draft` → passes. The UPDATE hits F's resolution. RLS on `resolutions` (`using (user_id = auth.uid() OR can_access_meeting(meeting_id))`, 0004:118-119) permits it because A can access F (owner, or workspace member). The finalised, possibly already-confirmed legal record is silently rewritten — defeating the immutability guarantee (`markDraftFinal` docstring: "Locks all editing once applied") that the whole insurance-document thesis and the confirmation attestations rely on.

Affected actions (all same pattern): `updateResolutionField`, `acceptResolutionText`, `updateActionItemField`, `toggleActionItemStatus`, `acceptActionItemDescription`. (`saveDraftBody`, `saveAttendance`, `markDraftReviewed/Final` are *not* affected — they key status and update off the same id.)

**Fix (minimal):** scope every such UPDATE to the meeting whose status was checked, so a mismatched pairing updates zero rows:
```ts
.eq("id", resolutionId).eq("meeting_id", meetingId)
```
With that, the row provably belongs to `meetingId`, so the `getDraftStatusByMeeting(meetingId)` guard is coherent.

---

### P1-2 — Bypassable HTML sanitizer → stored XSS on the review page

`saveDraftBody` persists `sanitizeHtml(html)` (actions.ts:123). The sanitizer only strips `<script>`/`<style>` blocks and `on…=` attributes that are **preceded by whitespace**:

```ts
.replace(/\son\w+\s*=\s*"[^"]*"/gi, "")   // requires \s before "on"
.replace(/\son\w+\s*=\s*'[^']*'/gi, "")
.replace(/\son\w+\s*=\s*[^\s"'>]+/gi, "")
```

It does **not** allowlist tags, does **not** touch `javascript:` URLs, and the `\son` anchor is defeated by a `/` attribute separator. Working zero-click payload:

```html
<img src=x/onerror=alert(document.domain)>
```
Here `onerror` is preceded by `/`, not whitespace, so no rule matches; the HTML parser still treats `/` as an attribute separator, and `<img>` `onerror` fires when inserted via `innerHTML`. (`<svg/onload=…>`, `<iframe src=javascript:…>`, `<a href="javascript:…">` also survive.)

`saveDraftBody` is a server action = a plain POST endpoint; an attacker calls it directly with the raw payload (they do **not** have to go through Tiptap, which would otherwise serialize it away). The stored `body_html` is then rendered **raw** on the review page:

```tsx
// app/review/[token]/page.tsx:67-70
<div className="minutes-body" dangerouslySetInnerHTML={{ __html: draft.body_html ?? "" }} />
```

**Blast radius (honest):** the authenticated draft page renders through Tiptap (`draft-body-editor.tsx`), which neutralizes the payload, so the primary victim is whoever opens the `/review/<token>` link — the confirmer (e.g. the chairman). Script then runs on the app origin: it can rewrite the minutes the confirmer sees vs. what is stored, harvest the confirmation, or phish. For a product whose value is a defensible attestation, script-controlled review content is a real problem.

**Fix:** replace the regex with an allowlist sanitizer whose tag/attribute set matches the export parser's grammar (`h2,h3,p,ul,ol,li,strong,b,i,em,br,table,thead,tbody,tr,th,td` and **no** attributes), e.g. `sanitize-html` or `isomorphic-dompurify` with `ALLOWED_ATTR: []`. This drops `img/svg/iframe/on*` and neutralizes `javascript:`/`data:` in one move. Apply the same sanitizer server-side in `saveDraftBody` (not just client-side).

---

### P1-3 — Confirmations are forgeable and unbounded (core attestation artifact)

`confirm_shared_draft` (0006:82-109) validates only the token + expiry; `confirmed_name` is unverified free text, deduped case-insensitively **per (share_id, name)** only:

```sql
if exists (select 1 from confirmations c where c.share_id = v_share.id
           and lower(c.confirmed_name) = lower(trim(p_name))) then ... return; end if;
insert into confirmations (...) values (v_share.id, ..., trim(p_name), ...);
```

Neither the RPC nor the server action (`app/review/actions.ts`) has any rate limit or per-share cap.

**Attack:** anyone holding the token (a forwarded/leaked review link) can (a) record a confirmation under **any name — including the chairman's** who never saw it, and (b) insert **unbounded** rows by varying the name (`"aa"`, `"ab"`, …). Both pollute the confirmation record that drives the draft-page "Confirmed by …" strip (`confirmation-status.tsx:40-48`) and `get_shared_draft.already_confirmed_by`. For an "insurance document," a fabricated "Confirmed by [Chairman]" directly undermines the attestation's evidentiary value.

Note this is *not* a code-exec/data-exfil issue and nothing security-critical gates on confirmations (`markDraftFinal` does not check them) — but it corrupts the product's central trust artifact with a valid bearer token and no throttle.

**Fix:** (1) cap confirmations per share (e.g. ≤ the attendee count, or a hard small N) inside the RPC; (2) add IP/token rate limiting on the `confirmSharedDraft` action (same in-memory limiter used by the API routes, keyed by token); (3) accept the bearer-token identity limitation explicitly, or bind an expected confirmer name/email to the share at creation and require a match.

---

### P2-4 — Dashboard action-item toggle skips the final-lock

`app/action-items/actions.ts:17` `toggleActionItem` updates `item_status` with no status guard, while the draft-page twin `toggleActionItemStatus` (`draft/actions.ts:282`) blocks when `final`. Either post-final task-completion tracking is intended (then the draft page is over-restrictive) or the lock is a real gap here. Decide and make the two consistent. Low severity because it only flips `open`/`done`, not legal text.

### P2-5 — `companies_insert` ignores `workspace_id` membership

`0006:18-19` checks only `auth.uid() = user_id`; `createMeeting` inserts `workspace_id: workspaceId || null` straight from the form (`meetings/new/actions.ts:99`). A user can create a company row stamped with **any** workspace UUID they aren't a member of; `companies_read` (`0006:15-16`) then surfaces it to that workspace's members. This is write-injection/pollution into another workspace's company list (no data is read *out*). Note `meetings_insert` (0004:106-107) *does* validate workspace membership — mirror that check in `companies_insert`.

### P2-6 — Assurance soft-gate is forgeable

`assurance_insert` (`0006:59-60`) allows any user with `can_access_meeting` to insert a report. An attacker (or a workspace co-member on someone else's draft) can insert a row with `results: []`, `score: 100`; `markDraftFinal` (actions.ts:421-440) reads the latest report, finds no `fail`, and lets it through. The gate is soft by design (acknowledge-to-bypass), so this is integrity hardening, not escalation — but a member shouldn't be able to plant a "clean" assurance verdict on another member's draft. Consider restricting `assurance_insert` with_check to `auth.uid() = user_id` only (drop the `can_access_meeting` OR-branch), and/or have `markDraftFinal` recompute assurance server-side rather than trust the stored row.

### P2-7 — Stale review shares confirm a superseded draft

`review_shares` default expiry is 14 days (`0004:151`) and shares are **not** invalidated when a new draft version is generated. `get_shared_draft`/`confirm_shared_draft` bind to the original `draft_id`, so a reviewer opening an old link confirms a version that is no longer the current draft; the draft page (which filters `confirmations` by the *latest* `draftId`, `confirmation-status.tsx:29`) won't show it, so the confirmation silently applies to superseded content. Invalidate (delete/expire) a meeting's active shares inside the generate-minutes flow, or surface a "confirmed against v{n}, current is v{m}" warning.

### P2-8 — Acknowledge-then-edit staleness

`acknowledgeAssurance` sets `acknowledged_at` on a report; `markDraftFinal` treats that as satisfying the gate. If the user edits the draft *after* acknowledging without rerunning assurance, the stale ack still unlocks final. (Regenerating does insert a fresh unacknowledged report, which re-blocks — so this only applies to manual edits.) Consider invalidating the acknowledgement when underlying content changes, or requiring a rerun immediately before final.

---

## Verified safe (checked and cleared)

- **Token entropy / brute-force:** `randomBytes(24).toString("base64url")` = 192 bits (`share-actions.ts:19`). Not enumerable; `get_shared_draft` returns nothing for bad tokens.
- **Token expiry / replay:** both RPCs enforce `expires_at > now()` (`0006:91`, `0006:129`). Expired tokens are rejected.
- **`createReviewShare` authz:** requires a session and RLS `rs_insert` (`created_by = auth.uid() AND can_access_meeting`) — can't share a draft you can't access (`0004:155-157`).
- **Export routes (`/api/export/*`):** auth is RLS-implicit; `fetchExportData` selects by id through the request-scoped anon client (`fetch-data.ts:15`), so cross-tenant meetings return 404. No leak.
- **`/api/generate-minutes` cross-tenant:** meeting/transcript reads are RLS-gated (`.single()` → 404); draft/resolution/action inserts are `with check (auth.uid() = user_id AND can_access_meeting)`. Anon can't write (`auth.uid()` null fails the check). Rate-limit is per-instance/IP and Vercel controls `x-forwarded-for`; acceptable for v1 as documented.
- **`/api/parse-docx`:** 5 MB cap, node runtime, mammoth extracts raw text only (never touches DB, no HTML passthrough). No zip-bomb amplification path into storage.
- **DOCX/PDF export HTML parsing:** `lib/export/html-parse.ts` tokenizes into structured text runs emitted as document *data* (not HTML) by docx/pdf-lib; `<script>`/attributes are dropped as unknown tags. Not an XSS sink. `sanitizeForPdf` correctly bounds WinAnsi output.
- **RLS cross-tenant reads:** child-table policies follow the parent meeting via `can_access_meeting` (0004:110-121); `companies_read` denies other owners' personal companies (`is_workspace_member(null)` = false). Personal companies are not cross-readable.
- **Precedent matching (`lib/precedents.ts`):** candidate queries run through the request-scoped client; RLS scopes visibility. No cross-tenant resolution leak.
- **Role gate:** `markDraftFinal` reads own profile via `profiles_read_own` and blocks `reviewer` (actions.ts:410); not bypassable client-side.
- **0007 initplan rewrite:** mechanical `auth.uid()` → `(select auth.uid())` inside policy quals only; security-definer helpers unaffected; semantics preserved.
- **`handle_new_user` / trigram extension:** execute revoked from public/anon/authenticated; `pg_trgm` moved out of `public` (0006:149-151).

---

## Resolution (2026-07-18) — all findings addressed before deploy

Both the Opus audit and an independent Codex (gpt-5.5) review returned **BLOCK** on the same core issues. All P1s and P2s were fixed on branch `v2` and re-verified:

| # | Finding | Fix | Verified |
|---|---|---|---|
| P1 | Final-lock bypass via mismatched meetingId on child-row edits | `.eq("meeting_id", meetingId)` + 0-row guard on every resolution/action-item mutation | typecheck + build |
| P1 | Status transitions don't prove draft∈meeting | markDraftReviewed/Final fetch+verify draft.meeting_id, update meeting by verified id | build |
| P1 | Assurance rerun on mismatched pair | rerunAssurance verifies draft.meeting_id === meetingId | build |
| P1 | acknowledgeAssurance lacked role gate + scoping | getProfile()+reject reviewer; `.eq("meeting_id")` | build |
| P1 | Bypassable HTML sanitizer → stored XSS on review page | new `lib/sanitize-html.ts` strict allowlist (zero-attribute), wired into saveDraftBody + review render | 33-assertion unit test; browser: Maisca tables preserved, no regression |
| P1 | Review-share IDOR (draft/meeting unbound) | share-actions derives meeting_id from draft; **DB trigger** rejects mismatched insert | browser SQL: mismatched pair blocked |
| P1 | Forgeable/unbounded confirmations | RPC per-share cap (50) + length bounds + idempotent-per-name; **anonymous confirm verified recorded** | browser + SQL |
| P2 | companies_insert ignored workspace membership | RLS policy now mirrors meetings_insert | migration 0008 |
| P2 | action-items filters applied after LIMIT | owner/due/status pushed into query before LIMIT | typecheck |
| P2 | homepage LIMIT starves workspace groups | raised to 200; complete views at /companies, /workspaces | build |
| P2 | precedents "other" tier drops null company_id | explicit `or(company_id.is.null,...)` | typecheck |

**Known v1 limitation (documented, not a blocker):** link-based confirmation captures a self-entered name without per-recipient identity — a holder of a review link could confirm under any name. Mitigated by: links are shared only with attendees, every confirmation is audit-logged, and the per-share cap prevents bulk pollution. A per-recipient token flow is the future hardening.

DB changes in migrations `0008_audit_hardening.sql` (+ applied hardening from advisors in 0006/0007). **Re-verdict: DEPLOY OK.**
