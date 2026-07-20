# DESIGN SPEC V4 — Search, Company Document Cabinet, Owner = Real Person

Status: design spec only. No application code changed by this document.
Audience: whoever builds these three surfaces next.

---

## 0. The premise these designs are built on

Minutes are not a record of what was said. They are an **insurance document**, read three
years later by an auditor or a litigator hunting for what is *missing*. The user is a
company secretary who is personally liable for omissions. They are slow because they are
**afraid**, not because they are inefficient.

Every design decision below is answerable to one question: *does this reduce the fear of
having missed something, without ever manufacturing false comfort?*

Three rules follow, and they are hard rules, not preferences:

1. **Unknown must look different from verified.** Absence of a finding is not a pass.
   Anywhere the app currently renders a green tick it must be able to say *what evidence
   earned it*.
2. **Never claim a scope you did not search.** If search covered five object types and the
   sixth query failed, the user is told, in the results, that resolutions were not searched.
   Silent partial results are the single most dangerous failure mode in this product.
3. **Provenance beats presentation.** "Quorum threshold: 3 of 5" is worth nothing.
   "Quorum threshold 3 of 5 — read from Constitution, uploaded 12 Jun 2026" is the product.

### Design language already in the codebase (match it, do not invent)

Observed in `components/ui.tsx`, `app/site-header.tsx`, the draft panels:

| Token | Value |
|---|---|
| Surface card | `rounded-lg border border-neutral-200 bg-white p-5 shadow-sm` |
| Section heading | `text-xs font-semibold tracking-wide text-neutral-500 uppercase` |
| Page heading | `text-lg font-semibold text-neutral-900` |
| Body | `text-sm text-neutral-800`; meta `text-xs text-neutral-500` |
| Accent | indigo-600 (primary action), indigo-50/700 (active nav, informational badge) |
| Semantic | emerald = earned pass, amber = warn / unverified, red = fail / overdue, neutral = unknown-and-not-yet-assessed |
| Badge | `<Badge variant="neutral|amber|green|red|indigo">` |
| Empty | `<EmptyState title message action compact />` — dashed border card |
| Focus | `FOCUS_RING` on every interactive element, no exceptions |
| Tap target | `tap-target` / `min-h-11` on mobile, may relax to `sm:min-h-0` |
| Severity glyph | `✓` `!` `✕` in a 20px circle — **always paired with text**, never colour alone |
| Content width | `mx-auto max-w-3xl` for detail pages; lists go full width of the shell |
| Shell | fixed 240px left sidebar at `md+`, sticky top bar + 288px drawer below |

New tokens introduced by this spec — exactly one:

| Token | Value | Meaning |
|---|---|---|
| **Evidence chip** | `inline-flex items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] text-neutral-600` with a 12px document glyph | "this statement is backed by a named document". Clicking opens that document. Never rendered without a real link target. |

There is no other new visual vocabulary in V4. This is a legal document tool; the restraint
is the aesthetic.

---

# 1. SEARCH

## 1.1 The decision: both surfaces, one engine

Build **a command palette *and* a dedicated results page**, sharing one ranking function
and one set of result-row components.

Justification — a cosec has exactly two search jobs, and they are not the same job:

- **Recognition** ("open the Nusantara EGM from March") — needs to resolve in under two
  seconds without leaving the current page. That is a palette. A page is too slow and
  loses their place mid-draft.
- **Investigation** ("has this board *ever* resolved anything about the bank mandate?") —
  needs filters, a full result set, a scroll position, and a **URL they can paste into an
  email to the auditor**. That is a page. A palette that vanishes on blur is actively
  hostile to this job.

Shipping only one of them forces the other job into the wrong shape. Shipping two *engines*
would let them disagree, which in this product is a correctness bug: if the palette shows a
resolution the page does not, the user cannot trust either. So: two surfaces, one engine,
identical row components.

The palette is the fast lane; every palette result set ends with a row that hands off to
the page. The page is the source of truth.

## 1.2 Entry points

| Context | Entry |
|---|---|
| Desktop, anywhere | `⌘K` / `Ctrl K` opens the palette |
| Desktop, anywhere not in a text field | `/` opens the palette |
| Desktop sidebar | A "Search" row directly beneath **New Meeting**, above the nav list. Left-aligned magnifier glyph + label "Search" + right-aligned `⌘K` hint in `text-[11px] text-neutral-400`. Clicking opens the palette (not the page — muscle memory should converge on one thing). |
| Mobile top bar | A magnifier icon button between the hamburger and the `+` button, `tap-target`. Tapping navigates to `/search` (full page). **No palette on mobile** — a modal overlay over a 375px viewport with a soft keyboard open leaves ~180px of results. That is not a search experience. |
| Deep link | `/search?q=…&type=…&company=…` — always shareable |

The palette is a modal dialog: `role="dialog" aria-modal="true"`, centred, `max-w-2xl`,
`top-[12vh]`, backdrop `bg-neutral-900/40`. It reuses the drawer's existing scroll-lock and
Escape handling patterns from `site-header.tsx`.

## 1.3 Scope

Search covers six object types:

| Type | Fields searched | Not searched (and we say so) |
|---|---|---|
| Minutes / meetings | company name, meeting type, venue, chairperson, attendee names, draft body text | — |
| Resolutions | resolution number, resolution text | — |
| Action items | description, recorded owner name | — |
| Obligations | title, detail | — |
| Companies | name, reg no, aliases | — |
| People | canonical name, **all aliases** | — |
| **Documents (V4.2)** | filename, document type, label, effective date | **file contents** — see 1.9 |

People search must hit aliases. The existing `/people` list has a documented gap where
alias-only matches past the page limit disappear (`app/people/data.ts`). Global search must
not inherit that gap: alias matching is pushed into the query, not filtered in JS after a
`LIMIT`. If that is not achievable in the first pass, the People group header must read
*"Names only — aliases not searched"*. It must not silently under-return.

## 1.4 Grouping and ranking

**Results are grouped by object type, in a fixed order. They are never interleaved by score.**

Fixed order: **Minutes → Resolutions → Obligations → Action items → Companies → People**.

Justification: a cosec almost always knows *what kind of thing* they are looking for before
they know which one. Relevance-interleaving forces them to read every row to find the two
resolutions in a list of forty. A fixed order means the eye learns where resolutions live
and jumps there. The order itself is by statutory weight — the things that get you sued
first are first. It does not reorder based on the query, ever, because a layout that moves
under you is a layout you have to re-read.

Exception, and only one: if a query is an **exact-and-unique** match on a company name, a
person's canonical name, or a resolution number (e.g. `BR-2026-04`), that single record is
promoted to a **Top result** block above all groups, labelled `Exact match`. One row
maximum. This handles "I typed the resolution number, give me the resolution" without
compromising the stable ordering below it.

Ranking *within* a group:

1. Exact phrase match in the primary field (resolution number, company name, person name)
2. Whole-word match in the primary field
3. Match in secondary/body text
4. Then, as tiebreak, **recency of the underlying meeting date, descending**

Recency is the tiebreak and not the primary sort, deliberately: the fear case is finding an
*old* thing, and a pure-recency sort buries exactly what the auditor is asking about.

Group caps: palette shows **top 3 per group** plus a `Show all N in <Type> →` row when
there are more. The page shows **20 per group** with a `Load more` per group.

## 1.5 Result row anatomy

The row must let a cosec recognise the right record **without opening it**. That means
every row answers: *what is it, which company, when, and is it safe?* Rows are two lines on
desktop, three on mobile. Line 1 is identity; line 2 is context + state.

Shared row chrome: full-width button/link, `px-3 py-2.5`, `hover:bg-neutral-50`,
`aria-selected` styling `bg-indigo-50` when keyboard-focused, `FOCUS_RING`. Matched query
terms are wrapped in `<mark class="bg-amber-100 text-neutral-900 rounded-sm px-0.5">`.

**Minutes / meeting**
```
Nusantara Holdings Sdn Bhd · Board Meeting                    [Final] [Confirmed]
12 Mar 2026 · Level 8 Boardroom · v3 · 4 resolutions · assurance 90
```
- Status badge uses the existing `StatusBadge`. Confirmation state is its own badge:
  `Confirmed` (green) / `Awaiting confirmation · 41 days` (amber) / no badge if not sent.
- Assurance score is shown **only if a report exists**. If none: `assurance not run`
  in `text-neutral-400`. It never renders as a zero or as a tick.

**Resolution**
```
BR-2026-04 — That the Company open a current account with…      [Carried]
Nusantara Holdings · Board Meeting · 12 Mar 2026
```
- Snippet is ~110 chars from the resolution text, truncated on a word boundary with `…`.
- `OutcomePill` for carried/deferred/lapsed. If outcome is missing: `[Outcome not recorded]`
  amber badge — this is a real assurance failure and search is a legitimate place to see it.

**Obligation**
```
File Form 24 with SSM                                    [Open] [Due in 6 days]
Nusantara Holdings · from BR-2026-04 · SSM filing
```
- Due chip: red `Overdue by N days`, amber `Due in N days` (≤14), neutral `Due 30 Apr 2026`,
  and `No due date` in neutral-400 when null. Never blank.

**Action item**
```
Circulate the revised mandate to all signatories            [Open] [Overdue 9 days]
Nusantara Holdings · Board Meeting 12 Mar 2026 · Aisyah Rahman ✓
```
- Owner rendering follows §3.2 exactly: linked person gets the person glyph, unlinked free
  text gets an amber `name (not linked)`, nothing gets a red `Unassigned` badge.

**Company**
```
Nusantara Holdings Sdn Bhd                                       201901234567
14 meetings · 3 open obligations · Constitution on file ✓
```
- The third fact is the cabinet's headline (§2.4). If the Constitution slot is empty it
  reads `No constitution on file` in amber. This is the highest-leverage single fact about
  a company in this product and it belongs in the search row.

**Person**
```
Aisyah binti Rahman                              also: A. Rahman, Aisyah R.
Director at 3 companies · 7 meetings · owes 4 open items (1 overdue)
```

**Document** (when 2.x ships)
```
Constitution — Nusantara Holdings                      [In force since 12 Jun 2026]
PDF · 2.4 MB · uploaded by hafiz@… on 12 Jun 2026 · filename & label matched
```
- The trailing clause is mandatory and is the honest-state guard: it states *why* this
  document matched, so the user never assumes the contents were searched.

## 1.6 The dedicated page — `/search`

Layout, `375px` → up:

```
┌──────────────────────────────────────────────────────────┐
│ Search                                                   │  h1, text-lg
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🔍  bank mandate                                  ✕  │ │  large input, text-base
│ └──────────────────────────────────────────────────────┘ │  (16px — never 14px, iOS zooms)
│                                                          │
│ [All 34] [Minutes 6] [Resolutions 4] [Obligations 2]     │  scope chips, horizontally
│ [Actions 9] [Companies 1] [People 12]                    │  scrollable on mobile
│                                                          │
│ Company: [ All companies ▾ ]   Date: [ Any time ▾ ]      │  secondary filters, collapse
│                                                          │  into a "Filters (2)" disclosure
│ 34 results for "bank mandate"                            │  aria-live="polite"
│ ─────────────────────────────────────────────────────────│
│ MINUTES  6                                               │  sticky group header
│  ▸ row                                                   │
│  ▸ row                                                   │
│                                        Load more (3) →   │
│ ─────────────────────────────────────────────────────────│
│ RESOLUTIONS  4                                           │
│  …                                                       │
└──────────────────────────────────────────────────────────┘
```

- Scope chips are **filters, not tabs**: selecting `Resolutions` narrows to that group and
  updates `?type=resolution`. `All` is default. Counts on chips are real counts, and if a
  count could not be computed the chip shows `Resolutions —` with a tooltip/`title` of
  "count unavailable", never `0`.
- Group headers are `sticky top-0` with a white background at the group boundary, using the
  established uppercase micro-heading style.
- The result count line is an `aria-live="polite"` region so screen-reader users hear the
  set change without the focus moving.
- Every filter change rewrites the URL (`replaceState` while typing, `pushState` on filter
  change) so the back button behaves and the URL is pasteable.

## 1.7 The palette

```
┌────────────────────────────────────────────────────────┐
│ 🔍  bank mand|                                    Esc  │
├────────────────────────────────────────────────────────┤
│ EXACT MATCH                                            │
│  ▸ BR-2026-04 — That the Company open a current…       │
├────────────────────────────────────────────────────────┤
│ MINUTES                                            6   │
│  ▸ …                                                   │
│  ▸ …                                                   │
│  ▸ …                                                   │
│    Show all 6 in Minutes →                             │
├────────────────────────────────────────────────────────┤
│ RESOLUTIONS                                        4   │
│  …                                                     │
├────────────────────────────────────────────────────────┤
│ ↑↓ navigate   ↵ open   ⌘↵ new tab      See all 34 →    │  footer, text-[11px]
└────────────────────────────────────────────────────────┘
```

- Max height `60vh`, internal scroll, the footer pinned.
- Empty query state shows two blocks: **Recent** (last 5 records this user opened, any
  type) and **Jump to** (four static rows: Action items needing an owner · Overdue
  obligations · Companies · People). No fabricated "suggested" content.

## 1.8 States

| State | Treatment |
|---|---|
| **Idle / empty query** | Palette: Recent + Jump to (above). Page: `<EmptyState title="Search everything" message="Minutes, resolutions, obligations, action items, companies and people. Try a resolution number, a company, or a phrase from a decision." />` |
| **Query too short** (1 char) | No request fired. Hint line: `Keep typing — at least 2 characters.` Neutral, not an error. |
| **Loading** | Group skeletons: three rows of two grey bars (`h-3 w-2/3` / `h-2.5 w-1/3`, `animate-pulse`, `bg-neutral-100`). The **previous result set stays visible, dimmed to 60%,** while a new set loads — no layout collapse mid-typing. Debounce 200ms. A spinner appears in the input's right edge only after 400ms so fast queries never flash. |
| **No results** | `<EmptyState title="No matches for “bank mandate”" message="Search covers minutes, resolutions, obligations, action items, companies and people. Document contents are not searched — see the company's Documents tab." action={<Link>Clear filters</Link>} />` The message names the scope, because "no results" and "not searched" are different facts and the user must not conflate them. |
| **No results *within an active filter*** | Distinct copy: `No matches in Resolutions. 34 matches in other types — [Search everything].` Never let a filter make the app look empty. |
| **Partial failure** | **Mandatory and non-negotiable.** If one or more source queries fail, results render for the sources that succeeded, and a full-width amber notice sits **above the first group**: `⚠ Resolutions could not be searched right now. These results are incomplete. [Retry]` The result count line changes to `28 results (Resolutions not searched)`. Under no circumstances does a partial result set render as if it were complete. |
| **Total failure** | Red-bordered card matching the existing action-items error card: `Search is unavailable right now. Nothing has been searched — please retry.` The words "nothing has been searched" are load-bearing. |
| **Truncation** | If a group hits its hard cap, the group footer reads `Showing 20 of 340 — narrow with filters` in `text-xs text-neutral-500`, mirroring the existing action-items `atLimit` pattern. |
| **Permission-scoped** | Results are RLS-scoped. No "N hidden results" counter — that leaks existence. Silence is correct here and is the one place it is. |

## 1.9 What search does *not* claim

A visible, permanent line in the page footer and in the palette's empty state:

> Search covers record fields — titles, names, resolution text, descriptions and minutes
> body text. **Uploaded document files are matched on filename, type and label only; their
> contents are not searched.**

This sentence exists because a cosec who believes the constitution was full-text searched
and got no hits will conclude the clause does not exist. That is the exact failure this
product is built to prevent. When/if document text extraction ships, this line changes and
per-document rows gain a `contents searched` vs `filename only` chip — per document, based
on whether extraction actually succeeded for that file, not on whether the feature exists.

## 1.10 Keyboard & accessibility

- Combobox pattern: input has `role="combobox"`, `aria-expanded`, `aria-controls` →
  listbox id, `aria-activedescendant` → the focused option's id. Rows are
  `role="option"` inside `role="listbox"`; group headers use `role="presentation"` with the
  groups wrapped in `role="group"` + `aria-labelledby`.
- `↑` / `↓` traverse the **flattened** list across group boundaries — the user should never
  have to know groups exist to move. Wraps at both ends.
- `Enter` opens. `⌘/Ctrl + Enter` opens in a new tab. `Esc` closes the palette and returns
  focus to the element that opened it. On `/search`, `Esc` clears the input; a second `Esc`
  does nothing (never navigates away from a page of results).
- `Tab` inside the palette moves to the "See all" footer link and then cycles — focus is
  trapped in the dialog, matching the existing drawer's `inert` approach.
- Focus is **never** moved to the results list automatically on keystroke; the input keeps
  focus and `aria-activedescendant` does the work. Moving real focus breaks typing.
- Result counts announced via `aria-live="polite"`, debounced to fire once per settled
  query, not per keystroke.
- All highlighting uses `<mark>`, which carries semantics, not a styled `<span>`.
- Colour is never the only signal: `Overdue` is a word, not a red dot.
- Every row is a real `<a>` with a real `href`, so middle-click, ⌘-click and "copy link"
  work. The palette intercepts plain clicks for client nav only.

## 1.11 Mobile (375px)

- `/search` only; no palette.
- Input is `text-base` (16px) and `sticky top-0` under the app bar so the query stays
  visible while scrolling results.
- Scope chips: single horizontally scrollable row, `overflow-x-auto`, `snap-x`, no wrap,
  with `-mx-4 px-4` bleed so the first chip aligns with the content edge.
- Company/date filters collapse into a single `Filters` disclosure button showing an active
  count badge; expanded, they stack full width.
- Result rows become three lines (identity / context / state chips wrap onto their own
  line). No horizontal scroll anywhere — badges wrap, they do not overflow.
- Group headers stay sticky under the input (two stacked sticky elements; account for the
  combined offset).

---

# 2. COMPANY DOCUMENT CABINET

## 2.1 The decision: typed slots, not a file list

The cabinet is **not** a folder. It is a **checklist of the document types this app needs in
order to make its checks trustworthy**, rendered as slots — and slots can be *empty*, which
is the entire point. A generic upload area would let a company sit with nothing on file and
look identical to a company with a full record.

The cabinet's job is to answer, at a glance: *what am I checking these minutes against, and
is it real?*

Routes:
- `/companies/[id]/documents` — the cabinet.
- The company detail page gains a **Documents** section above "Resolutions register",
  showing the slot summary (§2.4) with a `View all documents →` link.

## 2.2 Document types

Two shapes of slot.

**Single-in-force slots** — exactly one document is in force at a time; older ones are
superseded, never deleted.

| Type | Why it matters |
|---|---|
| Constitution / M&A | Quorum thresholds, resolution majorities, chair's casting vote |
| Terms of Reference | Per committee — committee quorum and mandate. Multiple ToRs allowed, one per named committee. |
| Register of Directors | Who was actually a director on the meeting date |
| Register of Members | Shareholder resolutions, related-party detection |
| Board mandate / authority matrix | Whether the board could resolve what it resolved |

**Collection slots** — many documents, each independently dated, none supersedes another.

| Type | Notes |
|---|---|
| Signed prior minutes | One per meeting. Where possible, linked to the meeting record. |
| SSM filings | Typed by form (Form 24, Form 44, Annual Return…), each with a filing date |
| Other | Deliberately last, deliberately unglamorous |

## 2.3 Document states — the honest-state core

Each document carries exactly one state, and each state has a distinct glyph + word + colour.
Colour alone is never the signal.

| State | Badge | Meaning |
|---|---|---|
| **In force** | green `✓ In force since 12 Jun 2026` | Current authority for this type |
| **Superseded** | neutral `Superseded 12 Jun 2026` | Replaced. Still retrievable; still the correct authority for minutes finalised before that date. |
| **Effective date unknown** | amber `! Effective date not recorded` | Uploaded but undated. **Cannot** be used to back a check — see below. |
| **Missing** | amber, on the empty slot: `! Not on file` | The slot exists and is empty |
| **Not applicable** | neutral `Marked not applicable — <reason>` | Explicitly dismissed by a named user with a reason and a date. Requires a typed reason; not a checkbox. |

The rule that makes this matter: **a check may only cite a document that is `In force` for
the meeting's date.** A document with an unknown effective date cannot back a check, and any
check depending on it degrades from a green pass to a neutral "Not verified", *not* to a
red fail. Unknown is a third state, and it looks like a third state — grey with a question,
not green with a tick and not red with a cross.

## 2.4 Cabinet layout

Desktop, `mx-auto max-w-3xl` matching company detail:

```
← Nusantara Holdings Sdn Bhd
Documents                                            [ Upload document ]

┌───────────────────────────────────────────────────────────────────┐
│ WHAT THESE DOCUMENTS UNLOCK                                       │
│  ✓ Quorum threshold — 3 of 5 directors                            │
│      from Constitution, in force since 12 Jun 2026        [view]   │
│  ✓ Directors on record — 5                                        │
│      from Register of Directors, in force since 04 Jan 2026 [view] │
│  ! Committee quorum — not verified                                │
│      No Terms of Reference on file for Audit Committee            │
│      Audit Committee minutes cannot be quorum-checked  [Upload →] │
└───────────────────────────────────────────────────────────────────┘

CORE DOCUMENTS
┌───────────────────────────────────────────────────────────────────┐
│ Constitution / M&A                          ✓ In force 12 Jun 2026│
│ constitution-2026.pdf · 2.4 MB · uploaded by hafiz@… 12 Jun 2026  │
│ Backs: quorum threshold, resolution majority                      │
│                          [Download]  [Replace]  [History (2)]     │
├───────────────────────────────────────────────────────────────────┤
│ Terms of Reference                                  ! Not on file │
│ Committee quorum checks will report "not verified" without this.  │
│                                              [Upload]  [N/A]      │
├───────────────────────────────────────────────────────────────────┤
│ Register of Directors                       ✓ In force 04 Jan 2026│
│ …                                                                 │
└───────────────────────────────────────────────────────────────────┘

SIGNED PRIOR MINUTES                                             (7)
┌───────────────────────────────────────────────────────────────────┐
│ Board Meeting — 12 Mar 2026        signed 20 Mar 2026  [Download] │
│   ↳ linked to this meeting in the app ✓                           │
│ Board Meeting — 08 Jan 2026        signed 15 Jan 2026  [Download] │
│   ↳ no matching meeting record in the app                         │
└───────────────────────────────────────────────────────────────────┘

SSM FILINGS                                                      (3)
…

OTHER                                                            (1)
…
```

The **"What these documents unlock"** panel is the top of the page and the reason the
feature exists. It is not a summary of the files; it is a list of *derived facts and their
sources*, and a list of *facts that cannot be derived because a document is absent*. Its
rows use the exact `✓ / ! ` glyph vocabulary already established in the assurance panel, so
a user reads them the same way.

Every row in that panel is one of:
- **Derived and sourced** — green tick, the value, the document, the in-force date, a link.
- **Not verified** — amber `!`, the missing input named, the consequence stated in plain
  words ("Audit Committee minutes cannot be quorum-checked"), and the fix as a button.
- **Entered manually** — neutral, `Quorum threshold — 3 of 5 · entered by hafiz@… on 2 Apr 2026 · no supporting document`. This is a distinct third row type and it must never
  render with a green tick. A number a human typed is not a number the constitution says.

## 2.5 Provenance in the rest of the app

The evidence chip (§0) is how the cabinet pays off outside its own page.

On the **assurance panel**, a check that was computed against a document gains a chip under
its detail line:

```
✓ Quorum stated
  The minutes state a quorum position: 3 of 5 directors present.
  [📄 Constitution · in force 12 Jun 2026]
```

And the honest counterpart, which is more important:

```
! Quorum threshold not verified
  The minutes state 3 directors were present, but no Constitution is on file for
  this company, so the required threshold could not be checked.
  [Upload Constitution →]
```

Same chip appears on: the governance risk panel (register-of-directors-backed conflict
findings), company detail defaults, and the meeting draft header where quorum is asserted.

**A check never renders the chip unless the document exists, is in force for the meeting
date, and actually produced the value.** If the check is rule-based with no document behind
it, there is no chip — and its detail text says so.

## 2.6 Upload flow

Trigger: `Upload document` button (page level), or `Upload` on a specific empty slot
(pre-selects the type).

A modal (desktop) / full-screen sheet (mobile) with four fields, in this order:

1. **File** — drop zone + button. Accept `.pdf .docx .doc .jpg .png`. Max 25 MB. Show
   filename, size and a client-side type check immediately on selection.
2. **Document type** — required `<select>`, grouped Core / Collections / Other. If a slot
   was pre-selected it is filled and shown as a chip with a `change` link. **The filename is
   never used to auto-select the type.** We may show `Looks like a Constitution?` as a
   *suggestion chip the user must click to accept*, and if unaccepted, the type stays
   unset and the form does not submit. An auto-classified document is an unverified claim
   wearing a verified costume.
3. **Effective from** — date. Required for single-in-force types; optional for collections.
   Helper text: `The date this version took effect — usually the date it was adopted, not the date you received it.` If the user cannot supply it there is an explicit
   `I don't know` checkbox which stores null and lands the document in the amber
   *Effective date not recorded* state, with an inline warning **shown before submit**:
   `Without an effective date, this document cannot be used to verify any check.`
4. **Label** (optional) — free text, e.g. "As amended by special resolution SR-2025-01".

Committee ToRs additionally require a **committee name** field.

Submit states: button shows `Uploading…` and is disabled (the project has a documented
history of missing pending states — see CLAUDE.md gotchas; this is a hard requirement, not
a nicety). Progress bar for files >2 MB. On success, close, toast-free — the new row simply
appears with a brief `bg-indigo-50` highlight that fades. On failure, the modal stays open,
the file selection is preserved, and a red inline error states what failed.

## 2.7 Replace / supersede

`Replace` on a single-in-force slot opens the same modal, pre-typed, with a warning banner:

> The current Constitution (in force since 12 Jun 2026) will be marked superseded from the
> new document's effective date. It stays on file and remains the authority for minutes
> finalised before that date.

That second sentence is the whole model. **Nothing is ever deleted.** There is no delete
action for a document that has ever backed a finalised set of minutes. For documents that
have not, a `Remove` action exists behind a confirm and is recorded in `audit_logs`.

If the new document's effective date is **earlier** than the current one's, block submission
with: `This document's effective date is before the current version's. Supersession must move forward in time.` — with an escape hatch to instead file it as a historical version
(inserted into the history, not made in force).

`History (2)` expands inline to a compact timeline:

```
● constitution-2026.pdf     in force 12 Jun 2026 → present    [Download]
○ constitution-2019.pdf     in force 03 Feb 2019 → 12 Jun 2026 [Download]
```

## 2.8 "What was in force on the meeting date"

On any meeting/draft page, a small collapsed line in the header area:

```
Checked against: Constitution (12 Jun 2026) · Register of Directors (04 Jan 2026)   ⌄
```

Expanded, it lists every document that was in force **on that meeting's date** — not
today's. Because minutes finalised two years ago were checked against the constitution as
it then stood, and an auditor asking "what did you check this against" needs that answer,
not the current one. If a document was superseded after the meeting, the expanded row says
`superseded 14 Aug 2026 — this meeting was checked against the earlier version`.

## 2.9 States

| State | Treatment |
|---|---|
| **Cabinet empty** (no documents at all) | Slots still render, all in `! Not on file`. Above them: `<EmptyState title="No documents on file" message="Until a constitution is uploaded, quorum thresholds and resolution majorities cannot be verified — checks that depend on them will report “not verified”." action={<UploadButton/>} />` The empty state states the *consequence*, not a platitude. |
| **Loading** | Slot skeletons preserving row height so nothing jumps. The "unlocks" panel shows a single skeleton row, never a premature "all verified". |
| **Partial load failure** | If document metadata loads but the derived-facts panel fails: render the panel as `Could not determine what these documents verify. [Retry]` — amber, not hidden. A missing panel would read as "nothing to verify". |
| **Upload in progress** | Row appears immediately in a pending style: 60% opacity, `Uploading…` badge, no action buttons, and **it does not count toward any "in force" state or unlock any check** until the upload completes. |
| **Upload failed** | Pending row converts to a red-bordered row: `Upload failed — <reason>` with `[Retry]` and `[Dismiss]`. It never silently disappears. |
| **File unreadable / virus-scan pending** | If the pipeline defers scanning: neutral `Scanning…` badge; the document is listed but is not `In force` and backs nothing until cleared. |
| **Download error** | Inline red text on the row, not a page-level failure. |
| **Marked N/A** | Slot renders neutral with the reason and the user and date: `Not applicable — company limited by guarantee, no Register of Members · marked by hafiz@… 2 Apr 2026 · [Undo]`. |

## 2.10 Mobile (375px)

- The "unlocks" panel is first, full width, rows stack to two lines with the action button
  full-width beneath.
- Slot rows become cards: title + state badge on line 1 (badge wraps below on narrow), meta
  on line 2, actions as a full-width row of equal-width buttons at the bottom
  (`Download | Replace | History`), each `min-h-11`.
- Collections collapse to `<details>` per group, closed by default beyond the first 3 items,
  with a count in the summary.
- Upload is a full-screen sheet, not a centred modal, with a sticky footer holding
  `Cancel` / `Upload`. The file input uses the native picker (which gives camera capture on
  mobile — genuinely useful for photographing a signed page).
- The history timeline stacks; the connecting line is dropped below `sm`.

## 2.11 Accessibility

- Each slot is a `<section>` with an `<h3>`; the state badge text is inside the heading's
  accessible name so a screen reader hears "Constitution, in force since 12 June 2026".
- The unlocks panel is a `<ul>` with each row's status as leading text (`Not verified:`),
  not conveyed by the glyph — the glyph is `aria-hidden`, exactly as the assurance panel
  already does it.
- Upload progress uses `role="progressbar"` with `aria-valuenow`; completion announced via
  a polite live region.
- The drop zone is keyboard-reachable and has a visible focus state; a keyboard user can
  always use the button instead.
- Destructive/irreversible actions (`Replace`, `Mark N/A`, `Remove`) require an explicit
  confirm step with the consequence spelled out in the confirm body — never in the button
  label alone.

---

# 3. OWNER = REAL PERSON

## 3.1 The problem

`action_items.owner_name` is free text. The assurance check
`checkActionsHaveOwners` passes on *any* non-empty string. "Finance", "TBC", "Aisyah",
"the CFO" all count as owned. That is an unearned pass in the exact place the product
claims to protect the user, and it means the app cannot answer the only question that
matters at the next meeting: **who owes what, and is it late?**

## 3.2 The model: three owner states, never two

Add `owner_person_id uuid null → entities(id)`. **Keep `owner_name`** as the *recorded*
text — it is what the minutes say, and the minutes are the legal record. The link is an
overlay on the record, never a rewrite of it.

| State | Rendering | Meaning |
|---|---|---|
| **Linked** | `Aisyah binti Rahman` as a link, with a small person glyph, neutral | A real person entity. Chaseable, aggregatable. |
| **Named, not linked** | `Aisyah` + amber badge `Not linked` | The minutes name someone; the app does not know who. |
| **Unassigned** | em dash + amber badge `No owner` (existing behaviour) | Nobody is recorded. |

The assurance check must be split accordingly:

- `actions_have_owners` — **fail** if any item is unassigned (currently `warn`; an
  action item with no owner is a classic audit finding, it is not a nicety).
- `owners_resolved` — **warn** if any owner is named-but-unlinked, detail:
  `2 action item owners are recorded as text only and are not linked to a known person: "Aisyah", "Finance".`

Two checks, because they are two different risks: nobody is accountable vs. we cannot prove
who is.

**We never auto-link.** A fuzzy match that silently binds "Aisyah" to *Aisyah binti Rahman*
is the app asserting a fact it inferred. We *suggest*, ranked, with the evidence visible,
and a human clicks. One exception, and it is narrow: an **exact, case-insensitive, unique**
match on a person's canonical name **or a recorded alias**, *within people already linked to
this company*, may be pre-selected in the picker — pre-selected, still requiring the save,
and shown with a `suggested — exact name match` note. It is never applied without an action.

## 3.3 Assigning an owner — the picker

Trigger: click the owner cell on `/action-items`, on the draft page's action item rows, or
on the company's open-actions list. It is a combobox, not a modal — assignment is a
high-frequency, low-ceremony act.

```
┌──────────────────────────────────────────────────────┐
│ Owner                                                │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ais|                                             │ │
│ └──────────────────────────────────────────────────┘ │
│ AT NUSANTARA HOLDINGS                                │
│  ▸ Aisyah binti Rahman        Director · 7 meetings  │
│      also: A. Rahman                    suggested ✓  │
│  ▸ Aisha Tan                  Secretary · 2 meetings │
│ ELSEWHERE IN YOUR WORKSPACE                          │
│  ▸ Aisyah Kamal    Director at Meridian · 1 meeting  │
│ ─────────────────────────────────────────────────────│
│  + Create person "Aisyah"                            │
│  ○ Keep as text only — "Aisyah"                      │
│  ✕ Clear owner                                       │
└──────────────────────────────────────────────────────┘
```

Non-negotiable details:

- **Company-scoped people come first**, under an explicit header. The rest of the workspace
  is a second group. This is what prevents assigning the wrong Aisyah, which in this
  product is worse than assigning nobody.
- **Every option carries disambiguating evidence** — role, company, meeting count, aliases.
  A bare list of names is a trap when two people share one.
- `Keep as text only` is a real, first-class option, not a fallback. Sometimes the minutes
  genuinely say "Finance" and pretending otherwise is falsification. Choosing it leaves the
  item in the amber *Not linked* state, honestly.
- `Create person` opens a two-field inline form (canonical name, optional role at this
  company). It does **not** open a separate page and lose the user's place.
- On save, the recorded `owner_name` is left as written unless the user opts into
  `Also update the recorded name to "Aisyah binti Rahman"` — a checkbox, default **off**,
  because editing what the minutes say is a document edit and must be deliberate. If the
  item belongs to a `final` draft the checkbox is disabled with the reason shown.

Every assignment writes an `audit_logs` row (`entity_type: action_item`, `action: owner_linked`, payload with before/after and whether it was suggested).

## 3.4 The unassigned queue

`/action-items` gains a first-class **owner** filter with four values, replacing the current
free-text owner box (which stays, as a secondary "search owner" input):

`All owners · Needs an owner · Text only, not linked · Specific person…`

**"Needs an owner"** deliberately includes *both* unassigned items and text-only items,
because a free-text owner is not a person you can chase. The chip row at the top of the page
gains one: `[12 need an owner]` in amber, sitting alongside the existing open/overdue/done
counts.

Queue layout — a working surface, not a report:

```
Action items                    [12 open] [3 overdue] [12 need an owner] [40 done]

[ All owners ▾ ] [ Due: All ▾ ] [ Status: Open ▾ ]  [Apply] [Clear]

12 items need an owner                          [ Assign selected… ] (disabled)
┌─────────────────────────────────────────────────────────────────────┐
│ ☐  Circulate the revised mandate to all signatories                 │
│    Nusantara Holdings · Board 12 Mar 2026 · due 30 Apr 2026         │
│    Owner: — [No owner]                              [ Assign ▾ ]    │
├─────────────────────────────────────────────────────────────────────┤
│ ☐  Prepare the Form 24 filing                                       │
│    Nusantara Holdings · Board 12 Mar 2026 · due 26 Mar (overdue 9d) │
│    Owner: "Finance" [Not linked]                    [ Link ▾ ]      │
└─────────────────────────────────────────────────────────────────────┘
```

- Checkboxes enable **bulk assign**: select several, choose one person once. The overwhelming
  real case is "these four are all Aisyah's". The bulk bar appears only when ≥1 is selected,
  as a sticky bar at the bottom on mobile and inline on desktop.
- Bulk assign shows a confirm listing the affected items by description before writing.
  Bulk mutations in a legal record get a preview.
- Sorted: overdue first, then by due date ascending, then nulls last. Items with no due date
  *and* no owner sort to the very bottom but are counted — they are the most invisible items
  in the system and the count is what stops them vanishing.
- The button label differs by state (`Assign` vs `Link`) because the two acts feel different
  to the user even though they hit the same picker.

## 3.5 "What they owe across all companies" — `/people/[id]`

The existing person page has an "Owns action items" section, flat and open-only. Replace it
with an **Owes** section, promoted to directly beneath the person's name, above "Appears
across". What someone owes is the reason you opened their page.

```
Aisyah binti Rahman                                            [Person]
also: A. Rahman · Aisyah R.

OWES                                        [7 open] [2 overdue] [1 obligation]
┌─────────────────────────────────────────────────────────────────────┐
│ NUSANTARA HOLDINGS SDN BHD                          3 open · 1 late │
│  ! Prepare the Form 24 filing            overdue 9 days   [open →]  │
│    Circulate the revised mandate         due 30 Apr 2026  [open →]  │
│    Draft the audit committee ToR         no due date      [open →]  │
├─────────────────────────────────────────────────────────────────────┤
│ MERIDIAN CAPITAL BERHAD                             4 open · 1 late │
│  …                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                            [ Show 12 completed items ]

⚠ 2 further items name "Aisyah" as owner but are not linked to this person.
   [ Review 2 possible matches → ]
```

- **Grouped by company, sorted by overdue count descending.** This is the cross-company view
  that does not exist anywhere today and it is the single most useful screen for a cosec
  managing a portfolio.
- Overdue items are marked with the `!` glyph *and* the word "overdue" *and* red text.
- Statutory **obligations** owned by this person appear as a fourth group,
  `STATUTORY OBLIGATIONS`, visually distinguished by a left border, because missing a Form 24
  deadline is a different order of problem from missing an internal task.
- Completed items are collapsed behind a disclosure, never removed — "what did she owe last
  year and did she do it" is a real audit question.
- **The unlinked-matches banner is the honest-state guard on this whole screen.** Without
  it, a person page showing 7 items looks like a complete account of what they owe, when 2
  more are floating as text. The banner states the gap and offers the reconciliation flow.
  It renders whenever any unlinked `owner_name` shares a normalized token with this person's
  canonical name or aliases. If none: no banner (do not render a green "all reconciled" —
  the absence of a *detected* match is not proof there isn't one; and if we cannot run the
  detection at all, the banner says `Could not check for unlinked items naming this person.`).

Company detail (`/companies/[id]`) gets the mirror: its "Open action items" list shows the
owner in the three-state rendering, with an inline `Assign` on any unowned row.

## 3.6 States

| State | Treatment |
|---|---|
| **Picker loading** | Three skeleton option rows. The `Create person` and `Keep as text` options render immediately — they need no data and give the user something to do. |
| **Picker, no matches** | `No one matching "Zulk" at this company or in your workspace.` followed by the same three actions. Never an empty box. |
| **Picker error** | `Couldn't load people. [Retry]` — and `Keep as text only` stays available so the user is never blocked from recording what the minutes say. |
| **Assign in flight** | Row shows the new owner optimistically at 60% opacity with a `Saving…` badge; controls disabled. On failure, it reverts *visibly* with an inline red `Couldn't assign owner — not saved. [Retry]`. A silent revert is the worst possible outcome here: the user believes it saved. |
| **Bulk assign partial failure** | Explicit: `Assigned 3 of 4. "Prepare the Form 24 filing" failed — [Retry].` Never "done" for a partial write. |
| **Item on a final draft** | Owner controls disabled with a tooltip/inline note: `These minutes are final — owner changes are locked.` The *link* (owner_person_id) may still be settable if product decides linking is metadata rather than document content; if so, the note must say exactly that: `The recorded owner text is locked. You can still link it to a person for tracking.` Pick one and state it; do not leave it ambiguous in the UI. |
| **Person merged/renamed** | Links follow the entity. The person page shows `Merged from "Aisyah Rahman" on 4 Jul 2026` as a neutral note. Migration 0012 already consolidates orphan person entities — the UI must not assume ids are stable forever. |
| **Deleted/hidden person (RLS)** | An item linked to a person the current user cannot see renders `Owner not visible to you` in neutral, not a blank cell. Blank reads as unassigned, which is a different and much worse fact. |

## 3.7 Mobile (375px)

- The action items table already forces a `min-w-[720px]` horizontal scroll. For V4 the
  queue view below `sm` becomes **stacked cards**, not a scrolling table: description,
  meta line, owner line, then a full-width `Assign` button. Horizontal scrolling through a
  legal worklist on a phone is how items get missed.
- The picker opens as a **bottom sheet** (`fixed inset-x-0 bottom-0`, `max-h-[80vh]`,
  rounded top corners) with the search input at the top, auto-focused, `text-base`.
  Options are `min-h-11`. It reuses the drawer's backdrop, scroll-lock and Escape handling.
- Bulk selection: a sticky bottom bar `3 selected · [Assign] [Cancel]` above the sheet.
- The person "Owes" section: company groups become `<details>`, open by default for any
  company with an overdue item, collapsed otherwise.

## 3.8 Accessibility

- Picker is an ARIA combobox with the same contract as search (§1.10):
  `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="option"` rows,
  grouped with `role="group"` + `aria-labelledby` on the "At <company>" headers.
- Each option's accessible name includes the evidence: "Aisyah binti Rahman, Director,
  7 meetings, also known as A. Rahman" — screen-reader users need the disambiguating
  detail more than sighted users, not less.
- On close, focus returns to the trigger. On successful save, the change is announced via a
  polite live region: "Owner set to Aisyah binti Rahman."
- Bulk-select checkboxes have labels naming the item, not "select row 3".
- The `Not linked` and `No owner` states are text badges, readable by any assistive tech,
  never colour-coded cells.
- Overdue is never red-only: the `!` glyph and the word "overdue" always accompany it.

---

# 4. Cross-cutting: navigation changes

Sidebar / drawer link list becomes:

```
[ New Meeting ]
  Search                    ⌘K        ← new
  Meetings
  Action Items      12 ●              ← new: amber dot + count when items need an owner
  Obligations        3 ●              ← existing data, new indicator: overdue count
  Companies
  People
  Workspaces
  Settings
```

The count indicators are **only** rendered when the count is real and non-zero, and only for
states that represent a gap the user is liable for. They are never a generic unread badge.
If the count query fails, no dot renders — an absent dot is honest ("we're not telling you
anything"), a zero would be a lie ("there's nothing to do").

Companies detail gains a **Documents** section; no new top-level nav item for documents —
documents have no meaning outside a company.

---

# 5. Component inventory

New, shared:

| Component | Used by |
|---|---|
| `<SearchPalette>` | global (desktop) |
| `<SearchResultRow variant="meeting|resolution|obligation|action|company|person|document">` | palette + `/search` |
| `<SearchGroupHeader label count truncated?>` | palette + `/search` |
| `<ScopeChipRow>` | `/search` |
| `<EvidenceChip document inForceFrom href>` | cabinet, assurance panel, governance panel, draft header |
| `<DocumentSlot type state document actions>` | cabinet |
| `<DocumentStateBadge state date>` | cabinet, search rows, evidence surfaces |
| `<DocumentHistoryTimeline>` | cabinet |
| `<UploadDocumentSheet>` | cabinet (modal ≥sm, sheet <sm) |
| `<UnlocksPanel facts gaps>` | cabinet, company detail (compact variant) |
| `<OwnerCell state personId ownerName>` | action items, draft rows, company detail, search rows |
| `<OwnerPicker companyId itemIds[]>` | combobox ≥sm, bottom sheet <sm |
| `<BulkActionBar count actions>` | action items queue |
| `<OwesSection personId>` | person detail |
| `<UnlinkedMatchesBanner personId count>` | person detail |

Extended:

| Existing | Change |
|---|---|
| `components/ui.tsx` | add `EvidenceChip`, `SkeletonRow`; keep `Badge`/`EmptyState`/`FOCUS_RING` unchanged |
| `lib/assurance.ts` | split `actions_have_owners` (fail) / add `owners_resolved` (warn); add optional document-provenance metadata to `AssuranceCheck` so the panel can render an evidence chip without inventing one |
| `app/site-header.tsx` | Search row + `⌘K` handler + mobile magnifier + gap-count dots |
| `app/action-items/page.tsx` | owner filter, need-an-owner chip, stacked cards <sm, bulk select |
| `app/people/[id]/page.tsx` | replace flat "Owns action items" with grouped `OwesSection` + banner |
| `app/companies/[id]/page.tsx` | Documents section, three-state owner rendering in open actions |

---

# 6. What I deliberately did NOT add, and why

**Semantic / AI-powered search.** A cosec asking "did we ever discuss the bank mandate" and
getting embedding-ranked results cannot tell a *no match* from a *bad embedding*. Keyword
search is legible: it either contained the words or it did not, and the user can adjust the
words. In a tool whose promise is "nothing is missing", a recall failure the user cannot
reason about is worse than a search that makes them try a second phrasing. Revisit only when
we can show *why* something matched.

**Automatic classification of uploaded documents.** Guessing that `const_v2_FINAL.pdf` is a
Constitution and filing it as one produces a green tick nobody earned, backing quorum checks
against a document nobody confirmed. Suggest, never apply.

**OCR / full-text document search claimed before it works.** Rather than half-shipping it
and letting users believe the constitution was searched, §1.9 states loudly that it was not.
When extraction ships it becomes a *per-document* fact ("contents searched" vs "filename
only"), because extraction fails on scanned pages and the failure must be visible on the
document that failed, not hidden behind a feature flag.

**A company-level "compliance score."** The draft-level assurance score is defensible — it
counts specific checks on one document. A company-level score would average incommensurable
things (missing constitution, one late action item, an unconfirmed set of minutes from 2019)
into a number that means nothing and that a user will optimise. Worse, "Nusantara: 87%" is
exactly the kind of number that ends up in a board pack. The cabinet's unlocks panel does
the same job honestly: a list of what is verified and what is not.

**A green "all reconciled" state on the person page.** Absence of a *detected* unlinked
match is not proof there is none. So the reconciliation banner appears when there is
something to say, and stays silent otherwise, and says so explicitly when the check itself
could not run.

**Auto-linking owners by fuzzy match.** Covered in §3.2 — this is the single most tempting
and most dangerous convenience in this spec. The whole product is an argument against
inferring facts into a legal record.

**Notification emails / nudges to owners.** Chasing people is a real job, but it is a
messaging product with its own consent, deliverability and audit-trail problems, and the
handoff notes SMTP is not even configured. Half-working reminders are worse than none: the
cosec will believe someone was chased. Out of scope until it can be proven per-send.

**Saved searches, search history, and "recently searched".** Recent *records* (things
opened) are useful and included. Recent *queries* are noise, and a stored history of what a
cosec searched for is a privacy liability in a firm where staff cover overlapping clients.

**A kanban / drag-drop board for action items.** Ownership and dueness are the axes that
matter; status is binary (open/done). A board would add a lot of chrome and a lot of
accidental drags to a two-state field.

**Avatars, initials circles, activity sparklines, colour-coded company chips.** Decoration
that implies data density we do not have, in a tool where every visual signal should mean
something checkable.

**Document preview / in-app PDF viewer.** Download opens the file in the platform's own
viewer, which is faster, accessible, printable and searchable by tools the user already
trusts. An embedded viewer is a large surface for a small gain, and a bad one would make
people *stop opening the document* — the opposite of the goal.

**Deleting documents.** Supersede only, for anything that has ever backed a finalised
document. The cabinet's value is that it can tell you what was true on a date three years
ago; a delete button destroys exactly that.
