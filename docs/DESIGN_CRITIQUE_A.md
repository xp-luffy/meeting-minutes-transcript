# Design Critique A — "Bring it to life"

**Reviewer:** second-opinion pass, senior graphic design.
**Scope:** direction, not implementation. Nothing here has been applied to code.
**Reads against:** `docs/VISUAL_SYSTEM_V4.md`, `docs/CONCEPT_BRIEFING_BLOCK.md`, `app/globals.css`,
`components/status.tsx`, `components/ui.tsx`, and six live routes.

---

## 0. The one-sentence answer

The app is not flat because it is restrained. It is flat because **V4's best idea was applied
to the exports and never applied to the screen.** §5.9 says *"Rule weight, not colour, is the
primary signal"* — and it is right, and it is the whole design. The screen has no rules, one
border weight, two type sizes in use out of seven, and thirty-eight identical boxes. The life
this product is allowed to have is already specified in its own document; it is sitting in the
print section.

Everything below follows from applying that principle to the screen.

---

## 1. Diagnosis — where exactly it is lifeless

Ordered by how much of the flatness each one causes. All are measured, not asserted.

### 1.1 The type scale is declared in seven steps and used in two — this is the whole problem

Measured across `app/` and `components/`:

| Element | Token used | Count |
|---|---|---|
| `<h1>` | `text-page` (22px) | 21 |
| `<h1>` | `text-body` (14px) | 10 |
| `<h2>` | **`text-body` (14px)** | **23** |
| `<h2>` | `text-caption` (12px) | 9 |
| `<h2>` | `text-subhead` (16px) | 3 |
| `<h2>` | `text-title` (18px) | 1 |

**Twenty-three section headings are the same size as the body text they head.** The scale runs
22 → 14 and then stops. `text-title` (18px) — the step the system defined precisely for panel
and card headings (§4.1) — is used **once in the entire product**.

Cite: `app/meetings/[id]/draft/page.tsx:260` (`<h2 className="text-body font-medium">Resolutions`),
`:287` (Action Items), `activity-feed.tsx:56` (Activity),
`app/companies/[id]/page.tsx:87,119,151,193` (four peer sections, all 14px),
`app/people/[id]/page.tsx:91,224,251,272`.

A serious newspaper shows five distinct sizes on one spread. The draft page shows two. That is
not restraint; that is a scale that was designed and then not used. **No colour change, no font,
and no shadow will fix this, and fixing this alone would resolve most of the brief.**

### 1.2 Peer sections on one page use five different heading treatments

On the draft page, nine sibling sections head themselves five different ways:

| Section | File:line | Treatment |
|---|---|---|
| Resolutions | `draft/page.tsx:260` | `text-body font-medium text-paper-700` |
| Action Items | `draft/page.tsx:287` | `text-body font-medium text-paper-700` |
| Assurance | `assurance-panel.tsx:201` | `text-subhead font-semibold text-paper-700` |
| Governance | `governance-risk-panel.tsx:108` | `text-subhead font-semibold text-paper-700` |
| Obligations | `obligations-panel.tsx:52,67` | `text-caption uppercase text-paper-500` |
| Activity | `activity-feed.tsx:56` | `text-body font-medium text-paper-700` |

This reads as flatness rather than as inconsistency, which is why it has survived: none of the
five wins, so the eye registers "undifferentiated" rather than "wrong." §4.1 explicitly bans the
obligations treatment (*"eyebrow-caps are reserved for grouping labels above a list, never for a
heading that owns a card"*) and it is still there in two places.

### 1.3 Thirty-eight identical containers — when everything is a card, nothing is

`rounded-surface border border-paper-200 bg-white` appears **38 times** across 25 files.

The consequence on the draft page is the serious one. `draft/page.tsx:226` — the **minutes body,
the statutory instrument, the reason the product exists** — is:

```
rounded-surface border bg-white p-6 shadow-raised
```

`activity-feed.tsx:55` — the audit log, the least load-bearing thing on the page — is:

```
rounded-surface border border-paper-200 bg-white p-6 shadow-raised
```

**Pixel-identical.** V4's own Principle 4 is *"The document outranks the interface."* On screen
it does not outrank anything. The draft page is `space-y-8` (`draft/page.tsx:172`) over nine
children of equal weight at a uniform 32px pitch — a metronome, not a rhythm, and no focal point
anywhere in it.

### 1.4 There is no figure/ground, so nothing reads as an object

- Page ground `paper-50` `#FAFAF8` (`app/layout.tsx:27`) against card ground `#FFFFFF` = **1.03:1**.
- Card border `paper-200` `#E6E5E0` = **1.26:1** on white, used **63 times**.

A 1.03:1 ground separation bounded by a 1.26:1 line is, perceptually, nothing. Cards do not
sit on the page — they *are* the page with a faint scratch around them. This is the literal,
optical cause of "flat," and it is also **a drift from the spec**: §4.4 specifies `paper-300`
for card and panel borders. The code uses `paper-200` in 63 places. The system was designed
with more structure than was built.

### 1.5 Elevation costs paint and buys nothing

`shadow-raised` = `0 1px 2px 0 rgb(28 27 24 / 0.05)` — **67 uses**. At 5% alpha over a
1.03:1 ground separation this is below the threshold of perception on most panels. It is neither
depth nor restraint; it is a no-op that reads as an attempt. Either commit to a real figure/ground
or drop the shadow. (I argue below: drop it, and buy depth with ground and rule weight instead.)

### 1.6 The serif is declared and never used — the single largest unspent asset

`app/globals.css:101` declares `--font-serif: "Source Serif 4", Georgia, …`.

**Uses in the entire codebase: zero.** The two `font-sans` call sites
(`draft/page.tsx:234`, `review/[token]/page.tsx:64`) exist only to *undo* `<pre>`'s monospace.

So the statutory minutes body (`globals.css:143-154`) renders in the same system sans as the
nav, the buttons, the filter chips and the audit log. The strongest, cheapest, most
credibility-*positive* signal available to this product — *this is the record, that is the
software* — is specified and unspent.

### 1.7 The minutes body measure is roughly double the readable maximum

`app/layout.tsx:30` wraps everything in `max-w-5xl` (1024px). The draft page never narrows.
Minus gutters and card padding, the minutes body renders at ≈950px. At `text-document` (15px)
that is **≈120–130 characters per line**. The readable band is 60–75.

This is not a flatness finding, it is a *fatigue* finding, and it is the worst thing on the
page: the one block of text a user must read word-by-word for legal exposure is set at a measure
that makes line-tracking fail. §4.2 mandates `max-w-3xl` for "record detail and reading routes"
and the draft page does not honour it.

### 1.8 Muted text is the default voice

`text-paper-500` — **138 uses**. Every subtitle, every meta line, every helper string, at the
same size and the same grey. `app/page.tsx:114`, `companies/[id]/page.tsx:74,104,152`,
`people/[id]/page.tsx:239,273,286`. There is no *middle* register between "primary ink" and
"muted" in actual use, so every page is a headline followed by a grey field. (It is also the
system's contrast floor at 4.56:1 on `paper-50` — no headroom at all. See §3.4.)

### 1.9 Not a cause, but worth stating: the status system is the healthiest thing here

`components/status.tsx` is genuinely good work — the triple encoding is real, the glyphs are
drawn rather than typed, the dashed UNKNOWN outline is the correct pre-attentive choice, and the
`STATUS_ORDER` decision to sort unknown above risk is a real judgement well made. **Nothing in
this critique touches it.** It is also, tellingly, the only part of the app with any visual
tension in it — which is a hint about where the rest should go.

---

## 2. Direction — the argument

### 2.1 The thesis: rule weight is the hierarchy

V4 already worked this out for print (§5.9): *draft* gets a 1.5pt double rule, *reviewed* gets
1pt single, *final* gets 0.5pt below only. Rule weight, not colour, is the primary signal. That
is a correct, sophisticated, print-native decision — and it is exactly the device a Swiss annual
report or a broadsheet uses to create depth without chrome.

**I am not proposing a new visual language. I am proposing that the screen adopt the one V4
already defends for paper.** Ranked horizontal rules, in ink-black, above section headings:

| Rank | Rule | Where |
|---|---|---|
| **The document** | 2px `paper-900` + 1px `paper-900` (double, 3px gap) | The minutes body block only. Once per page. |
| **Major section** | 1px `paper-900` | Resolutions, Action Items, Assurance, Governance, each `<section>` on company/person pages |
| **Sub-block** | 1px `paper-200` hairline | Groupings inside a section |
| **Nothing** | — | Rows, list items, chips |

This does four things at once, which is why I am picking it over every alternative: it creates
depth with no shadow and no colour; it produces vertical rhythm, because a page of ranked rules
scans as a document with parts; it gives the minutes body a **focal point it currently does not
have** — the double rule is the visual echo of the `DRAFT` stamp on the export, so the screen
and the artifact finally rhyme; and it costs one `border-t` per section, no new tokens, and no
new colour.

### 2.2 Use the scale that already exists, and add exactly one step

The scale is not the problem; its non-use is. Two moves:

**Move the 23 section `<h2>`s from `text-body` to `text-title` (18/26, semibold, `paper-900`).**
This is the highest-leverage single change in the document. Combined with the rule above it, a
section heading stops being a label and becomes a landmark.

**Add one token — `text-display` at 28/34** — for record identity on detail routes: the company
name on `companies/[id]`, the person name on `people/[id]`, `MeetingHeader`'s company name.

I expect pushback on the second, because §4.1 argues density is a feature and the scale is
deliberately tight. The counter: **density is a feature in lists and tables; it is a liability
at the point of orientation.** A Swiss annual report is dense in the tables and generous at the
section openings — that contrast *is* the design. Uniform density is not density, it is
sameness, and sameness is what the owner is describing. Long Malaysian names at 28px still wrap
safely at `max-w-3xl`; the existing `text-balance break-words [hyphens:auto]` rule
(`companies/[id]/page.tsx:72`) carries over unchanged.

Resulting scale in *actual use*: 28 / 22 / 18 / 15 serif / 14 / 13 / 12. Seven steps, all
earning their place — which is what §4.1 designed and the app never delivered.

### 2.3 Serif for the record, sans for the software — and nothing else

This is the second-largest change and it is the one that makes the app feel like a law firm's
document system rather than a tool.

**Serif is permitted in exactly two places:**
1. `.minutes-body` — the statutory text. It is the record.
2. The briefing block's finding sentences (§5) — statements *about* the record, in the register
   of the record.

**Everywhere else is sans:** all chrome, all controls, all status chips, all tables, all meta.

Why this raises credibility rather than spending it: the distinction is not decorative, it is
*epistemic*. Serif means "this is the document, it will be printed, an auditor will read this
sentence." Sans means "this is the application talking about the document." A cosec who is
afraid needs to know, without reading, which of those they are looking at. Today they cannot
tell — the audit log and the minutes are set identically. Alternating the two faces inside a
single briefing card is the entire design thesis in miniature.

And it is what the references do. A law firm's document system, a Swiss annual report, and a
broadsheet all run a serif text face against a sans furniture face. None of them is playful and
none of them is flat.

### 2.4 Ground, not shadow

Depth comes from figure/ground and from rules. Concretely:

- Page ground `paper-50` → **`paper-100`** (`#F4F4F1`). Card/white separation goes 1.03 → ≈1.07:1.
  Still deeply restrained; enough that a card reads as a plate on a toned page, which is exactly
  the annual-report move.
- Card border `paper-200` → **`paper-300`** across all 63 sites. This is not a new decision — it
  is §4.4 as written. The code drifted; bring it back.
- **Delete `shadow-raised` from flat-on-page cards** (67 sites). It is invisible and it
  contradicts §4.5's own sentence, *"a statutory record should sit on the page, not hover above
  it."* Keep `shadow-float` for genuinely overlaid surfaces (drawer, dropdowns, modals) — that
  is the only place elevation means anything.

The ground change has one hard consequence, stated in §3.4: `paper-500` no longer clears AA on
the page ground. That is a feature — it forces the retirement of a token that has been sitting
at 4.56:1 across 138 call sites with zero headroom.

### 2.5 Asymmetry and the accent — where I stop

Two deliberate refusals inside the "life" mandate:

**I would not introduce an ink structural language.** `ink-*` currently means *you can act here*
— buttons, links, focus. That is one clean meaning, and it exists because §1.3 defect F
documented what happened when indigo meant five things. Using navy for section rules would be a
fifth meaning by a different route. **The rules are `paper-900`.** Ink stays scarce: one primary
button per view, plus links. Scarcity is what makes it read as intention rather than as branding.

**I would not add a sidebar, an asymmetric grid, or a two-column layout.** The generous
asymmetry the brief invites is better spent on *vertical* asymmetry — the ranked rules produce
uneven, meaningful spacing down the page — than on horizontal columns, which would put the
minutes body in a well and reduce its measure further from a different direction. The one
horizontal asymmetry I do want is baseline-aligned section headers with a right-hand meta slot
(count, timestamp, action), which turns a centred label into a spanned line.

### 2.6 Motion — one rule

**Motion is permitted only on a change of state, never on arrival or hover.** A check flipping
from UNKNOWN to VERIFIED after a re-run gets a 150ms background/border transition, so the eye
catches *which* row changed. Nothing else moves: no page transitions, no card hover lift, no
count-up numbers, no skeleton shimmer. Hover on a linked card is a border-colour change only
(§4.5 already says this; `app/page.tsx:99` still declares `transition-shadow` against a shadow
that no longer changes — dead code).

The global `prefers-reduced-motion` block at `globals.css:241-250` already covers this
correctly. No change needed there.

---

## 3. Paste-ready changes

### 3.1 `@theme` deltas — `app/globals.css`

Only additions and two edits. No new colour tokens; the palette is not the problem.

```css
  /* --- TYPE: one new step. Record identity on detail routes, once per page. --- */
  --text-display: 1.75rem;                    /* 28px */
  --text-display--line-height: 2.125rem;      /* 34px */
  --text-display--letter-spacing: -0.011em;

  /* Optical correction at the top of the scale. 22px+ at default tracking
     reads loose against 14px body; this is a size-compensation, not a style. */
  --text-page--letter-spacing: -0.008em;
  --text-title--letter-spacing: -0.004em;

  /* --- The document face, once next/font is wired (§3.2). --- */
  --font-serif: var(--font-document), Georgia, "Times New Roman", serif;

  /* --- MEASURE. The statutory text is currently set at ~125 characters. --- */
  --measure-document: 68ch;
```

### 3.2 Fonts — my answer to "is a real typeface worth the weight"

**Yes for the serif. No for Inter. Ship exactly one family.**

Ship **Source Serif 4**, variable, latin subset, roman + italic (italic is required — the
export pipeline already carries italic runs, `lib/export/build-docx.ts:30-45`). ≈75KB for both
styles. It is worth it because the document face is the one thing that must be *stable*: the
on-screen draft is a prediction of the printed DOCX, and a draft that renders in Georgia on
Windows and Times on another machine is a slightly different prediction each time. For a product
whose promise is "here is the proof," the proof should not reflow by platform.

**Do not ship Inter.** Inter is the default SaaS sans — it is the typographic equivalent of
`indigo-600`, and V4 rejected indigo in §2.1 for precisely this reason (*"reads as consumer
software"*). Shipping Inter re-spends the credibility that the palette decision bought. The
chrome face should be `system-ui` — Segoe UI on Windows, SF Pro on macOS, Roboto on Android. All
three are neutral, serious, professionally drawn, and free. Chrome is allowed to be native;
the document is not. This also keeps the total font budget to one family instead of two, which
is how the serif gets approved at all.

```tsx
// app/layout.tsx
import { Source_Serif_4 } from "next/font/google";

const documentFace = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-document",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: true,   // metric-matches Georgia; kills the reflow on swap
});

// <html lang="en" className={documentFace.variable}>
```

Then remove `"Inter",` from `--font-sans` in `globals.css:98-100`, leaving the system stack.
Declaring a family the app does not load is how `--font-serif` ended up unused for a whole
release.

### 3.3 `.minutes-body` — the document, set as a document

Replace the `@layer components` block at `globals.css:137-157`:

```css
  .minutes-body {
    font-family: var(--font-serif);
    max-width: var(--measure-document);   /* THE fix for §1.7 */
    font-variant-numeric: oldstyle-nums proportional-nums;
  }
  /* Headings stay serif — this is one document, not a document with sans furniture. */
  .minutes-body h2 { @apply mt-8 mb-2 text-title font-semibold text-paper-900 first:mt-0; }
  .minutes-body h3 { @apply mt-6 mb-2 text-subhead font-semibold text-paper-900 first:mt-0; }
  .minutes-body p  { @apply mb-4 text-document text-paper-800; }   /* 700 → 800: this is the text */
  .minutes-body ul { @apply mb-4 list-disc space-y-1.5 pl-5 text-document text-paper-800; }
  .minutes-body ol { @apply mb-4 list-decimal space-y-1.5 pl-5 text-document text-paper-800; }
  .minutes-body li { @apply text-document text-paper-800; }
  .minutes-body strong { @apply font-semibold text-paper-900; }
  .minutes-body em { @apply italic; }        /* currently unstyled; the pipeline emits italics */

  /* Tables inside minutes are DATA, not prose — they revert to the sans face. */
  .minutes-body table { font-family: var(--font-sans); }
```

`oldstyle-nums` is not decoration: dates and resolution numbers set in text figures sit on the
baseline of a serif paragraph instead of shouting out of it. It is what a printed set of minutes
looks like. Revert it if it fights the Maisca tables — but the tables are sans, so it will not.

### 3.4 The ground shift, and the token it retires

```diff
- <body className="antialiased min-h-screen bg-paper-50 text-paper-900">
+ <body className="antialiased min-h-screen bg-paper-100 text-paper-900">
```

**This is conditional on one mechanical change and must not ship without it.** `paper-500`
`#74736A` measures 4.77:1 on white and 4.56:1 on `paper-50` — it has no headroom, and on
`paper-100` `#F4F4F1` it falls **below the 4.5:1 AA floor**.

So: **retire `text-paper-500` as the muted-text token. Replace all 138 occurrences with
`text-paper-600`** (`#5C5A53`, 6.90:1 on white, ≈6.4:1 on `paper-100`). This is a find/replace,
it improves contrast at every one of the 138 sites, and it gives the muted register real
headroom for the first time. `paper-500` survives for **placeholder text on white only**
(`globals.css` §5.6 rule), which is its only defensible remaining use.

Re-checked against the new ground so the status language is not weakened (see §4):

| Element on `paper-100` `#F4F4F1` | Ratio | Verdict |
|---|---|---|
| UNKNOWN chip text `unknown-800` `#363E46` (chip ground is `bg-transparent`) | ≈9.3:1 | PASS |
| UNKNOWN chip dashed border `unknown-600` `#5A6672` | ≈5.1:1 | PASS (≥3:1) |
| `paper-600` `#5C5A53` | ≈6.4:1 | PASS |
| `paper-500` `#74736A` | ≈4.4:1 | **FAIL — this is why it is retired** |
| `paper-450` `#8A887E` form border | ≈3.2:1 | PASS (≥3:1), no headroom — re-measure if the ground moves again |

### 3.5 `SectionHeading` — new shared component

The single component that carries §2.1 and §2.2. Add to `components/ui.tsx`.

```tsx
/**
 * A ranked section rule + heading. Rule WEIGHT is the hierarchy, exactly as
 * VISUAL_SYSTEM_V4 §5.9 already specifies for the printed exports — this is
 * that principle applied to the screen.
 *
 *   rank="document"  double rule — the minutes body. ONCE per page.
 *   rank="section"   1px paper-900 — every major <section>. The default.
 *   rank="sub"       1px paper-200 hairline — groupings inside a section.
 */
export function SectionHeading({
  children,
  meta,
  rank = "section",
  id,
}: {
  children: ReactNode;
  /** Right-hand baseline slot: count, timestamp, or a quiet action. */
  meta?: ReactNode;
  rank?: "document" | "section" | "sub";
  id?: string;
}) {
  const rule =
    rank === "document"
      ? "border-t-2 border-paper-900 pt-3 [box-shadow:0_3px_0_-2px_var(--color-paper-900)]"
      : rank === "section"
        ? "border-t border-paper-900 pt-3"
        : "border-t border-paper-200 pt-2.5";

  return (
    <div
      className={`mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${rule}`}
    >
      <h2 id={id} className="text-title font-semibold text-balance text-paper-900">
        {children}
      </h2>
      {meta ? <div className="text-meta text-paper-600">{meta}</div> : null}
    </div>
  );
}
```

The `box-shadow` on `rank="document"` draws the second rule of the double at a 3px gap without a
wrapper element. It is a rule, not elevation — exempt from §2.4's shadow deletion, and it must be
excluded from the print stylesheet's `box-shadow: none` at `globals.css:274-276`:

```css
@media print {
  *:not([data-rule]) { box-shadow: none !important; }   /* was: * { … } */
}
```
(Add `data-rule` to the `rank="document"` element.)

Call sites, all of which currently render a 14px `<h2>`:

```tsx
// app/meetings/[id]/draft/page.tsx:260, :287
<SectionHeading meta={`${typedResolutions.length} recorded`}>Resolutions</SectionHeading>
<SectionHeading meta={`${typedActionItems.length} recorded`}>Action Items</SectionHeading>
// assurance-panel.tsx:201, governance-risk-panel.tsx:108, obligations-panel.tsx:52/67,
// activity-feed.tsx:56, companies/[id]/page.tsx:87/119/151/193,
// people/[id]/page.tsx:91/224/251/272 — same swap.
```

### 3.6 The draft page — give it a focal point

`app/meetings/[id]/draft/page.tsx`. Four edits, in order of effect:

```diff
- <div className="space-y-8">
+ <div className="mx-auto max-w-3xl space-y-10">          {/* §4.2's own measure rule */}
```

```diff
  {/* :226 — the minutes body stops being a card and becomes the page */}
- <div className={`mt-4 rounded-surface border bg-white p-6 shadow-raised ${
-   isLowConfidence ? "border-status-risk-300 ring-1 ring-status-risk-200" : "border-paper-200"
- }`}>
+ <div className={`mt-6 bg-white px-6 py-8 sm:px-10 sm:py-10 ${
+   isLowConfidence
+     ? "rounded-surface border border-status-risk-300 ring-1 ring-status-risk-200"
+     : "border-t-2 border-paper-900 [box-shadow:0_3px_0_-2px_var(--color-paper-900)]"
+ }`} data-rule>
```

The low-confidence case deliberately keeps its box and risk ring — a flagged draft *should*
break the document treatment, because it is not yet behaving as a document.

```diff
  {/* :99 in app/page.tsx and every peer — dead transition against a shadow that no longer moves */}
- className="… shadow-raised transition-shadow hover:border-paper-450 …"
+ className="… transition-colors hover:border-paper-450 hover:bg-paper-50 …"
```

And demote the audit log, which currently has the same weight as the instrument:

```diff
  {/* activity-feed.tsx:55 */}
- <div className="rounded-surface border border-paper-200 bg-white p-6 shadow-raised">
-   <h2 className="text-body font-medium text-paper-700">Activity</h2>
+ <details className="rounded-surface border border-paper-300 bg-paper-50 px-4 py-3">
+   <summary className="cursor-pointer text-meta font-medium text-paper-600">Activity log</summary>
```

### 3.7 Status-chip typography — the one adjustment inside the status system

Chips currently sit at `text-caption` (12px) with default tracking (`status.tsx:147`). At 12px
`font-medium` in a system sans, uppercase state words in `StatusRow` (`status.tsx:222`) already
carry `tracking-[0.06em]`, but the chip labels do not. Add `tracking-[0.01em]` to the chip base
and raise it to `font-semibold`:

```diff
- className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-medium whitespace-nowrap …`}
+ className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-semibold tracking-[0.01em] whitespace-nowrap …`}
```

This is the only change to `components/status.tsx` in this document. It touches weight and
tracking only — no colour, no glyph, no border. See §4.

---

## 4. The four states survive — checked, not assumed

Every proposal above was tested against the triple encoding in `status.tsx`. The encoding
channels are **colour + glyph + border treatment** (§3.1), and none of them is touched:

| Proposal | Effect on the four states |
|---|---|
| Serif for `.minutes-body` and briefing sentences | **None.** Chips, rows and banners stay sans. Serif is scoped by class, never inherited into `StatusChip`. |
| `text-title` section headings | **None.** Headings are not status surfaces. |
| Card border `paper-200` → `paper-300` | Ambient border rises from 1.26:1 to 1.52:1. Status rails remain **3px at the `-600` step** (4.53–5.87:1) and the FAILED chip remains **2px**. The rail:ambient ratio is still 3× in weight and >3:1 in colour. **Verified separable.** |
| Delete `shadow-raised` | **None.** Elevation was never a status channel — §3.1 lists three, and shadow is not one. |
| Page ground `paper-50` → `paper-100` | The only state that touches the page ground is UNKNOWN, whose chip is `bg-transparent`. Re-measured in §3.4: text 9.3:1, dashed border 5.1:1. **PASS.** |
| `paper-500` → `paper-600` | Improves every affected site. `StatusRow`'s detail line goes 4.77 → 6.90:1. |
| Ranked `paper-900` rules | Achromatic, and at 1–2px they cannot be confused with a 3px coloured rail. **Deliberately not `ink`** — see §2.5. |
| Chip `font-semibold` + tracking | Strengthens the greyscale channel; changes no encoding. |

**The mechanical test from §7.3 still passes:** desaturate any status surface and
`✓ solid` / `? dashed` / `✕ double` / `! solid` remain distinct by shape. Print is unaffected —
the print block at `globals.css:258-298` keeps every status border at ≥1pt, and the one
`box-shadow` I add is exempted explicitly in §3.5 rather than being allowed to survive by
accident.

---

## 5. The briefing block — critique

`docs/CONCEPT_BRIEFING_BLOCK.md`. The concept is right. Four of its design rules are the
best writing in the plan pack — "sentences, not shapes," provenance on the same line, and
"the gap is a finding" are all correct and hard-won. The mock does not yet honour them.

### 5.1 It does not survive twelve findings

Four two-line rows plus header, sub-header and footer is ≈400px. Twelve is ≈1,100px, which puts
the minutes body — the document being signed — entirely below the fold on a laptop. A twelve-item
list of equal-weight sentences is precisely the wall the doc's own open question fears.

**Fix — the block is never taller than five rows.** Sort by `STATUS_ORDER` (`status.tsx:46`),
render the top three, collapse the remainder into a `<details>`.

The summary line is the load-bearing part and it must **name the states, never just count**:

> `4 more — 2 not checked, 1 for review, 1 noted`

A bare "4 more" lets a failure hide behind a chevron, and this block exists because things hide.
Corollary rule: **a `failed` finding is never collapsible.** If four rows are `failed`, four rows
render, and the block is tall — correctly, that day.

**It must never scroll internally.** A findings box with its own scrollbar is how findings get
missed; that is the whole thesis of the product.

### 5.2 It does not survive one finding either — for the opposite reason

Header + count + one row + footer is ~70% chrome around one sentence. It reads as ceremony, and
ceremony around a single item is how users learn to skim the block.

**Fix — at exactly one finding, there is no card.** Render the finding as a `StatusBanner`
(`status.tsx:256`) carrying the same sentence and the same provenance line. Same vocabulary,
one less box. The block *becomes* the finding.

### 5.3 "4 things" is the wrong number and it will be gamed

Two faults. It conflates severities — four could be four undeclared conflicts or four neutral
cross-references, and the header reads identically. And it is a number a user will want to drive
to zero, which quietly incentivises dismissal.

**Replace the count with the state breakdown:** `1 conflict · 1 not stated · 2 noted`. It cannot
be gamed to zero without actually resolving something, and it tells you what kind of day it is
before you read a word.

### 5.4 The zero state is the most important state and the doc does not specify it

This is my strongest note. The concept contains a contradiction:

- Rule 3: *"Silence is the default. The block should be empty most sessions."*
- Rule 4: *"The gap is a finding … never hidden or blank."*

If the block renders **nothing** when it finds nothing, the cosec cannot distinguish *"we
traversed the graph and there is nothing"* from *"the traversal did not run."* That is
`VISUAL_SYSTEM_V4` **defect A** — the false green all-clear — reintroduced at the top of the
draft page, in the surface with the most authority on it.

**The block is never absent.** Three zero-ish states, all one line, none of them a card:

| Condition | Render |
|---|---|
| Traversal ran, found nothing | VERIFIED strip: *"Checked against 6 companies, 14 prior meetings and 3 documents on file. Nothing to flag."* — the denominators are the point; a bare "nothing to flag" is unearned. |
| Traversal could not run | UNKNOWN strip: *"Connection checks did not complete. Nothing here has been checked."* |
| First meeting for this company | UNKNOWN strip: *"First meeting on file for this company — there is no history to compare against."* |

The third answers the doc's own open question, and note that it is genuinely UNKNOWN, not empty:
no history means the deviation checks *did not run*, which is a finding.

### 5.5 The footer caveat is the most important sentence and it is the smallest

> *muted text "Register of directors not on file — directorships can't be confirmed"*

This is a **scope-of-check limitation**, and it silently undercuts Row 1: the conflict finding is
only as good as the register it was derived from. Setting it as muted text beneath a button is
the exact pattern V4 §1.2 defect C condemns ("*'No assurance report yet' is a whisper*").

**It is an UNKNOWN row, in the list, sorted by `STATUS_ORDER` like everything else.** The concept
doc's own Rule 4 says the gap gets the same weight as a positive finding; the mock demotes it to
a footnote. Fix the mock, keep the rule.

### 5.6 The icon set is a fifth status vocabulary

The mock proposes `alert-triangle` / `history` / `link` / `help-circle` with severities
"danger / warning / neutral / neutral." That is a new vocabulary — the exact failure catalogued
as **defect H** (four parallel status languages), arriving as a fifth. The app already has
`components/status.tsx`. Use it, with no additions.

### 5.7 "Neutral" findings do not belong in this block

Rows 3 and 4 in the mock are neither failures nor risks. Row 3 (*Resolution 3 amends BD-2024-07,
still in force*) is genuinely useful **context**, but it is not a claim about correctness, and
sitting it in the same list at the same weight as an undeclared director's interest dilutes the
two rows that could get someone sued. Scarcity is the block's only real asset — Rule 3 says so.

**Split the block into two zones inside one frame:**

- **"Worth knowing before you sign"** — `failed` / `unknown` / `risk` only. Serif sentences at
  `text-document`. These are the liability rows.
- **"Also on the record"** — context and cross-references. `text-meta`, sans, `paper-600`, no
  glyphs, below the section rule. Two lines maximum, then a `+n more`.

If the top zone is empty and the bottom is not, the top zone still renders its VERIFIED strip
(§5.4). The two zones never merge.

### 5.8 Does it earn its place above the minutes body?

**Yes — its position is its argument.** "Before you sign" is a claim about *when*, and putting it
below the document it is about would falsify that claim. But it earns the position only under
§5.1's height bound. A block that can push the instrument off screen has stopped being a briefing
and become an interstitial.

**Company-level placement: no.** The block's authority comes from being about *this meeting, at
the moment of signing*. On a company page it has no moment, degrades into a dashboard widget,
and loses the rarity that Rule 3 correctly identifies as its whole value. If company-level
connection review is wanted, that is the ego graph's job, and the graph is already there.

### 5.9 Typographic spec for the block

This is where the §2.3 thesis earns itself:

```
Frame:       rounded-surface border border-paper-300 bg-white px-5 py-5 sm:px-6
             (NOT a status frame — the block is a container of findings, not one finding)
Heading:     SectionHeading rank="section" — "Worth knowing before you sign"
Meta slot:   text-meta text-paper-600 — "1 conflict · 1 not stated · 2 noted"
Sub-header:  text-meta text-paper-600 — company · type · date

Finding row: StatusRowIcon (status.tsx:181) + body
  Sentence:  font-serif text-document text-paper-800   ← the record's voice
             names in <strong> font-semibold text-paper-900
  State word: text-caption font-semibold uppercase tracking-[0.06em]  (STATUS_TEXT_CLASS)
  Provenance: font-sans text-meta text-paper-600, mt-0.5   ← the software's voice
  Row rule:  border-t border-paper-200 pt-3, first:border-0 first:pt-0

Context zone: SectionHeading rank="sub" — "Also on the record"
              text-meta font-sans text-paper-600, no glyph

Footer:      Secondary button "See the connections ↗"  (§5.5 button hierarchy)
             — and NOTHING else. The caveat moved into the list (§5.5 above).
```

The serif sentence over a sans provenance line is the single detail I care most about in this
document. It makes the finding read as a judgement from a colleague and the provenance as a
citation from a system — which is exactly the life the owner is asking for, obtained with
typography rather than with chrome.

---

## 6. What I would NOT do, and why

The restraint I am keeping. Each of these is a live temptation in a "bring it to life" brief.

1. **No dark mode.** §6 argues this correctly and completely. The product's mental model is
   paper; a dark surface is a bad rehearsal for a printed exhibit, and the `-50` chip tints do
   not invert — they would need to be redesigned as a second system with its own measured
   contrast table. Nothing in the brief is worth that.

2. **No Inter, and no second webfont.** Argued in §3.2. Inter is `indigo-600` in typographic
   form. The chrome face stays native.

3. **No brand navy in structure.** `ink-*` means *you can act here* and nothing else. A navy
   section rule would be a fifth meaning arriving by the same door as defect F. Rules are
   `paper-900`.

4. **No new colour, no fifth family, no tints.** The palette is not the cause of the flatness
   and adding to it would be treating a hierarchy problem with hue. §2.2 stays as written.

5. **No elevation-based depth.** No layered shadows, no glass, no "cards floating above the
   page." §4.5's sentence — *documents do not float* — is right; the current implementation
   simply fails to be either restrained or visible. Depth comes from ground and rule weight.

6. **No animated dials, count-ups, progress rings, confetti, or a "score improved" moment.**
   The assurance score is a claim about statutory completeness. Animating it converts a finding
   into a reward, which is how a cosec learns to chase the number rather than read the checks.

7. **No icon set, no illustration, no empty-state art.** Empty states here are frequently
   *findings* (§5.8 of V4). An illustration next to "nothing has been checked" makes an absence
   look designed-for and therefore fine. The two variants stay as `EmptyState` has them.

8. **No hover lift, no page transitions, no skeletons.** Motion only on state change (§2.6).

9. **No truncation anywhere new**, and I would fix the two existing ones —
   `app/page.tsx:105` and `companies/page.tsx:55` truncate `company_name` on the surface that
   identifies the record, against §4.1's long-name rule and Principle 7.

10. **No change to the four states' encoding.** Colour, glyph, border treatment. Section 4 above
    is the proof that nothing here weakens them; if any future change cannot produce that table,
    it does not ship.

11. **No radius above 6px and no new pill shapes.** Pill remains reserved for status
    (`--radius-pill`), which is a shape carrying meaning and must not be spent on decoration.

---

## 7. Sequencing

Ordered by life-per-unit-of-risk. Items 1–3 are ~80% of the visible change and touch no
correctness logic.

| # | Change | §  | Files |
|---|---|---|---|
| 1 | `SectionHeading` + move 23 `<h2>`s to `text-title` with ranked rules | 2.1, 2.2, 3.5 | `ui.tsx` + 14 call sites |
| 2 | Wire `next/font` Source Serif 4; scope it to `.minutes-body`; cap the measure at `68ch` | 2.3, 3.2, 3.3 | `layout.tsx`, `globals.css` |
| 3 | Ground `paper-50`→`paper-100`; borders `paper-200`→`paper-300`; delete `shadow-raised`; `text-paper-500`→`text-paper-600` ×138 | 2.4, 3.4 | mechanical, repo-wide |
| 4 | Draft page: `max-w-3xl`, minutes body promoted out of card-equality, activity log demoted | 1.3, 3.6 | `draft/page.tsx`, `activity-feed.tsx` |
| 5 | `text-display` on record-identity headings | 2.2, 3.1 | `MeetingHeader`, `companies/[id]`, `people/[id]` |
| 6 | Chip weight + tracking | 3.7 | `status.tsx` (one line) |
| 7 | Briefing block built to §5 — bounded height, zero state, state breakdown, two zones | 5 | new |
| 8 | Fix the two remaining `truncate` calls on `company_name` | 6.9 | `app/page.tsx:105`, `companies/page.tsx:55` |

If the sprint is cut, ship 1 and 2. They are the two changes the owner is actually describing.
