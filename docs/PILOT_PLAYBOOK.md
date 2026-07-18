# Pilot Playbook — how bugs actually escaped, and the probes that catch them

Derived from the full build history of this app (v1 → V3). **Read this before any
pilot/QA pass and run the Run Sheet at the bottom.**

## The one finding that matters

Across the entire build, **every bug that reached the user was invisible to
typecheck, `next build`, unit tests, and code review.** All of them passed a green
CI-equivalent. They were caught only by *measuring the running system* or *using it*.

Corollary: a green build says "it compiles", not "it works". Verification effort
should go where compilation can't reach — computed styles, live DB state, the
generated artifact's actual text, the deployed infrastructure, and the real click path.

---

## Bug ledger (what happened → why the usual checks missed it)

| # | Bug | Impact | Why build/typecheck missed it | Found by |
|---|---|---|---|---|
| 1 | Vercel never git-connected | Pushes silently didn't deploy; "live" site was stale | Infra state, not code | Reading the deployment list |
| 2 | Live DB schema ≠ migrations | Wrong column names, missing table | DB is external state | Querying live schema |
| 3 | `"use server"` file exported a non-async const | Build failure | (caught by build — the cheap kind) | Build |
| 4 | Engine false positives: agenda fragments became "RESOLVED that second item…"; discussion sentences became resolutions; deferrals missed | Garbled statutory text — the actual deliverable | Output is a *string*; nothing asserts it reads correctly | Reading the generated minutes |
| 5 | **Missing `viewport` meta** | Every mobile breakpoint inert on real phones | CSS/classes all correct; nothing to typecheck | Measuring `documentElement.clientWidth` (980 ≠ 375) |
| 6 | `onFocus` handler passed in a server component | Runtime 500 on the page | Server/client boundary, runtime-only | Loading the page |
| 7 | `detectConflicts` used bare `limit(200)` with no filter | **Conflict-of-interest detection silently stopped** past 200 companies | Query is valid; returns rows; just the wrong ones | 1,000-firm scale sim |
| 8 | `entity_links_insert` RLS checked only `user_id` | Forge a directorship edge onto a victim's meeting → false conflict flag in their legal minutes | Read-path RLS was sound; write path wasn't | Adversarial audit (Opus + Codex agreed) |
| 9 | Homegrown regex HTML sanitizer | Stored XSS on the anonymous review link | Regex "looked" thorough | Adversarial audit + bypass test cases |
| 10 | Review share trusted client `(draftId, meetingId)` pair | IDOR | Both ids individually valid | Adversarial audit |
| 11 | Workspace co-member entity resolution stamped the owner's `user_id` | Graph silently never built for teams | Wrapped in try/catch → no error anywhere | Audit reasoning about the RLS change |
| 12 | Tailwind v4 `translate-x-*` toggle didn't apply | **Mobile drawer never slid in** — menu unusable | Class string was correct; `--tw-translate-x` even resolved to `0px` | Measuring `getBoundingClientRect().x` |
| 13 | `Create Meeting` had no pending state | Looked broken; user created **8 duplicate meetings** | Action worked — it was just slow and silent | Dogfooding the real click |
| 14 | `NEW_COMPANY_VALUE` exported from a `"use client"` file | **Every** new-company creation failed | Next swaps the export for a client-reference proxy; types still line up | Dogfooding + DB check |
| 15 | `"On <topic>," ` lead-ins not stripped | Malformed resolutions in the deliverable | Rule gap; only real prose exposes it | Dogfooding with a real document |
| 16 | Role words resolved as people ("Finance", "Company Secretary") + duplicate entities | Polluted the graph / memory value prop | Data quality, not code correctness | Chrome QA walkthrough |
| 17 | Export failed on cold-start 503 with no UI feedback | User sees nothing, assumes broken | Client never checked `response.ok` | Chrome QA walkthrough |
| 18 | Obligation regex matched the *actor* not the subject | Spurious "Lodge change of Secretary" duty | Regex matched something real | Reading generated obligations |

---

## Failure patterns → the probe that catches each

### A. Silent no-op (the dominant pattern — #7, #11, #14, #17, and arguably #13)
Something fails or takes the wrong branch and **nothing surfaces**: a `try/catch`
swallows it, RLS denies and returns 0 rows, or a comparison quietly evaluates false.

**Probe:** never accept "no error" as success. Assert the *effect*:
```js
// after any create/update, verify the row actually exists/changed
select count(*) … where <the thing you just did>
```
- After a UI action, check the DB, not just the absence of a red banner.
- Any `catch { console.error }` on a business-critical path is a candidate bug site — list them and ask "if this silently fails, what does the user see?" (Answer must not be "nothing".)

### B. Async action with no feedback (#13, #17)
**Probe:** for every button that triggers a server action or fetch, confirm it
(a) disables, (b) shows a pending label/spinner, (c) surfaces failure. If a click
can be repeated during flight, it *will* create duplicates.
```js
btn.click(); await sleep(300);
assert(btn.disabled === true && /…|ing/.test(btn.textContent));
```

### C. Framework boundary violations (#3, #6, #12, #14)
Server/client, `"use server"` export rules, and CSS-framework version semantics.
**Probe:**
- Constants shared with server actions must live in a **plain module**, never a `"use client"` file.
- `"use server"` files: async function exports only.
- Never pass event handlers from server components.
- **Don't trust a class name — measure the computed result.** Tailwind v4 emits
  transforms via the CSS `translate` property; a correct-looking class can be overridden.
```js
getComputedStyle(el).translate; getComputedStyle(el).transform; el.getBoundingClientRect();
```

### D. Silent degradation at scale (#7)
An arbitrary `limit(N)` with no `WHERE` is a correctness bug, not a perf choice.
**Probe:** grep for `.limit(` and for each ask "if the row I need is outside this
slice, does the feature go *wrong* or just show *less*?" Wrong ⇒ scope the query.
Run a scale sim before claiming a feature works.

### E. Write-path authorization (#8, #10)
Read RLS being correct says nothing about writes.
**Probe:** for every table, verify INSERT/UPDATE policies bind **both** sides of a
relationship (`entity_id` belongs to me **and** `meeting_id` is one I can access),
and that server actions re-verify ownership with `.eq(parent_id, …)` + a 0-row guard.
Test by attempting a forged cross-tenant write.

### F. Rule/NLP gaps only real input reveals (#4, #15, #16, #18)
Synthetic test transcripts are written to pass. Real prose has "On the launch
timeline,", "Company Secretary to lodge…", "Finance" as an owner.
**Probe:** **read the generated artifact end-to-end, every time.** Counts (3 resolutions,
5 actions) prove nothing about whether the text is correct. Feed at least one real,
messy, human-written document per pilot.

### G. Environment/infra assumptions (#1, #2, #5)
**Probe:** verify wiring rather than assuming it — is git actually connected, is the
env var actually set, does the live schema match the migrations, is `viewport` meta
actually in the HTML.

---

## Verification anti-patterns (mistakes made *while* testing)

These cost real time this build — avoid repeating them:

1. **Trusting the class string / source over the computed result.** (#12 was found only after measuring geometry; the class said `translate-x-0`.)
2. **Reading React state in the same tick as the click.** State updates are async — always wait, then re-read, or you'll conclude "it didn't work" when it did.
3. **Concluding "broken" from too short a wait.** #13 looked like a dead button; it was a ~4s action. Poll for the *effect* with a generous timeout before declaring failure.
4. **Deleting `.next` (or running `bun run build`) while the dev server is live** — corrupts its manifests and produces phantom "Internal Server Error" pages that look like app bugs. Stop the preview server first.
5. **Assuming the tool is honest about scope.** The in-app Browser pane's `screenshot` times out and its auth cookie doesn't persist in this environment — use `read_page`/`javascript_tool`, or the Chrome extension, and say so rather than silently skipping verification.
6. **Believing a subagent's "verified" without independent evidence.** Agents reported "typecheck + build pass" while shipping an unusable drawer (#12) and an inert viewport (#5). Re-verify the *behaviour*, not their summary.

---

## Pilot run sheet (execute in order)

**0. Infra reality check** — git↔deploy connected? latest commit actually the live
deployment? required env vars present? live schema == migrations?

**1. Journey, on the deployed build, as a real signed-in user.** Company → meeting →
transcript → generate → review → approve → export → share/confirm. Use a **real,
messy document** at least once.

**2. Read the artifact.** Open the generated minutes and read every resolution and
action item as a cosec would. Check statutory phrasing, no double "RESOLVED", no
agenda fragments, no role-words-as-people, obligations traced to the right trigger.

**3. Effect assertions.** After each mutating action, confirm in the DB that the row
exists / changed as expected.

**4. Every button.** Enumerate interactive controls per screen; click each; confirm
pending state, success effect, and error surfacing. Flag any control with no feedback.

**5. Measure mobile at 375px** — `documentElement.clientWidth === 375` (proves the
viewport meta works), `scrollWidth - clientWidth === 0` per page, tap targets ≥44px,
open/close the drawer and assert its measured `x` reaches 0 and returns off-canvas.

**6. Scale + adversarial** — for new query paths, sim at portfolio scale and check for
unbounded/arbitrary limits; for new write paths, attempt a forged cross-tenant write.

**7. Report honestly** — state what was verified *by observation* vs *by inference*,
and name anything you couldn't check (and why). "Probably fine" is not verified.
