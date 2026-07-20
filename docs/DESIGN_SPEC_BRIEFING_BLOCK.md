# Design Spec — "Worth knowing before you sign"

**Status:** Specification. Nothing here is applied to application code.
**Scope:** ONE surface — the briefing block on the draft page. Not the app's overall visual life.
**Depends on:** `docs/VISUAL_SYSTEM_V4.md` (tokens §2.2, status language §3, components §5),
`components/status.tsx` (the four-state primitives).
**Concept:** `docs/CONCEPT_BRIEFING_BLOCK.md`.

---

## 0. Grounding, stated up front

An independent review established that of the four findings in the concept mock, **one is
partially buildable today** — the conflict row, via `lib/conflicts.ts` — and even that cannot
produce the dated provenance the mock shows. Supersession, quorum-threshold provenance and the
carried-obligation traversal are not built.

This spec therefore designs the **shape and the states**, not the mock. Two consequences run
through everything below:

1. **Degraded provenance is the normal case, not the exception.** A finding with no date, or a
   document reference with no document behind it, must look *deliberate and complete* — not
   broken, not empty, not a rendering bug. §5 is the load-bearing section for this.
2. **The first thing that ships is one conflict row with partial provenance.** If that single
   row does not look intentional and finished on its own, the surface fails on day one. §2 (n=1)
   and §5.3 are written against exactly that case.

---

## 1. The object, and what it is not

The block is a **briefing**: what the rest of the record says about *this* document, rendered as
sentences, read once, before signature.

It is not:

- an **assurance checklist** — that is a fixed denominator of statutory checks against this one
  document, and it has a score. `assurance-panel.tsx` keeps that job.
- a **register** — a forward-looking list of duties with due dates and editable statuses.
  `obligations-panel.tsx` keeps that job.

Those two are different objects with different cardinality and different lifetimes. The briefing
block has **variable cardinality, usually zero**, and its findings are cross-document graph
traversals. Conflating them is what produces a wall.

**Design contract with the reader:** *if this block says something, it is worth thirty seconds
before you sign; if it says nothing, it looked and found nothing, and it will tell you how far it
looked.*

---

## 2. Placement — decision and reasoning

### Decision

> The briefing block **replaces `GovernanceRiskPanel` outright** and moves to sit **directly
> above the minutes body card**, immediately below `ConfirmationStatus`. `AssurancePanel` and
> `ObligationsPanel` stay exactly where they are. Net panel count on the page **goes down by
> one.**

Concretely, in `app/meetings/[id]/draft/page.tsx`:

| | Today | After |
|---|---|---|
| Above body | `MeetingHeader`, title row, `ConfirmationStatus` | `MeetingHeader`, title row, `ConfirmationStatus`, **`BriefingBlock`** |
| Below body | Attendance, Resolutions, Action items, Assurance, **Governance risk**, Obligations, Precedent, Activity | Attendance, Resolutions, Action items, Assurance, Obligations, Precedent, Activity |

### Reasoning

**A fifth stacked panel is wrong, and so is a fifth panel that merely *replaces* the fourth in
place.** The page already stacks eight sections. Adding a ninth below the fold is how a
pre-signature briefing becomes a post-signature artefact — nobody reads it before they sign,
because signing (`StatusWorkflow`) is at the top of the page and the briefing is 2,000px down.
Position is the whole argument: this block's value is entirely a function of being read *first*.

**It absorbs the governance panel because it already IS the governance panel, better.**
`governance-risk-panel.tsx` renders `ConflictRow` and `ConsistencyRow` — findings with a title,
a detail line, and a related-entity footer. That is a sentence with provenance, drawn badly:
the title/detail split truncates the sentence into a fragment, and the `relatedEntity ↔
relatedCompany` footer is uppercase eyebrow-caps carrying what should be prose provenance. Every
capability behind that panel maps onto a briefing finding without loss. Running both means two
surfaces claim the same conflict, and the cosec learns that neither is authoritative.

**It does NOT absorb obligations.** Obligations are the meeting's *output* — duties this meeting
created, forward-looking, with an editable status owned by `/obligations`. The briefing consumes
one narrow slice of that data (open items carried in from *prior* meetings that this draft fails
to mention) which is a finding about an omission, not a register entry. Different tense,
different owner, different lifetime. Absorbing the register would make the block grow with normal
business, which is precisely the failure mode §3 exists to prevent.

**It does NOT absorb assurance.** Assurance answers "is this document internally complete against
statute". The briefing answers "what does everything else we hold say about this document". A
score over the second question is meaningless — its denominator is unbounded. Keep them apart.

**Company level: not yet.** The same findings at company level are a register, not a briefing —
different rhythm, no signature moment, and no scarcity. Shipping it in both places dilutes the
rarity that makes the draft-page block work. Revisit only after the draft-page block has earned
attention.

**The cost, acknowledged:** the block now occupies prime real estate in the state it occupies
99% of the time — empty. §3.1 pays that cost down by making the empty state a **single line, not
a card**.

---

## 3. The six states

Shared shell for every non-empty state:

```
<section aria-labelledby="briefing-h">
  rounded-surface border border-paper-300 bg-white shadow-raised
  p-5 sm:p-6
  border-t-[3px] border-t-{worst-grade}-600     ← see §4.4
```

### 3.0 State selection — the gate

The state is chosen by this rule, in order. **It is not negotiable and it is the honest-state
guarantee for this surface:**

```
if (failedTraversals.length > 0)        → PARTIAL FAILURE   (§3.6)
else if (priorMeetingCount === 0)       → FIRST RUN         (§3.5)
else if (findings.length === 0)         → EMPTY             (§3.1)
else if (findings.length === 1)         → ONE               (§3.2)
else if (findings.length <= 5)          → FEW               (§3.3)
else                                    → MANY              (§3.4)
```

Note the ordering: **a partial failure outranks an empty result.** An empty findings array from a
run where two traversals threw is not silence, it is ignorance, and it renders as §3.6. This is
`VISUAL_SYSTEM_V4` principle 2 applied to this surface; it is the same defect that produced the
false green all-clear at `governance-risk-panel.tsx:141` before it was gated.

FIRST RUN outranks EMPTY for the same reason: no history is not a clean history.

---

### 3.1 EMPTY — the most important state

The block found nothing, **and it completed every traversal**. This is the common case and it
must cost the page almost nothing.

**It is not a card.** No border box, no background, no shadow, no radius, no heading, no icon
chip, no action. One line, ~28px tall, sitting where the block would be:

```html
<p class="flex items-baseline gap-2 border-t border-paper-200 pt-3 text-meta text-paper-600">
  <svg class="h-3 w-3 flex-none translate-y-[1px] text-paper-400" aria-hidden="true"
       viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.5"
       stroke-linecap="round"/></svg>
  <span>
    <span class="font-medium text-paper-700">Nothing to flag.</span>
    6 connection checks ran against 14 prior Nusantara meetings · 20 Jul 2026, 09:14.
  </span>
</p>
```

**Why this reads as earned rather than as an empty widget:**

1. **The denominator is the reassurance, not a tick.** "6 checks against 14 prior meetings" is a
   claim a cosec can weigh. "✓ All clear" is a claim they can only take on faith. The whole
   sentence is doing what the assurance panel already learned to do with *"N of M checks
   verified"* (`assurance-panel.tsx:132`) — keep the denominator on screen.
2. **The timestamp makes it perishable.** A statement that ran at a moment is checkable; a green
   tick is timeless and therefore unfalsifiable.
3. **No green, and no `verified` family.** The `verified-*` tokens are reserved for a completed
   statutory check that passed (§3.2 rule 3 of the visual system). A briefing that found nothing
   is not a statutory pass, and painting it green would be exactly the unearned assurance this
   product spent two sprints removing. Colour here is `paper-600` on the page ground — the same
   ink as ordinary record metadata, because that is what it is.
4. **The glyph is a nil rule, not a tick.** A horizontal bar is the accounting mark for *nil* —
   an entry that was made and came to zero — as opposed to a blank cell, which means nobody
   looked. It is `paper-400`, decorative-only, `aria-hidden`; "Nothing to flag" carries the
   meaning for assistive tech (`VISUAL_SYSTEM_V4` §7.2 rule 1 explicitly permits `paper-400` as
   a separator/ornament glyph accompanied by text).
5. **It cannot be reached dishonestly.** §3.0 forbids it whenever any traversal failed or history
   is absent. That gate is what makes the line safe to make quiet.

**Copy variants:** the numerals are always real. Never "all checks", never "your record" —
always the count and the company's own name, wrapped not truncated.

---

### 3.2 ONE finding

**Does one row look broken? Yes — but only because of the chrome around it.** A card with a
title, a count reading "1 thing", a list of one, and a footer button is four pieces of furniture
around one sentence, and the eye reads the furniture as a container that failed to fill.

**Rule: at n = 1 the block sheds every countable affordance.**

| Element | n = 1 | n ≥ 2 |
|---|---|---|
| `h2` "Worth knowing before you sign" | **shown** | shown |
| Sub-header (company · type · date) | **shown** | shown |
| Count, right-aligned | **suppressed** | shown |
| Row list | one row, no `space-y` in play | `space-y-2` |
| Disclosure "N more" | absent | §3.4 |
| Footer "See the connections ↗" | **suppressed unless the finding is graph-derived** | shown |
| Footer caveat line | promoted to a row (§3.7) | promoted to a row |

The heading stays because it is the **reading contract**, not a label for a list. With the count
and footer gone, what remains is a headed statement — which is calm, and is in fact the ideal
form of this surface. A single conflict, stated once, under a heading that says why you are
reading it, is the strongest this block ever looks.

The footer button is suppressed at n=1 when nothing graph-derived is present because opening the
ego graph to show a single node the user just read about is an anticlimax that teaches the button
is not worth pressing.

---

### 3.3 FEW — 2 to 5 findings

The default non-empty shape. Full header with count, ranked list, footer. No disclosure. Nothing
special beyond §4.

Header count copy: **"4 findings"**. Not "4 things" — see §7.

---

### 3.4 MANY — 6 or more

Twelve rows is ~1,030px of screen (a two-line sentence at `text-body` 14/24 is 48px, plus an
18px provenance line, plus 20px vertical padding ≈ 86px per row). That is a wall, and a wall is
the mechanism by which a briefing block trains the user to scroll past it forever.

**The truncation rule:**

1. **Every `conflict`-grade row renders, always, uncapped, never inside a disclosure.** A
   conflict may not hide behind a click. If there are seven conflicts, seven conflicts render.
2. After conflicts, render further rows in rank order up to a **total of 5 visible rows.**
3. The remainder goes in a `<details>`, closed by default, whose summary **states the residue by
   grade, in words** — never a bare "show more":

   ```
   ›  4 more · 1 can't confirm · 3 context
   ```

   Styled exactly as the assurance panel's disclosure (`assurance-panel.tsx:124-134`):
   `rounded-surface border border-paper-300 bg-paper-50 px-3 py-2`, summary
   `text-caption font-medium text-paper-600`, chevron `paper-500` with
   `group-open:rotate-90`. Reusing that treatment is deliberate — the user has already learned
   what a closed disclosure means on this page.
4. **Never truncate a sentence.** No `line-clamp`, no ellipsis, no `title=` tooltip holding the
   rest. Cap the **count** of findings, never the **characters** of one. A half-sentence finding
   is worse than no finding: it is a legal claim with its qualifier cut off. (Same reasoning as
   `VISUAL_SYSTEM_V4` principle 7 for company names.)
5. **Provenance never collapses.** It wraps to a second line rather than truncating.
6. **Above 12 total findings**, the structure is unchanged but the sub-header gains one clause:
   `· unusually many for one meeting` in `text-status-risk-800 font-medium`. The volume is itself
   a finding and saying so is cheaper and more honest than inventing a new route. No new surface,
   no "view all" page.

---

### 3.5 FIRST RUN — no history to deviate from

`priorMeetingCount === 0`. Deviation findings are structurally impossible; conflict traversals
over the directorship graph are not (they are company-history-independent) and still run.

Rendered as the §3.1 one-liner **in the UNCONFIRMED treatment** — dashed, not plain — because
checks did not run:

```html
<p class="flex items-start gap-2 rounded-surface border border-dashed border-status-unknown-600
          px-3 py-2 text-meta text-paper-700">
  <StatusGlyph state="unknown" class="h-4 w-4 flex-none text-status-unknown-700" />
  <span>
    <span class="font-medium text-status-unknown-800">First meeting on file for
    Nusantara Ventures Sdn Bhd.</span>
    There is nothing to compare this draft against — 4 of 6 checks need prior meetings and
    did not run. This is not a clean record; it is an empty one.
  </span>
</p>
```

Any findings that *did* produce render as normal rows **below** this line, in the full card shell.

**The n≥3 rule.** Deviation-from-own-history findings ("quorum was stated in your last 4
meetings") stay suppressed until `priorMeetingCount >= 3`. A deviation from a single prior
meeting is not a pattern, and a block that cries wolf on n=1 evidence burns the scarcity that is
its only asset. While suppressed (`priorMeetingCount` 1 or 2) the line reads:

> **Pattern checks need 3 prior meetings — you have 1.** Deviations from this company's own
> practice are not being reported yet.

The final clause is mandatory. Without it, the honest sentence still leaves the impression that
the pattern checks looked and were satisfied.

---

### 3.6 PARTIAL FAILURE — some traversals did not complete

`failedTraversals.length > 0`. Findings that did produce still render. Above them — **above the
conflicts, at rank −1, the one deliberate exception to the ranking rule in §4** — sits a meta
row, because it bounds the reliability of everything below it and must be read first:

```html
<StatusBanner state="unknown"
  title="2 of 6 connection checks did not complete">
  What follows is incomplete. It is <strong>not</strong> an all-clear — the checks that failed
  were the ones that look for related-party conflicts. Re-open this draft to try again before
  finalising.
</StatusBanner>
```

Reuse `StatusBanner` from `components/status.tsx` verbatim: dashed on all sides, `?` glyph,
`role="status"`. Name the failed traversals in plain words when they are nameable — "the ones
that look for related-party conflicts" — because *which* check failed changes what the reader
should do.

If `failedTraversals.length > 0` **and** `findings.length === 0`, only this banner renders. The
§3.1 line is unreachable. This is the single most important gate in the spec.

---

### 3.7 The caveat that is not a state — "register not on file"

The mock puts *"Register of directors not on file — directorships can't be confirmed"* in muted
footer text. **Rejected.** That is the block's most consequential sentence sitting in its
quietest slot, in the same grey used for incidental metadata — the exact shape of defect **C** in
`VISUAL_SYSTEM_V4` §1.2.

It becomes an **`unconfirmed`-grade row** in the ranked list, with its own provenance line:

> **CAN'T CONFIRM**  No register of directors is on file for **Nusantara Ventures Sdn Bhd**, so
> the directorships named above cannot be confirmed against the company's own record.
> *Checked against 3 documents in the cabinet · 20 Jul 2026*

Concept rule 4 — *"the gap is a finding"* — applied literally. It also means the block is rarely
truly empty for a company with a thin document cabinet, which is correct and honest.

---

## 4. Ranking, grades, and greyscale-safe severity

### 4.1 The four grades

Three map onto existing status families. The fourth deliberately does **not**.

| Grade | Word | Family | Meaning |
|---|---|---|---|
| `conflict` | `CONFLICT` | `failed` | A traversal resolved and found a live governance problem — an undeclared interest, a contradiction of the record. |
| `unconfirmed` | `CAN'T CONFIRM` | `unknown` | Something could not be established: register absent, document not on file, provenance missing. |
| `review` | `REVIEW` | `risk` | A traversal resolved and found something wanting judgement — a deviation, an unmentioned overdue item. |
| `context` | `CONTEXT` | **`paper`** | A traversal resolved and returned a plain fact with no correctness claim attached — "Resolution 3 amends BD-2024-07, still in force." |

**Why `context` is not `verified`.** `VISUAL_SYSTEM_V4` principle 5: the four semantic families
mean *"this is a claim about correctness."* A supersession link is a fact about the record, not a
verdict on it. Painting it `verified` green would put a green tick beside a row the user might
well need to act on, and would burn the one colour the app reserves for earned statutory passes.
`context` uses `paper` tones — the same register as the record itself.

### 4.2 The ranking rule

Total order, deterministic, stable across renders. Sort ascending by the tuple:

```
( gradeRank , provenanceRank , −evidenceDate , typeOrdinal , id )

gradeRank:       conflict 0 · unconfirmed 1 · review 2 · context 3
provenanceRank:  full 0 (source AND date) · partial 1 (one missing) · bare 2 (both missing)
−evidenceDate:   most recent evidence first; nulls already sit in band 2
typeOrdinal:     a fixed integer per finding type, hard-coded, never derived
id:              final tie-break
```

- **`unconfirmed` sorts above `review`** — identical to `STATUS_ORDER` in `components/status.tsx`
  and for the identical reason: *an unrun check is a larger liability than a flagged-but-passing
  one.* Consistency with the assurance panel is not cosmetic; a cosec reading two lists on one
  page must not have to learn two priority schemes.
- **Provenance strength ranks second, above recency.** Within one grade, the finding a user can
  check *right now* against a document they hold beats the one they would have to go hunting for.
  It also means the degraded findings this app currently produces sink within their grade rather
  than leading the block.
- **`typeOrdinal` and `id` exist purely to guarantee the order never jitters.** A cosec builds a
  spatial memory of "the second row"; an order that reshuffles between renders destroys the
  block's credibility faster than a wrong finding does.
- **One exception, §3.6:** the partial-failure banner is rank −1, above conflicts.

### 4.3 Severity in greyscale and in print

Row grades are distinguished by **four non-colour channels** before colour is considered. Colour
is the fifth signal here, not the third — this surface earns the extra margin because it is the
one users will print and staple into a board pack.

| Grade | Rail | Box border | Glyph | Word |
|---|---|---|---|---|
| `conflict` | **3px** left, `failed-600` | **2px solid** all sides, `failed-600` | `✕` cross | `CONFLICT` |
| `unconfirmed` | **3px** left, `unknown-600` | **1px dashed** all sides, `unknown-600` | `?` question | `CAN'T CONFIRM` |
| `review` | **3px** left, `risk-600` | 1px solid, `paper-300` | `!` exclamation | `REVIEW` |
| `context` | **none** | 1px solid, `paper-300` | `→` traversal | `CONTEXT` |

Read the two rightmost-differing channels: **rail presence** separates `context` from everything
else (a rail means *this wants your attention*; no rail means *this is a fact*), and **border
treatment** separates the other three from each other (double / dashed / plain). Neither depends
on hue, and both survive a fax.

The `→` traversal glyph is new and must be drawn, not imported — a 12-box SVG, `currentColor`,
`stroke-width 2`, `aria-hidden`:

```
<path d="M2 6h5.5M6 3.2 8.8 6 6 8.8" />
```

An arrow from a point, because that is literally what a graph traversal is. It is the **only**
new glyph this spec adds; the other three come from `components/status.tsx` unchanged. Under no
circumstances introduce `alert-triangle` / `history` / `link` / `help-circle` from the mock —
that is a fifth parallel icon vocabulary and defect **H** all over again.

**Print rules (mandatory, and this block is the reason the print stylesheet gets written):**

- Rails print at **≥1pt solid black**, never a grey tint.
- The `conflict` double-weight box prints as a genuine 1.5pt rule; the `unconfirmed` dash pattern
  prints as dashes, not as a solid line collapsed by the renderer.
- The grade **word** prints in every row, uppercase, at the head of the sentence. A monochrome
  reader gets the full severity from the text alone with no glyph and no rail.
- Any open `<details>` from §3.4 prints expanded; a closed one prints expanded too.
- The `context` row prints with no rail — the absence is meaningful and must not be normalised
  by a print reset that adds borders.

### 4.4 The card's top rail

The shell's `border-t-[3px]` takes the `-600` colour of the **worst grade present**
(`failed` → `unknown` → `risk` → `paper-450` for context-only). This is decorative
reinforcement only: it is colour-alone and therefore may never be the sole carrier of meaning.
It is always paired with the header status chip (§5.1), which is triple-encoded.

---

## 5. Typography and spacing — exact

All tokens from `VISUAL_SYSTEM_V4` §2.2 / §4. No raw hex, no off-scale spacing.

### 5.1 Header

```
h2      text-title font-semibold text-paper-900        "Worth knowing before you sign"
count   text-meta text-paper-500                        "4 findings"   (n ≥ 2 only)
sub     mt-0.5 text-meta text-paper-600 break-words
        "Nusantara Ventures Sdn Bhd · Board meeting · 20 Jul 2026"
layout  flex flex-wrap items-baseline justify-between gap-3
rule    mt-4 border-t border-paper-200 pt-4    (only when rows follow)
```

**`text-title` (18/26) is deliberate and is the only one on the page.** `AssurancePanel` and
`GovernanceRiskPanel` both use `text-subhead` for their `h2`. Making this block one step larger
is how the visual hierarchy states *read this first* without a badge, a colour, or an animation.
It is the only panel that gets it.

**Company name never truncates** — `break-words`, `[hyphens:auto]`, per principle 7.

**Header status chip** (n ≥ 1): the §5.1 `StatusChip` for the worst grade present, sitting beside
the count — `Conflict · 1`, `Not confirmed · 2`, `Review · 3`. This is what carries the top rail's
meaning in a non-colour channel.

### 5.2 Row

```
li      flex items-start gap-3 rounded-surface bg-white px-3 py-2.5
        conflict     border-2 border-status-failed-600 border-l-[3px]
        unconfirmed  border border-dashed border-status-unknown-600 border-l-[3px]
                     border-l-status-unknown-600
        review       border border-paper-300 border-l-[3px] border-l-status-risk-600
        context      border border-paper-300

icon    h-5 w-5 flex-none rounded-full mt-0.5 inline-flex items-center justify-center
        conflict     bg-status-failed-100 text-status-failed-800        (7.92:1)
        unconfirmed  bg-transparent border border-dashed
                     border-status-unknown-600 text-status-unknown-800  (9.85:1)
        review       bg-status-risk-100 text-status-risk-800            (6.69:1)
        context      bg-transparent border border-paper-450 text-paper-600  (6.90:1)

word    inline span, first child of the sentence <p>, mr-2
        text-caption font-semibold uppercase tracking-[0.06em]
        conflict text-status-failed-800 · unconfirmed text-status-unknown-800
        review   text-status-risk-800   · context     text-paper-600

sentence <p> text-body text-paper-900          ← weight 400, NOT font-medium
         emphasised runs (person / company / document): font-semibold text-paper-900

list    ul, space-y-2
```

Row padding, gaps and radii are byte-identical to `StatusRow` (`components/status.tsx:215`) so
the block sits in the same rhythm as the assurance list further down the page.

**Three hard rules on the sentence:**

1. **The grade word is inline, inside the same `<p>` as the sentence** — running text, like a
   citation prefix. Not a separate line (12 rows × an extra 18px line is 216px of nothing), and
   not a flex sibling (the sentence would wrap back to the left margin under the word and read as
   two paragraphs).
2. **Weight 400 for the sentence body.** A two-line sentence in `font-medium` is a shout, and at
   five rows the whole block shouts. Emphasis is spent *only* on the proper nouns and the
   document reference — which is exactly what makes the sentence checkable at a glance.
3. **No links inside the sentence, ever, and no colour inside the sentence, ever.** The sentence
   is prose that must survive being read aloud in a board room and printed in a bundle. All
   navigation lives in the provenance line below it. A blue word mid-sentence turns a finding
   into a UI control.

### 5.3 Provenance line — the grey source line

```
p       mt-0.5 text-caption font-normal text-paper-500
sep     " · "  wrapped in <span class="text-paper-400" aria-hidden="true">
wrap    wraps freely to a second line; never truncated, never in a title=
```

- **`text-caption` = 12px**, the floor from §4.1. Never smaller.
- **`font-normal` is an explicit override.** The `text-caption` token is used at weight 500 in
  chips and table headers; provenance is running apparatus, not a label, and 500 makes it
  compete with the sentence above it.
- **`paper-500` #74736A = 4.77:1 on white.** This is the muted-text floor (§7.2 rule 6).
  `paper-400` is decorative-only at 2.89:1 and may hold the `·` separators but **never a word**.
- **Never italic** — it fights the serif register of the exported document body.

**Document reference — three renderings, and all three must look finished:**

| Case | Rendering |
|---|---|
| **On file, clickable** | `text-ink-600 underline decoration-paper-300 underline-offset-2 hover:decoration-ink-600` + `focus-ring`. Stays at `text-caption`, stays weight 400. A trailing `↗` only when it leaves the page. |
| **Not on file** | `text-paper-500 underline decoration-dashed decoration-paper-450 underline-offset-2`, **not** a link, followed by `(not on file)` in words. |
| **No date** | The date slot reads `date not recorded`, same dashed-underline treatment. Never blank, never `—`, never an inferred or "circa" date. |

The dashed underline is the same discontinuous-outline signal the system already uses for
UNKNOWN — the only broken line in the vocabulary, and it reads as *incomplete* with no training
(`VISUAL_SYSTEM_V4` §3.1). So a citation to a document that exists in law but not in the cabinet
looks **deliberately incomplete**, which is precisely true, rather than looking like a link that
failed to render.

The `(not on file)` and `date not recorded` phrases are mandatory and are never abbreviated. A
dashed underline alone is a colour-and-decoration signal; the words are what survive print.

Worked examples, in the three provenance bands:

```
full     From directorship recorded 14 Mar 2024 · Meridian board minutes ↗
partial  From directorship recorded 14 Mar 2024 · Meridian board minutes (not on file)
bare     From the directorship graph · date not recorded · no source document
```

The **`bare`** form is what the one buildable finding produces today (§0). It must read as an
honest, finished citation — a finding the app stands behind but cannot yet date — not as a
half-populated template.

### 5.4 Footer

```
div     mt-4 border-t border-paper-200 pt-3 flex flex-wrap items-center gap-3
button  Secondary per §5.5 — bg-white text-paper-700 border border-paper-450
        rounded-control px-3.5 py-2 text-body font-medium min-h-11 sm:min-h-0
        "See the connections ↗"   → /people ego-graph
```

Shown at n ≥ 2 and only when at least one visible finding is graph-derived. The muted caveat text
from the mock does **not** live here — see §3.7.

### 5.5 Accessibility

- `<section aria-labelledby="briefing-h">` with the count in the heading's accessible text:
  *"Worth knowing before you sign — 4 findings"*.
- Rows are a `<ul>`; the grade word inside each `<p>` is real visible text and carries the
  severity. Glyphs are `aria-hidden="true"` throughout, exactly as `components/status.tsx` does.
- **No `role="alert"` on first paint** — four alerts firing on page load is noise that gets the
  region muted. Only a re-run that introduces a *new* `conflict` row announces, via a
  `role="status"` live region holding the delta sentence.
- Touch targets ≥ 44×44 on the disclosure summary and the footer button.
- Focus: the single `focus-ring` utility (§5.5). Nothing here defines its own.

---

## 6. Data contract this design requires

Not application code — the shape the design cannot be built without.

```ts
type BriefingGrade = "conflict" | "unconfirmed" | "review" | "context";

interface BriefingProvenance {
  source: string | null;      // "Meridian board minutes"
  documentId: string | null;  // null ⇒ "(not on file)", dashed, not a link
  date: string | null;        // ISO; null ⇒ "date not recorded"
  qualifier?: string;         // "never superseded", "both still open"
}

interface BriefingRun { text: string; emphasis?: true }   // emphasis ⇒ font-semibold

interface BriefingFinding {
  id: string;
  grade: BriefingGrade;
  sentence: BriefingRun[];
  provenance: BriefingProvenance;
  type: string;               // stable key → typeOrdinal, §4.2
}

interface BriefingResult {
  findings: BriefingFinding[];
  traversalsRun: number;
  traversalsTotal: number;
  priorMeetingCount: number;
  failedTraversals: string[]; // non-empty ⇒ §3.6, unconditionally
  ranAt: string;              // ISO
}
```

Three properties are load-bearing and the surface is dishonest without them:

1. **`failedTraversals` must be a list, not a boolean, and must never be inferred from an empty
   `findings` array.** This is the same distinction `detectConflicts` had to learn — returning
   `null` for "could not run" instead of `[]`.
2. **`traversalsRun` / `traversalsTotal` are what the empty state spends.** Without the
   denominator, §3.1 has nothing to say and collapses into a green tick by another name.
3. **`provenance` fields are nullable by design.** Null is the expected value today, and §5.3
   renders it as a finished citation. Any implementation that drops a finding because its date is
   null has thrown away the app's only real capability.

---

## 7. What I rejected, and why

1. **A fifth stacked panel.** Below the fold, after signing sits above it. Kills the surface. §2.
2. **Keeping `GovernanceRiskPanel` alongside the block.** Two surfaces claiming the same conflict
   teaches that neither is authoritative. It is absorbed, not duplicated.
3. **Absorbing `ObligationsPanel`.** Different tense (output vs. omission), different owner,
   different lifetime — and the block would then grow with ordinary business, destroying scarcity.
4. **A green tick / `verified` family for the empty state.** Unearned assurance is the defect this
   whole product spent two sprints removing. The empty state is `paper`-toned and spends its
   credibility on a denominator instead.
5. **A card for the empty state.** An empty bordered box in the page's best position, 99% of
   sessions, is a permanent advertisement for a feature that is doing nothing. One line.
6. **The mock's icon set** (`alert-triangle` / `history` / `link` / `help-circle`). A fifth
   parallel status vocabulary; defect **H**. Three glyphs reused from `components/status.tsx`,
   one new drawn traversal arrow, and that is the whole set.
7. **`verified` green for `context` findings.** A supersession link is a fact, not a verdict.
   Green beside a row the user may need to act on is worse than no colour at all.
8. **Severity by icon colour alone**, which is what the row set would default to. Four channels
   before hue: rail presence, rail weight, border treatment, glyph — plus the word. §4.3.
9. **"4 things"** in the header. Chatty in a register where the noun matters. "4 findings" — the
   word this product uses everywhere else, including `ConflictFinding` in the type layer.
10. **A count at n = 1.** "1 thing" is what makes a single row look like a container that failed
    to fill. §3.2.
11. **`line-clamp` / ellipsis / tooltip-held sentences.** A truncated legal finding is a claim
    with its qualifier severed. Cap the count of findings, never the characters of one.
12. **Burying "register of directors not on file" in muted footer text.** The most consequential
    sentence in the block in its quietest slot — defect **C**. Promoted to an `unconfirmed` row.
13. **Tinted row backgrounds per severity.** Stops being scannable past ten rows; §5.4 of the
    visual system already settled this for tables, and a rail plus a border treatment does the
    job at any length.
14. **A dismiss / collapse-by-default control.** A dismissible pre-signature briefing trains the
    dismissal. The disclosure at §3.4 hides only the ranked residue, and never a conflict.
15. **A numeric "risk score" for the block.** Its denominator is unbounded, so the number would
    be a false precision — the exact reasoning that already suppresses the assurance dial when
    any check did not run (`assurance-panel.tsx:247-264`).
16. **Ordering by date, or by a model confidence score.** Both reshuffle between renders. Grade
    first, provenance strength second, and a hard-coded ordinal to guarantee stability. §4.2.
17. **Shipping the block at company level simultaneously.** Different object, no signature
    moment, and it dilutes the rarity that is the block's only asset. §2.

---

## 8. Acceptance checks

A build is done when all of these hold:

1. **Desaturate test.** Screenshot the block with all four grades present, set saturation to 0.
   All four rows remain distinguishable, and each is identifiable *without* reading the glyph.
2. **Fax test.** Print to monochrome at 100%. The `conflict` double rule, the `unconfirmed` dash
   pattern and the `context` no-rail are all still present and distinct.
3. **n = 0 with a failed traversal** renders §3.6, never §3.1. Force it by making one traversal
   throw. This is the honest-state gate and it is the one regression that matters.
4. **n = 0, first meeting** renders §3.5, never §3.1.
5. **n = 1** renders with no count, no footer, no disclosure — and reads as a headed statement,
   not as an empty list with one item in it.
6. **n = 12 with 3 conflicts** renders 3 conflicts + 2 further rows visible, 7 in a closed
   disclosure whose summary states the residue by grade.
7. **A finding with `documentId: null` and `date: null`** renders a complete-looking provenance
   line containing the literal words `(not on file)` and `date not recorded`. Nothing is blank,
   nothing is an em-dash placeholder, nothing 404s.
8. **Order is byte-identical across two consecutive renders** of the same data.
9. **No new colour token, no raw hex, no off-scale spacing value** anywhere in the component.
