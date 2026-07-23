# HANDOFF — device takeover

Last updated: **2026-07-23**, after a security fix, three engine fixes, and the
module foundation.

This file is for picking the work up on a different machine. It carries the state
that is *not* recoverable from the code or the commit log.

## Latest session (2026-07-22/23) — read this first

**A cross-tenant leak was found and closed (0040/0041/0042).** `workspace_members`
and `workspace_invites` had no `org_id` and no restrictive policy — migrations
0029/0030 enumerated tables by hand and missed them. A user could self-join any
workspace and read its member list. Statutory records never leaked (the restrictive
`org_isolation` on companies/meetings held), but the membership graph did.

The fix chain, and the lesson in each:
- `0040` added `org_id` + restrictive policy — but with `NOT NULL` and **no default**,
  and updated none of the four writers. That broke signup for anyone with a pending
  workspace invite (the not-null violation rolls back `auth.users`). This is the exact
  scar in §7 below, committed by the same hand that wrote it down. Two independent
  reviews (Codex + Pilot) caught it; the author did not.
- `0041` replaced the demand with a **BEFORE trigger** that derives `org_id` from the
  workspace — fixes all four writers without editing them, and avoids a `pg_restore`
  hazard (a CHECK querying another table fails during alphabetical restore).
- `0042` — found by *running* the signup path, not reading it — a workspace invite
  granted nothing, because the invitee got a personal org and the membership row landed
  in an org they don't belong to. Now a workspace invite places them in the inviting org.

**Three engine fixes (all proven by probe):**
- `close_recorded` was unreachable in opposite directions on the two templates (standard
  never passed, maisca never failed). Both now emit a close line only when the transcript
  records one. `scripts/probes/pipeline-reachability.ts` confirms `pass,warn`.
- `interest_declarations` warned on 100% of drafts; now uses the transcript to warn only
  when a declaration was called for, else `not_applicable`. `scripts/probes/interest-declarations.ts`.
- Both fixes deliberately read the TRANSCRIPT, never the body — deriving the check input
  from the generator's own output is the `quorum_stated` circularity, still unfixed.

**Module foundation (0043 + `lib/modules/`).** Schema + a framework-free module registry,
proven no-op. Nothing consumes it yet. See §9.

**Still gated on the AI path (unchanged):** `AI_API_KEY` has never been set, so every
draft is `rule_based_v1`. GroundStream still unproven. These two remain the blockers on
everything downstream — see §1.

**No secrets are in this repo, ever.** Every key lives in Vercel env vars or in the
`gs_settings` table encrypted. `.env*` is gitignored. If you need a value, get it
from the source named below — do not paste one into a file, a commit, or a chat.

---

## 1. Where things stand RIGHT NOW

Multi-tenancy is **built, deployed and proven**. GroundStream is **connected but not
yet proven end to end.**

**The immediate next action** is two things, both on the GroundStream settings screen
(`/settings/groundstream`):

1. Press **Test connection** twice. Expect `accepted: 1` then `deduped: 1`.
   Both are success — the second proves retries cannot duplicate.
2. **Resolve the source-name question below.**

### ⚠️ DEMO-ONLY: the saved key points at the OTHER organisation's workspace

The credential saved against the **`drive-funnels`** org is understood to be a key
for the **OnlyAIWork** GroundStream workspace. This was accepted deliberately on
2026-07-21 **for demonstration purposes only**.

Consequence, stated plainly: **Drive Funnels' events are being recorded in
OnlyAIWork's GroundStream workspace.** Per `/gs` §5 the key alone decides where an
event lands — nothing in the payload can override it — and **there is no undo** once
events are filed. Any funnel or conversion figure read out of OnlyAIWork's workspace
while this stands is mixing two businesses.

**Before this is anything other than a demo:** issue a key from Drive Funnels' own
workspace, replace it at `/settings/groundstream`, and give OnlyAIWork its own key on
the `onlyaiwork` org. Each org needs its own key AND its own registered source name.

### ⚠️ Open question: the source name

`gs_settings.source_name` is currently **`Meeting Minutes`**.

Earlier guidance in this session incorrectly said to register the source as
`drive-funnels`. That conflated two different identifiers:

| identifier | value | meaning |
|---|---|---|
| `workspace` | `drive-funnels` | **internal.** Which organisation on this deployment owns the event. Never sent to GroundStream. |
| `source_name` | `Meeting Minutes` | **external.** Must match the name registered *in GroundStream* character-for-character. |

**Verify what GroundStream actually has registered** and make `source_name` match it
exactly. This matters because the failure is asymmetric:

- **bound key** + wrong source → `400` naming the correct one. Loud, recoverable.
- **unbound key** + wrong source → accepted, written verbatim, `201` every time.
  Creates a phantom source that matches nothing and breaks dedup permanently.

Pressing "Test connection" is the arbiter. Do that before letting real events flow.

### Not yet done (deliberately)

- Reconciliation sweep (`/gs` §7b) — the non-atomic enqueue path has a silent gap without it
- Historical backfill — GroundStream starts cold until this runs
- Organisation invites UI — the `organisation_invites` table and signup path exist, no screen yet
- Register-of-directors wiring for the quorum check

### Open, user-side

- Close open signups in Supabase Auth (anyone can register today)
- Test "Forgot password" once — SMTP is configured but has never actually sent

---

## 2. Getting running on a new machine

```bash
git clone https://github.com/xp-luffy/meeting-minutes-transcript
cd meeting-minutes-transcript
bun install          # or npm install
cp .env.example .env.local   # if absent, create it with the vars in §4
bun dev
```

Typecheck and build (both must pass — `ignoreBuildErrors` is off deliberately):

```bash
./node_modules/.bin/tsc --noEmit
npm run build
```

**Consoles**

- Repo — https://github.com/xp-luffy/meeting-minutes-transcript
- Vercel — https://vercel.com/xienpuo-9035s-projects/meeting-minutes-transcript
- Supabase — https://supabase.com/dashboard/project/ntroucqdttcutphnrxqm
- Live app — https://meeting-minutes-transcript.vercel.app

Note the two auto-generated Vercel domains are behind Vercel SSO and 302 away.
`meeting-minutes-transcript.vercel.app` is the real public URL.

---

## 3. Architecture: the tenancy model (read this first)

Changed on 2026-07-21, migrations `0027`–`0038`. Three levels, easy to confuse:

| level | table | what it is |
|---|---|---|
| **organisation** | `organisations` | **the tenant boundary.** A firm. Owns the data. |
| workspace | `workspaces` | a sharing group *inside* an organisation. Optional. |
| user | `profiles` | a person. Belongs to an organisation via `organisation_members`. |

**The organisation owns the data, not the user.** Someone who leaves does not take
the firm's statutory records with them — this is a deliberate, confirmed decision.

### ONE LOGIN = ONE ORGANISATION (migration `0039`)

A person who works for two firms has **two logins**. Enforced by a unique index on
`organisation_members(user_id)`, not by convention.

This is load-bearing, not tidiness. `current_org_id()` resolves the caller's org as
their earliest membership row, and it is the `DEFAULT` on `org_id` across 17 tables.
With two memberships that default keeps stamping the *older* org onto records the
user thinks they are creating in the newer one. Nothing leaks — the restrictive
policy still refuses cross-tenant reads — the records just file themselves under the
wrong firm, and you find out much later.

Because of the index, `current_org_id()` is correct **by construction**, and no
active-org switcher / cookie / explicit-org-on-insert machinery is needed. **If you
ever relax this, all of that becomes mandatory in the same change.**

Moving a person between firms = delete the membership, insert the new one. Their old
firm's records stay with the old firm.

### The two live organisations

| slug | name | members | GroundStream |
|---|---|---|---|
| `drive-funnels` | Drive Funnels | 3 | credential saved (`…e38a`), **not yet proven** |
| `onlyaiwork` | OnlyAIWork | 0 | none yet |

`onlyaiwork` has a pending **owner invite for `xienpuo@onlyaiwork.com`**. Signing up
with that address joins OnlyAIWork as owner instead of creating a personal org —
`handle_new_user()` consumes the invite. Each org needs its **own** GroundStream key
and its own registered source name; the key alone decides which workspace events land
in, and a wrong one has no undo.

### Two different `role` columns — do not mix them up

- `organisation_members.role` — `owner` / `admin` / `member`. **Answers all tenancy
  and permission questions.** Use `is_org_admin()` / `getOrgContext()`.
- `profiles.role` — `cosec` / `reviewer` / `admin`. Describes what someone *does* in
  the product. **Never use it for authorisation.** It used to be app-wide `admin`,
  which meant one admin could read and rotate *every* firm's GroundStream credential.
  That was the bug this whole change fixed.

### How isolation is enforced

Every domain table (17 of them) has a `NOT NULL org_id`, defaulted to
`public.current_org_id()` so no INSERT call site has to supply it.

Isolation is a **RESTRICTIVE** policy named `org_isolation` on each table:

```sql
create policy org_isolation on public.<table> as restrictive to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
```

Postgres **ANDs** restrictive policies with the permissive ones. This is the key
property: **it cannot widen access, by construction.** When adding a new table,
add its `org_id` column, its default, and this policy — nothing else is needed to
make it tenant-safe.

Helper functions are all `SECURITY DEFINER` with a pinned `search_path`, because a
policy body runs as the *calling* role — an inlined subquery would be subject to
that table's own RLS and would recurse or silently deny. (This exact mistake broke
company document uploads in migration `0018`.)

### The one deliberate widening

`org_admin_read` (migration `0037`/`0038`) lets an org admin read their own
organisation's records and reassign owners on `companies`/`meetings`. Without it,
"records stay with the organisation" is true and useless — a resignation would
orphan them from every human in the firm. Plain members see exactly what they saw
before; this was verified.

---

## 4. Environment variables

Names only. Values live in Vercel → Settings → Environment Variables.
**All must be scoped to `Production`** — a var ticked only for Preview looks saved
and is invisible to the live site. That cost an hour on 2026-07-21.

| name | required | where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Settings → API (`service_role`). **Server-side only.** `gs_outbox` is RLS-deny-all, so without this every event insert is silently refused. |
| `GS_ENCRYPTION_KEY` | yes | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — 64 hex chars. App refuses to start if missing/malformed/wrong length. **No fallback, by design.** |
| `CRON_SECRET` | yes | Any long random string. **Not optional** — the drain returns `401` without it and the outbox fills silently every 5 minutes while everything else looks healthy. |
| `GS_API_KEY` / `GS_SOURCE` | no | Env fallback only. Unnecessary once the settings screen holds the credential. |

`GS_WORKSPACE` was **removed**. The org slug replaces it; a deployment-wide constant
can only ever name one tenant.

Rotating `GS_ENCRYPTION_KEY` makes every stored credential undecryptable. Re-paste
the GroundStream key through the settings screen afterwards.

---

## 5. GroundStream integration

Follow the `/gs` and `/integrate` skills. Reference:
https://github.com/xp-luffy/groundstream-app/blob/main/docs/GS-APP-INTEGRATION-SPEC.md

- **Actor is the CLIENT COMPANY**, never the internal cosec user. The funnel measures
  client progression, not staff activity.
- **Stages**: `acquired` company added · `engaged` meeting/transcript/draft ·
  `activated` finalised + confirmed-by-recipient · `retained` repeat finalised meeting.
- **No `converted` events.** No payment or externally verified commercial approval
  exists here. This workspace has no conversion rate until a billing source connects.
  Do not invent one.
- **Credential resolution** (`lib/groundstream/credentials.ts`): database →
  `GS_KEY_<WORKSPACE>` → `GS_API_KEY`. A `lookup_failed` or `decrypt_failed` **stops**
  rather than falling through — otherwise a broken master key hides behind a stale
  env value that still works.
- **Cron** is in `vercel.json`, `*/5 * * * *` → `/api/cron/gs-drain`. Without it the
  outbox fills and never drains, and every other checklist box can be ticked while
  zero events are delivered.
- **Anonymous confirmation path** enqueues *inside* `confirm_shared_draft` (SQL,
  `SECURITY DEFINER`). There is no server-side hop there — the share token is the
  credential — so an enqueue via the request-scoped client would be silently refused.

Proof obligation: **never report this working because it builds or tests pass.** The
only proof is a row in `gs_outbox`, a drain reporting `dead: 0`, the event visible in
GroundStream, and a replay that dedupes.

---

## 6. How to verify tenant isolation (re-runnable)

Run in the Supabase SQL editor. This simulates a real user's JWT — `postgres` bypasses
RLS, so a query run as yourself proves nothing.

```sql
create or replace function pg_temp.isolation_test() returns table(test text, outcome text)
language plpgsql as $$
declare v_rival uuid; v int;
begin
  insert into public.organisations (name, slug) values ('Rival Firm','rival-firm')
    on conflict (slug) do nothing;
  select id into v_rival from public.organisations where slug='rival-firm';
  insert into public.companies (name, user_id, org_id)
    values ('RIVAL-SECRET-CO', '<A-REAL-USER-UUID>', v_rival);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',
    '{"sub":"<THAT-SAME-USER-UUID>","role":"authenticated"}',true);

  select count(*) into v from public.companies where name='RIVAL-SECRET-CO';
  test:='read a company I OWN but in another org';
  outcome := case when v=0 then 'refused' else '*** LEAK ***' end; return next;

  begin
    insert into public.companies (name, user_id, org_id)
      values ('FORGED','<UUID>', v_rival);
    test:='insert into rival org'; outcome:='*** LEAK ***'; return next;
  exception when others then
    test:='insert into rival org'; outcome:='refused: '||sqlerrm; return next;
  end;

  select count(*) into v from public.gs_settings;
  test:='read GroundStream credentials'; outcome:=v||' visible'; return next;
end $$;

begin;
select * from pg_temp.isolation_test();
rollback;   -- ALWAYS rollback; this plants real rows
```

The strongest case is the first one: a row the user **owns** (`user_id` matches) but
in a foreign org. If ownership alone still grants access, the boundary is broken.

Results when this last ran (2026-07-21): all cross-org reads, inserts, moves,
self-joins and credential reads **refused**, including when attempted by an org admin.

---

## 7. Scars — mistakes already made here, do not repeat

1. **`supabase-js` RESOLVES `{data, error}`; it does not throw.** A bare `try/catch`
   catches nothing. Destructure `error` every time. This has bitten this codebase at
   least four times, twice in lines adjacent to a fix for the same bug.
2. **An RLS refusal updates 0 rows with NO error.** Guard every mutation on rows
   affected, or a disconnect button reports success having changed nothing.
3. **A policy body runs as the CALLING role.** Inlined subqueries against another
   table are subject to that table's RLS. Use `SECURITY DEFINER` helpers.
4. **`NOT NULL` added to live tables without a `DEFAULT` breaks every INSERT** at
   runtime while typecheck and build stay green.
5. **`RAISE WARNING` output is discarded by SQL-over-HTTP.** A security test "passed"
   while returning an empty result and proving nothing. Return a result *set*.
6. **A green build has never once caught a user-visible bug in this project.**
   Verify against the running system.
7. **Rebase before pushing.** A Launchpad bot syncs `CLAUDE.md`/`AGENTS.md`
   frequently and will put you behind mid-task. Re-run typecheck *after* the rebase.
8. Migrations applied via MCP are **not** written to `supabase/migrations/`
   automatically. Write the file too, or a fresh environment is missing the schema.

---

## 8. Working rules for this repo

- One working tree per session (`git worktree add`), commit before leaving one.
- Harvest real bugs to `~/.claude/pilot-harvest/meeting-minutes.md` (patterns, never
  code) and GroundStream findings to `~/.claude/gs-harvest/meeting-minutes.md`.
- `CLAUDE.md` and `AGENTS.md` are bot-managed. Vercel skips builds for commits that
  touch only those two files.

---

## 9. The module system (started 2026-07-23)

The app is becoming a **module system**: company secretarial is one vertical,
professional services the next, and vertical #3 should be a config file not a fork.
A module is five concerns — vocabulary, meeting types, completeness checks, output
template, extraction. This session built the first two plus the registry; the rest
is staged.

**Done and proven no-op:**
- `0043` — `modules` + `meeting_types` catalogue tables (deployment-level, the one
  deliberate exception to org_id-on-every-table; read-only, migration-seeded).
  `organisations.default_module_id`, `meetings.module_id`, `meetings.meeting_type_id`,
  all backfilled to cosec with the exact `meetingTypeCategory()` precedence, guarded
  by a composite FK.
- `lib/modules/{types,registry}.ts` + `cosec/` + `consulting/` — framework-free,
  unit-testable, **nothing imports it yet** (zero blast radius).
- `scripts/probes/module-registry.ts` — guards the code↔DB seam. Its meeting-type ids
  must match the 0043 seed or the composite FK silently rejects new meetings. If you
  edit either the migration seed or a module's `meetingTypes`, update both and re-run.

**NOT done, deliberately — the gated next steps (architecture plan Steps 2–6):**
1. **Extract the cosec assurance predicates into the module**, proven byte-identical to
   the current engine. GATED: this session changed the rule-based engine
   (`close_recorded`, `interest_declarations`), so stored `assurance_reports` no longer
   reflect current code and can't serve as the byte-identical reference. Regenerate a
   fresh baseline (needs meetings run through the current engine) before starting.
2. Switch dispatch from `meetingTypeCategory()` substring matching to `meeting_type_id`.
   Blocker: a consulting meeting named "Board of Advisors kickoff" matches `%board%` today.
3. Build the consulting module's checks + the narrow LLM extraction call (~$0.016/record,
   marks inferred commitments unconfirmed). This is the step that proves the abstraction —
   if it needs to touch `lib/assurance.ts`, the abstraction failed.
4. Feature migrations 0044+ (recap email, tags, scope-change, commitment direction, SOW,
   client timeline, voice). See the full architecture plan.

**Known blockers the architecture review surfaced (verified against real code):**
- `createReviewShare` (`app/meetings/[id]/draft/share-actions.ts:42`) gates on
  reviewed/final. The one-click recap needs `share_kind='acknowledgement'` to bypass that
  gate WITHOUT weakening the cosec attestation gate. `ShareKind` is already in the module types.
- `current_org_id()` returns NULL for the service-role client — webhook import, the recap
  drain, and background tagging must resolve org from the API key, GroundStream-style.
- No email provider in `package.json` — recap can't send until one is added + an outbox.
