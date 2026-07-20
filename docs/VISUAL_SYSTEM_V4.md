# Visual System V4 — Statutory Minutes

**Status:** Specification. Nothing in this document has been applied to application code yet.
**Scope:** Design tokens, semantic status language, component specs, accessibility budget.
**Applies to:** `meeting-minutes-transcript` (Next.js 15 App Router, Tailwind CSS v4.3.3).

---

## 0. Why this document exists

This product is not a dashboard. Its output is a statutory instrument — a document an auditor
or a litigator reads five years later, in print, with no access to the app that produced it.
The interface's job is to make one claim credible: **nothing legally required is missing, and
here is the proof.**

That claim has a failure mode that is worse than ugliness. Today, in several places, "we checked
and it was fine" and "we never checked" render almost identically. A cosec who reads a silent
screen as a clean screen files minutes with an unverified gap in them. This is the primary
defect V4 fixes, and everything else in this document is subordinate to it.

---

## 1. Audit of the current system

### 1.1 What exists

There is **no design system layer**. `app/globals.css` is 85 lines: an `@import "tailwindcss"`,
a hand-rolled `.minutes-body` prose block, two utilities (`.tap-target`, `.focus-ring`), and one
media query. There is **no `@theme` block**, so every colour, size and radius in the app is a
raw Tailwind default utility chosen at each call site.

The only shared component vocabulary is `components/ui.tsx` (142 lines): `Badge` with five
variants, `StatusBadge`, `OutcomePill`, `ItemStatusPill`, `ConfidenceTag`, `ConfidenceChip`,
`EmptyState`, and a `FOCUS_RING` string constant.

Measured usage across `app/` and `components/`:

| Axis | What's actually in use |
|---|---|
| Neutrals | `neutral-*` only (Tailwind default grey). `text-neutral-500` ×81, `text-neutral-700` ×74, `border-neutral-200` ×61, `border-neutral-300` ×60 |
| Brand | `indigo-*` — `bg-indigo-600` ×23, `ring-indigo-500` ×41, `text-indigo-600` ×18 |
| Semantic | `red-*` (×~60), `amber-*` (×~50), `emerald-*` (×~25) |
| Radii | `rounded-md` ×125, `rounded-lg` ×48, `rounded-sm` ×21, `rounded-full` ×18, bare `rounded` ×7, `rounded-xl` ×3 |
| Type | `text-sm` ×188, `text-xs` ×124, `text-base` ×49, `text-lg` ×21, `text-[11px]` ×13, `text-xl` ×2 |
| Elevation | `shadow-sm` ×59, `shadow-md` ×7, bare `shadow` ×7, `shadow-lg` ×2, `shadow-xl` ×1 |
| Typeface | None set. Tailwind v4's default `font-sans` (system-ui stack) throughout. One `font-mono` at `app/meetings/[id]/transcript/transcript-editor.tsx:184` |

**Dark mode: not supported.** A repo-wide grep for `dark:` across `app/`, `components/`, `lib/`
and `globals.css` returns zero matches. There is no `prefers-color-scheme` rule, no `class`
strategy, and `app/layout.tsx:26-27` hard-codes `bg-neutral-50 text-neutral-900` on `<body>`
with no theme hook. See §7 — this document does **not** invent a dark palette.

### 1.2 Correctness defects — where "unknown" reads as "verified"

These are the findings that matter. Each is a case where absence of a check renders as
absence of a problem.

**A. A failed conflict scan renders as a green all-clear.**
`lib/conflicts.ts:14-16` documents its own contract: *"It never throws: any failure resolves to
an empty finding list so the draft page still renders."* `governance-risk-panel.tsx:125` then
computes `allClear = conflicts.length === 0 && consistency.length === 0`, and
`governance-risk-panel.tsx:141-152` renders that as an emerald banner reading **"No conflicts or
contradictions detected across the record."**

A database error, a missing directorship graph, and a genuinely clean record all produce the
identical green assertion. This is the single most serious visual defect in the product: the
UI makes a positive assurance claim it has not earned.

**B. An unmeasured confidence renders as nothing at all.**
`components/ui.tsx:98` — `ConfidenceTag` returns `null` when confidence is `null | undefined`.
`components/ui.tsx:105` — `ConfidenceChip` does the same. On the draft page
(`app/meetings/[id]/draft/page.tsx:155-156`) both are rendered side by side, so a draft whose
confidence was never scored looks *exactly* like a draft that scored 100%: a clean header with
no chip. Silence is being used to mean two opposite things.

**C. "No assurance report yet" is a whisper.**
`assurance-panel.tsx:187` renders the not-run state as `<p className="mt-4 text-sm
text-neutral-500">No assurance report yet.</p>` — the same muted grey used for incidental
metadata everywhere else in the app. Meanwhile a *bad* score renders as a 64px ring dial
(`assurance-panel.tsx:191-195`). The state that should stop a cosec cold is quieter than the
state that merely informs them.

**D. The assurance model has no "unknown" to express.**
`lib/assurance.ts:12` — `export type AssuranceStatus = "pass" | "warn" | "fail"`. There is no
`unknown` / `not_run` / `not_applicable` member. A check that could not be evaluated has
nowhere to go in the type, so it must currently be forced into one of the three, and the
component layer cannot render honestly what the data layer cannot represent. **This is a
prerequisite for §5.2 and needs an engineering change, not just a CSS change.**

### 1.3 Consistency defects

**E. Two different focus rings, both live.**
`app/globals.css:70-72` defines `.focus-ring` as `outline-none focus-visible:ring-2 …`.
`components/ui.tsx:11-12` defines `FOCUS_RING` as `focus-visible:outline-none
focus-visible:ring-2 …`. These differ materially — the CSS utility kills the outline
unconditionally, harming forced-colors/Windows-High-Contrast users; the TS constant only kills
it on focus-visible. Both are used in the same file: `app/page.tsx:123` uses the class,
`app/page.tsx:201` uses the class, while `site-header.tsx:42` uses the constant. One must die.

**F. Brand colour is carrying semantic meaning.**
`components/ui.tsx:79` — `ItemStatusPill` renders an *open* action item as `variant="indigo"`.
Indigo is simultaneously the primary-button colour (`site-header.tsx:54`), the active-nav
colour (`site-header.tsx:70`), the link colour (`app/page.tsx:266`), the focus-ring colour
(`ui.tsx:12`) and the "Minutes v2" chip (`app/page.tsx:123`). A user cannot learn what indigo
means because it means five things.

**G. Status pills and taxonomy tags are visually identical.**
`StatusBadge status="draft"` renders `variant="neutral"` (`ui.tsx:44`). So does
`ConfidenceChip` at high confidence (`ui.tsx:108`). So do the obligation *kind* tags
`matters_arising`, `confirm_previous` and `custom` (`app/obligations/page.tsx:38-40`). Legal
state, quality measurement, and category label share one grey pill. Nothing tells the eye
which of them is a claim about correctness.

**H. Four parallel, divergent status vocabularies.**
- `ui.tsx:14` — `BadgeVariant = neutral | amber | green | red | indigo`
- `assurance-panel.tsx:45-61` — `fail/warn/pass` with `✕ ! ✓`, `bg-*-100 text-*-700` icons and `border-l-4` rails
- `governance-risk-panel.tsx:27-45` — `warn/flag`, both using `!` as their glyph, labelled "Review"/"Flag"
- `confirmation-status.tsx:44,52,66-71` — bare emerald/neutral/amber/red divs with no shared component

Four teams-worth of status language. `flag` (red) and `fail` (red) mean different things;
`warn` (amber) appears in three of the four with three different label words.

**I. Colour is the sole differentiator in the largest status surface.**
`confirmation-status.tsx:66-71` distinguishes "memory risk" from ordinary unconfirmed purely by
swapping `border-red-200 bg-red-50 text-red-700` for `border-amber-200 bg-amber-50
text-amber-800`. No icon, no label change beyond an appended clause, no shape difference. For a
deuteranopic user, and in any greyscale print, these two states are indistinguishable.

**J. Insufficient border contrast on form fields.**
Every input in the app uses `border-neutral-300` (`companies/page.tsx:100,113`;
`people/page.tsx:46`; `transcript-editor.tsx:184`). Tailwind's `neutral-300` is `#d4d4d4`,
which is **1.51:1** against white — well under the 3:1 that WCAG 2.2 SC 1.4.11 requires for the
boundary of a user-interface component. The field edges are, formally, invisible.

**K. Heading level ×12 with no hierarchy.**
`text-lg font-semibold text-neutral-900` is the `h1` on twelve pages
(`app/page.tsx:195,214,248`, `companies/page.tsx:28`, `people/page.tsx:26`,
`obligations/page.tsx:217`, `action-items/page.tsx:173`, `login/page.tsx:55`,
`invite/page.tsx:16`, `meetings/new/page.tsx:24`, `companies/[id]/page.tsx:71`,
`meetings/[id]/draft/page.tsx:152`). There is exactly one heading size in the product. Section
headings are `text-xs uppercase text-neutral-500` (`assurance-panel.tsx:169`), which is
*smaller* than body text — so the type scale runs backwards at the top end.

**L. Inconsistent measure.**
`app/layout.tsx:30` wraps all content in `max-w-5xl`. Pages then re-declare their own:
`max-w-5xl` (`companies/page.tsx:27`, `people/page.tsx:24`, `workspaces/page.tsx:36`),
`max-w-3xl` (`companies/[id]/page.tsx:62`, `people/[id]/page.tsx:54`), `max-w-2xl`
(`meetings/new/page.tsx:23`, `settings/page.tsx:13`, `invite/page.tsx:15`). Three measures, no
stated rule, and the outer wrapper is redundant with three of them.

**M. Stale scaffolding comments.** `assurance-panel.tsx:11`, `governance-risk-panel.tsx:6`,
`obligations-panel.tsx:7` and `precedent-panel.tsx:9` all state *"this component is
intentionally NOT mounted anywhere yet."* All four are mounted, at
`app/meetings/[id]/draft/page.tsx:261-279`. Cosmetic, but it misleads anyone restyling them.

### 1.4 What the exports already get right

`lib/export/build-docx.ts:138-151` and `lib/export/build-pdf.ts:324-332` already stamp a
centred banner — `DRAFT — NOT REVIEWED OR APPROVED` or `DRAFT — REVIEWED, NOT YET FINAL` — on
anything whose status is not `final`. The reasoning in the DOCX comment is exactly right and
should be treated as the founding principle of this system.

Two gaps: the DOCX banner is amber `B45309` (`build-docx.ts:145`) which is weak in greyscale
print, and neither export carries the **assurance result** — a draft with three failed statutory
checks exports with the same banner as a clean one. §5.9 addresses both.

---

## 2. Palette

### 2.1 Design rationale

| Change | From | To | Why |
|---|---|---|---|
| Brand | `indigo-600` `#4f46e5` | `ink-600` `#2C4568` | Indigo is the default SaaS accent and reads as consumer software. A desaturated navy is the register of a document system, and it stops competing with the semantic colours for attention. |
| Neutrals | `neutral-*` (pure grey) | `paper-*` (warm grey) | A slightly warm neutral reads as paper rather than as chrome, and it separates cleanly from the cool `unknown-*` slate — which is what makes the unknown state legible as its own thing. |
| Success | `emerald-*` | `verified-*` (deeper, less saturated green) | `emerald-500`-family greens read as "success toast". This is an assertion of legal completeness; it should read as ink, not celebration. |
| Warning | `amber-600` `#d97706` | `risk-600` `#9A6A08` | `amber-600` on white is 3.16:1 — it fails AA for text. `risk-600` is 4.73:1 and passes both as text on white and as a solid button ground with white text. |
| Unknown | *(did not exist)* | `unknown-*` (cool slate) | New. See §3. |

### 2.2 The `@theme` block

Paste into `app/globals.css`, immediately after `@import "tailwindcss";`. Every value is an
explicit sRGB hex so that DOCX/PDF export code (which cannot resolve CSS variables) can use the
same literals.

```css
@import "tailwindcss";

@theme {
  /* ---------------------------------------------------------------------
   * PAPER — warm neutral. Surfaces, borders, and body ink.
   * ------------------------------------------------------------------- */
  --color-paper-50:  #FAFAF8;  /* page ground */
  --color-paper-100: #F4F4F1;  /* subtle fill, table zebra, disabled ground */
  --color-paper-200: #E6E5E0;  /* hairline / divider (decorative only) */
  --color-paper-300: #D3D2CB;  /* card border, dashed empty-state border */
  --color-paper-400: #9A988E;  /* DECORATIVE ONLY — 2.89:1, never text, never a boundary */
  --color-paper-450: #8A887E;  /* form-field border — 3.56:1, meets SC 1.4.11 */
  --color-paper-500: #74736A;  /* muted / secondary text — 4.77:1 on white */
  --color-paper-600: #5C5A53;  /* tertiary body text */
  --color-paper-700: #45443E;  /* body text */
  --color-paper-800: #2E2D29;  /* strong body text */
  --color-paper-900: #1C1B18;  /* headings, primary ink */

  /* ---------------------------------------------------------------------
   * INK — brand navy. Primary actions, links, focus. Carries NO status meaning.
   * ------------------------------------------------------------------- */
  --color-ink-50:  #EFF3F8;
  --color-ink-100: #DCE4EF;
  --color-ink-200: #BCCADD;
  --color-ink-500: #3D5A80;  /* focus ring */
  --color-ink-600: #2C4568;  /* primary button ground, link text */
  --color-ink-700: #22364F;  /* primary button hover */
  --color-ink-800: #1A2A3D;  /* primary button active */

  /* ---------------------------------------------------------------------
   * SEMANTIC — status. These four families are reserved. Nothing decorative,
   * categorical or navigational may use them.
   * ------------------------------------------------------------------- */

  /* VERIFIED — a check ran and it passed. */
  --color-status-verified-50:  #ECF5EE;
  --color-status-verified-100: #D5E9DA;
  --color-status-verified-600: #2E7D46;  /* icon, rail, solid ground */
  --color-status-verified-700: #236336;
  --color-status-verified-800: #1B4D2A;  /* text on -50 / -100 tints */

  /* UNKNOWN — no check has run, or a check could not complete. */
  --color-status-unknown-50:  #F2F4F6;
  --color-status-unknown-100: #E3E7EB;
  --color-status-unknown-600: #5A6672;
  --color-status-unknown-700: #47515B;
  --color-status-unknown-800: #363E46;

  /* FAILED — a check ran and found a gap. */
  --color-status-failed-50:  #FDEDEC;
  --color-status-failed-100: #FADCD9;
  --color-status-failed-600: #C0392B;
  --color-status-failed-700: #9C2B20;
  --color-status-failed-800: #7A2119;

  /* RISK — a check ran, passed, but flagged something for judgement. */
  --color-status-risk-50:  #FDF4E3;
  --color-status-risk-100: #F9E6BF;
  --color-status-risk-600: #9A6A08;
  --color-status-risk-700: #7E5606;
  --color-status-risk-800: #6B4805;  /* text on -50 / -100 tints */

  /* ---------------------------------------------------------------------
   * TYPE
   * ------------------------------------------------------------------- */
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
               Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-serif: "Source Serif 4", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;

  --text-caption:    0.75rem;   /* 12px */
  --text-caption--line-height: 1.125rem;
  --text-meta:       0.8125rem; /* 13px */
  --text-meta--line-height: 1.25rem;
  --text-body:       0.875rem;  /* 14px */
  --text-body--line-height: 1.5rem;
  --text-document:   0.9375rem; /* 15px */
  --text-document--line-height: 1.65rem;
  --text-subhead:    1rem;      /* 16px */
  --text-subhead--line-height: 1.5rem;
  --text-title:      1.125rem;  /* 18px */
  --text-title--line-height: 1.625rem;
  --text-page:       1.375rem;  /* 22px */
  --text-page--line-height: 1.875rem;

  /* ---------------------------------------------------------------------
   * RADIUS — three steps, no more.
   * ------------------------------------------------------------------- */
  --radius-control:  0.25rem;  /* 4px — inputs, buttons, chips-with-corners */
  --radius-surface:  0.375rem; /* 6px — cards, panels, banners, table shells */
  --radius-pill:     9999px;   /* status chips only */

  /* ---------------------------------------------------------------------
   * ELEVATION — two steps. Documents do not float.
   * ------------------------------------------------------------------- */
  --shadow-raised: 0 1px 2px 0 rgb(28 27 24 / 0.05);
  --shadow-float:  0 4px 12px -2px rgb(28 27 24 / 0.10),
                   0 2px 4px -2px rgb(28 27 24 / 0.06);
}
```

Fonts are declared but **not yet loaded** — wiring `next/font` for Inter and Source Serif 4 is
part of the apply sprint, and the stacks fall back cleanly to system faces until then.

---

## 3. The status language

This is the core of V4. Three states must be unmistakable and must never be confusable.
A fourth (`risk`) exists for a check that passed but wants a human's judgement.

### 3.1 The four states

| State | Means | Colour | Glyph | Chip shape | Label pattern |
|---|---|---|---|---|---|
| **VERIFIED** | A check ran. It passed. | `verified` | `✓` check | Filled pill, solid border | `Verified · <what>` |
| **UNKNOWN** | No check ran, or a check could not complete. | `unknown` | `?` question | **Dashed** border, unfilled ground | `Not checked · <what>` |
| **FAILED** | A check ran. It found a gap. | `failed` | `✕` cross | Filled pill, **double**-weight border | `Failed · <what>` |
| **RISK** | A check ran and passed, but flagged a judgement call. | `risk` | `!` exclamation | Filled pill, solid border | `Review · <what>` |

**Three independent channels encode every state: colour, glyph, and border treatment.** Remove
colour entirely — greyscale print, deuteranopia, a photocopied exhibit — and `✓ solid` /
`? dashed` / `✕ double` / `! solid-amber-glyph` remain distinct by shape alone. The dashed
border on UNKNOWN is doing the heaviest lifting: it is the only state whose outline is
discontinuous, which is a pre-attentive signal that reads as *incomplete* without any training.

### 3.2 Hard rules

1. **UNKNOWN is never silent.** A component that cannot determine a status renders the UNKNOWN
   chip. It does not return `null`, and it does not fall back to a neutral pill. Directly
   repairs defects **B** and **C**.
2. **UNKNOWN is never `verified`-adjacent in hue.** `unknown-600` `#5A6672` is a *cool* slate;
   `verified-600` `#2E7D46` is green; `paper-*` is warm. All three are separable by hue as well
   as by lightness.
3. **A green claim requires a completed check.** No component may render VERIFIED from an empty
   result set. It must render it from an explicit "ran, and found nothing" signal. Directly
   repairs defect **A**.
4. **The four semantic families are reserved.** `ink-*` is for actions and navigation only;
   `paper-*` for surfaces and text. An action item that is merely *open* is not a status —
   it uses `paper`, not `ink` and not `risk`. Repairs defect **F**.
5. **One vocabulary.** `pass/warn/fail`, `warn/flag`, and `green/amber/red` collapse into
   `verified / risk / failed / unknown`. Repairs defect **H**.

### 3.3 Required data-layer change

`lib/assurance.ts:12` must become:

```ts
export type AssuranceStatus = "pass" | "warn" | "fail" | "unknown";
```

with `unknown` emitted whenever a check's inputs are absent or its evaluation throws. Without
this, the UI has no honest value to render and defect **D** persists no matter how good the CSS
is. Similarly `lib/conflicts.ts` must distinguish "scan completed, zero findings" from "scan
failed" in its return type — the current `ConflictFinding[]` cannot express the difference, and
that is what produces the false green banner at `governance-risk-panel.tsx:141`.

**These two are prerequisites, not follow-ups.** The visual system cannot fix a correctness
problem the data model cannot express.

---

## 4. Type, spacing, radii, borders, elevation

### 4.1 Type scale

Malaysian company names are long (`Perbadanan Kemajuan Negeri Selangor Sdn Bhd`) and must wrap
rather than truncate on any surface where the name is the identity of the record. The scale is
tight — seven steps, none of them large — because density is a feature in legal work.

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `text-page` | 22 / 30 | 600 | Page `h1`, once per route. Replaces the `text-lg` used on 12 pages (defect **K**). |
| `text-title` | 18 / 26 | 600 | Card/panel `h2` — company name on a meeting card, panel titles. |
| `text-subhead` | 16 / 24 | 600 | `h3`, form section headings. |
| `text-document` | 15 / 26.4 | 400 | **`.minutes-body` prose only.** 1.65 line-height for sustained reading of statutory text. |
| `text-body` | 14 / 24 | 400 | Default UI text, table cells, form values. |
| `text-meta` | 13 / 20 | 400 | Secondary detail lines ("3 meetings · 2 open actions"). Replaces the `text-xs` currently doing this job. |
| `text-caption` | 12 / 18 | 500 | Chips, table headers, timestamps, helper text. |

**Retired:** `text-[11px]` (13 occurrences, e.g. `governance-risk-panel.tsx:75`) — below the
12px floor. `text-xl` — unused as a real step.

**Section-heading rule (repairs the backwards scale):** panel titles use `text-subhead` in
`paper-700`, **not** `text-caption uppercase paper-500`. Eyebrow-caps
(`text-caption`, `500`, `tracking-[0.06em]`, `uppercase`, `paper-500`) are reserved for
*grouping labels above a list*, never for a heading that owns a card.

**Long-name rule.** Any element rendering `company_name` as the record's identity:

```
text-title font-semibold text-paper-900 text-balance break-words [hyphens:auto]
```

Never `truncate`. `app/page.tsx:105` and `companies/page.tsx:55` currently truncate the company
name — that is acceptable only in a dense table cell, and only with the full value in `title=`.

### 4.2 Spacing

Base unit **4px**. Permitted values: `1 2 3 4 5 6 8 10 12 16` (4–64px). Anything else is a bug.

| Context | Value |
|---|---|
| Chip padding | `px-2 py-0.5` |
| Button padding (default) | `px-3.5 py-2` |
| Form field padding | `px-3 py-2` |
| Card padding | `p-4` mobile → `p-5` at `sm:` |
| Panel padding | `p-5` mobile → `p-6` at `sm:` |
| Table cell padding | `px-4 py-3` |
| Gap, related items | `gap-2` |
| Gap, list rows | `gap-3` |
| Gap, sections within a page | `gap-8` |
| Page gutter | `px-4` → `sm:px-6` |

**Measure.** One rule, replacing the three ad-hoc widths of defect **L**:
- `max-w-5xl` (1024px) — index/list routes. Set **once**, in `app/layout.tsx:30`. Pages must
  not re-declare it.
- `max-w-3xl` (768px) — record detail and reading routes (draft, company, person, review).
- `max-w-xl` (576px) — single-column forms (new meeting, login, settings, invite).

### 4.3 Radii

Three steps, replacing today's six.

| Token | Value | Applies to |
|---|---|---|
| `rounded-control` | 4px | Buttons, inputs, selects, textareas, icon buttons |
| `rounded-surface` | 6px | Cards, panels, banners, table shells, check rows |
| `rounded-pill` | full | **Status chips only** — the pill shape becomes a status signal |

Retired: `rounded-sm`, `rounded-lg`, `rounded-xl`, bare `rounded`. Pill shape is no longer
available for non-status decoration; the "Minutes v2" chip at `app/page.tsx:123` becomes a
`rounded-control` button, because it is navigation, not status.

### 4.4 Borders

Borders, not shadows, carry structure in this system.

| Role | Spec |
|---|---|
| Card / panel | `1px solid var(--color-paper-300)` |
| Divider / hairline | `1px solid var(--color-paper-200)` |
| **Form field** | `1px solid var(--color-paper-450)` — 3.56:1, meets SC 1.4.11. Replaces `border-neutral-300` at 1.51:1 (defect **J**). |
| Form field, focused | `1px solid var(--color-ink-600)` + focus ring |
| Empty state | `1px dashed var(--color-paper-300)` |
| Status left-rail | `3px solid var(--color-status-{state}-600)` — **must be the `-600` step.** The `-300` tints measure ~2.0:1 and fail the 3:1 required of a meaning-bearing boundary. |
| UNKNOWN chip | `1px dashed var(--color-status-unknown-600)` |
| FAILED chip | `2px solid var(--color-status-failed-600)` |

### 4.5 Elevation

Two steps. A statutory record should sit on the page, not hover above it.

- `shadow-raised` — cards, panels, table shells. The default.
- `shadow-float` — only for genuinely overlaid surfaces: the mobile nav drawer
  (`site-header.tsx:233`), dropdowns, modals.

Retired: `shadow-md` on hover (`app/page.tsx:99`, `companies/page.tsx:52`, `people/page.tsx:66`).
Hover affordance on a card becomes a border-colour change to `paper-450` plus a background
change to `paper-50` — cheaper to paint, and it does not imply the record moved.

---

## 5. Component specs

Notation: `→` marks a change from what the code does today.

### 5.1 Status chip

The atomic unit of the status language. Replaces `Badge`, `StatusBadge`, `OutcomePill`,
`ItemStatusPill`, `ConfidenceTag` and `SeverityBadge` — six components, one vocabulary.

```
Base:      inline-flex items-center gap-1.5 rounded-pill
           px-2 py-0.5 text-caption font-medium whitespace-nowrap

VERIFIED:  bg-status-verified-50  text-status-verified-800
           border border-status-verified-600         glyph ✓
UNKNOWN:   bg-transparent         text-status-unknown-800
           border border-dashed border-status-unknown-600   glyph ?
FAILED:    bg-status-failed-50    text-status-failed-800
           border-2 border-status-failed-600         glyph ✕
RISK:      bg-status-risk-50      text-status-risk-800
           border border-status-risk-600             glyph !
```

- The glyph is an inline SVG at `h-3 w-3`, `aria-hidden="true"`, `currentColor`. **Not a text
  character** — `assurance-panel.tsx:45-49` uses the literals `"✕" "!" "✓"`, whose rendering
  varies by platform font and which some screen readers announce.
- The label is **always** present. There is no icon-only status chip.
- The accessible name comes from the visible text; the chip carries `role="status"` only when
  it updates live.
- Chip text uses the `-800` step on the `-50` tint (7.7–9.0:1). Never `-600` on `-50` —
  `risk-600` on `risk-50` is 4.33:1 and fails AA text.

**→ Changes:** `StatusBadge` today maps `draft → neutral, reviewed → amber, final → green`
(`ui.tsx:43-47`). Under V4, workflow status is **not** a correctness status and must not use
the semantic families. It becomes a `paper`-toned outline chip with its own glyph set
(`Draft ○` / `Reviewed ◐` / `Final ●`), so a grey "Draft" pill can never be mistaken for an
UNKNOWN assurance result. Repairs defect **G**.

### 5.2 Assurance check row

The single most important component in the product.

```
Row:   flex items-start gap-3 rounded-surface bg-white
       border border-paper-300 border-l-[3px] px-3 py-2.5
       left-rail: border-l-status-{state}-600

Icon:  h-5 w-5 flex-none rounded-full inline-flex items-center justify-center
       VERIFIED  bg-status-verified-100  text-status-verified-800   (7.70:1)
       UNKNOWN   bg-transparent + 1px dashed border-status-unknown-600
                 text-status-unknown-800                            (9.85:1 on -50)
       FAILED    bg-status-failed-100    text-status-failed-800     (7.92:1)
       RISK      bg-status-risk-100      text-status-risk-800       (6.69:1)

Label: text-body font-medium text-paper-900
State: text-caption font-semibold uppercase tracking-[0.06em] text-status-{state}-800
       — "VERIFIED" / "NOT CHECKED" / "FAILED" / "REVIEW"
Detail:text-meta text-paper-600 mt-0.5
```

Every row states its state **in words**, adjacent to the label. A reader scanning a printed
export gets the answer from the text alone.

**Ordering:** `failed → unknown → risk → verified`. **UNKNOWN sorts above RISK**, because an
unrun check is a larger liability than a flagged-but-passing one.

**→ Changes from `assurance-panel.tsx`:**
- `STATUS_BORDER_CLASS` (`:57-61`) gives `pass` no rail at all. V4 gives it a
  `verified-600` rail — a passing check should look *checked*, not unremarkable.
- The collapsed `<details>` for passing checks (`:103-116`) stays, but its summary changes from
  `"N passing checks"` to `"N of M checks verified"`, so the denominator is always on screen.
- **New:** when any check is UNKNOWN, the panel header renders an UNKNOWN banner (§5.7) and the
  score dial is **suppressed entirely** and replaced with the text `— / 100 · incomplete`. A
  numeric score computed over checks that did not all run is a false precision, and rendering
  it is the mechanism by which defect **C** misleads.

**→ Not-run state (`assurance-panel.tsx:186-187`).** Replace the muted sentence with a full
UNKNOWN banner: dashed `unknown-600` border, `?` glyph, heading **"These minutes have not been
checked"**, body "No assurance report has been generated for this draft. Nothing here has been
verified against statutory requirements.", and a primary `Run assurance checks` button. This is
the single highest-value change in the document.

### 5.3 Card

```
rounded-surface border border-paper-300 bg-white shadow-raised p-4 sm:p-5
hover (linked):  border-paper-450 bg-paper-50   [no shadow change]
focus-within:    ring-2 ring-ink-500 ring-offset-2
```

Title `text-title text-paper-900 text-balance break-words`. Meta line `text-meta text-paper-500`
(4.77:1). Status chips sit on the line *below* the title on mobile, inline at `sm:` and up — a
long company name must never compress the chip.

### 5.4 Table

For the obligations register (`app/obligations/page.tsx:317-372`) and comparable dense views.

```
Shell:  rounded-surface border border-paper-300 bg-white shadow-raised overflow-hidden
Scroll: overflow-x-auto  (retain min-w-[760px] on the table)
thead:  bg-paper-100 border-b border-paper-300
th:     px-4 py-3 text-left text-caption font-semibold uppercase
        tracking-[0.06em] text-paper-600  (6.90:1)
tbody:  divide-y divide-paper-200
td:     px-4 py-3 text-body text-paper-700  (9.77:1)
row hover: bg-paper-50
```

No zebra striping — the `divide-y` hairline is enough, and stripes fight with status row-tints.
A row whose record is FAILED gets `border-l-[3px] border-l-status-failed-600` on its first
cell, not a tinted background: tinted rows stop being scannable at ten-plus rows.

Every table with a status column renders the §5.1 chip. A bare word in a cell is not a status.

### 5.5 Button hierarchy

Four levels. Nothing else.

| Level | Spec | Use |
|---|---|---|
| **Primary** | `bg-ink-600 text-white hover:bg-ink-700 active:bg-ink-800` · `rounded-control px-3.5 py-2 text-body font-medium` · white on `ink-600` = **9.73:1** | One per view. The action that advances the record. |
| **Secondary** | `bg-white text-paper-700 border border-paper-450 hover:bg-paper-50 hover:border-paper-500` · 9.77:1 | Everything ordinary. |
| **Quiet** | `text-paper-600 hover:bg-paper-100 hover:text-paper-900` · no border · 6.90:1 | Cancel, dismiss, tertiary nav. |
| **Destructive** | `bg-status-failed-600 text-white hover:bg-status-failed-700` · white on `failed-600` = **5.44:1** | Delete, revoke, discard. Always paired with a confirm step. |

**Acknowledge-risk action** (`assurance-panel.tsx:219`, `:251`) is a **Secondary** button with a
`risk-600` left border and a `!` glyph — *not* a solid amber button. Accepting a known statutory
gap must not be styled as the happy path. Note that if a solid risk button is ever needed,
white on `risk-600` is 4.73:1 (passes) and white on `risk-700` is 6.52:1 (preferred).

All buttons: `min-h-11` on touch (`tap-target` already does this), `disabled:opacity-60
disabled:cursor-not-allowed`.

**Focus — one implementation, replacing both of defect E:**

```css
@utility focus-ring {
  @apply focus-visible:outline-none
         focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2
         focus-visible:ring-offset-paper-50;
}
```

Delete `FOCUS_RING` from `components/ui.tsx:11-12` and the old `.focus-ring` from
`globals.css:70-72`. Note this keeps `outline-none` scoped to `focus-visible` — the
unconditional `outline-none` in the current CSS utility breaks Windows High Contrast mode.

### 5.6 Form field

```
Label:   block text-body font-medium text-paper-800 mb-1.5
Required: <span class="text-status-failed-600" aria-hidden="true">*</span>
          + "(required)" in the label's accessible text
Input:   block w-full rounded-control border border-paper-450 bg-white
         px-3 py-2 text-base sm:text-body text-paper-900
         placeholder:text-paper-500
Focus:   border-ink-600 ring-1 ring-ink-500 outline-none
Invalid: border-status-failed-600 ring-1 ring-status-failed-600
         + aria-invalid="true" + aria-describedby → error node
Error:   mt-1.5 text-meta text-status-failed-700  (7.55:1)  prefixed with the ✕ glyph
Help:    mt-1.5 text-meta text-paper-500  (4.77:1)
```

`text-base` at mobile is deliberate — it prevents iOS Safari's focus zoom. The app already does
this (`companies/page.tsx:100`); the system codifies it.

**→ Change:** `border-neutral-300` → `border-paper-450` everywhere. Repairs defect **J**.
**→ Change:** placeholders move from the current implicit grey to `paper-500` (4.77:1);
`paper-400` is decorative-only and must never hold text.

### 5.7 Banner / alert

```
Shell:  rounded-surface border-l-[3px] px-4 py-3
        VERIFIED  bg-status-verified-50 border border-status-verified-600/30
                  border-l-status-verified-600
        UNKNOWN   bg-white border border-dashed border-status-unknown-600
                  border-l-[3px] border-l-status-unknown-600  ← dashed on all sides
        FAILED    bg-status-failed-50 border border-status-failed-600/30
                  border-l-status-failed-600
        RISK      bg-status-risk-50 border border-status-risk-600/30
                  border-l-status-risk-600

Icon:   h-5 w-5 flex-none text-status-{state}-700
Title:  text-body font-semibold text-status-{state}-800
Body:   text-meta text-paper-700  (9.77:1 — body copy never uses the tinted -800 on tint)
role:   "status" for verified/unknown/risk · "alert" for failed
```

**→ Change to `confirmation-status.tsx`.** All four of its bare divs (`:44`, `:52`, `:66-71`)
become this component. Critically, `:66-71` currently separates "memory risk" from "unconfirmed"
by colour alone (defect **I**). Under V4 they become distinct *states*: unconfirmed → RISK
(`!` glyph, title "Awaiting confirmation"); past 14 days → FAILED (`✕` glyph, title
"Unconfirmed — memory risk"). Different glyph, different border weight, different title word.
Colour becomes the third signal, not the only one.

**→ Change to `governance-risk-panel.tsx:141-152`.** The all-clear banner may only render
VERIFIED when the scan reports that it *completed*. If `detectConflicts` swallowed an error
(`lib/conflicts.ts:14-16`), the panel renders the UNKNOWN banner: **"Conflict scan did not
complete — no connections have been checked."** Repairs defect **A**.

### 5.8 Empty state

Two variants, because they are not the same thing and the current single `EmptyState`
(`ui.tsx:118-142`) conflates them.

**Nothing here yet** — a benign, expected void:
```
rounded-surface border border-dashed border-paper-300 bg-white p-8 text-center
h: text-subhead text-paper-900  ·  p: mt-2 text-body text-paper-500  ·  action: mt-5 Primary
```

**Nothing checked** — an absence that is itself a finding. This is the UNKNOWN banner (§5.7)
at panel scale, with the `?` glyph and a "Run checks" primary action. Any list whose emptiness
could be read as an assurance uses this variant, **not** the benign one.

Deciding rule: if a user could plausibly read the empty state as "everything is fine here",
it must be the UNKNOWN variant.

### 5.9 Exported document status block

The exports are the reason the whole system exists. `build-docx.ts:138-151` and
`build-pdf.ts:324-332` already stamp a status banner; V4 extends it.

**Every** export carries a status block immediately above the title, in **all four** states —
including `final`, which currently prints nothing at all:

| Draft status | Block text | Treatment |
|---|---|---|
| `draft` | `DRAFT — NOT REVIEWED OR APPROVED` | Bold, boxed, **1.5pt double rule** above and below |
| `reviewed` | `DRAFT — REVIEWED, NOT YET FINAL` | Bold, boxed, 1pt single rule above and below |
| `final` | `FINAL — APPROVED [date]` | Bold, no box, 0.5pt rule below only |

Colour is `#7A2119` (`failed-800`) for `draft` and `#6B4805` (`risk-800`) for `reviewed`, both
of which hold up in greyscale. **→ Change** from the current `B45309`
(`build-docx.ts:145`), which is a mid-amber that photocopies to near-invisible.

**Rules unique to the export surface:**
1. **Rule weight, not colour, is the primary signal.** Assume every export is printed
   monochrome. The double rule on `draft` is the load-bearing difference.
2. **The word `DRAFT` appears on every page**, not only page one — a running header on the PDF
   and a `docx` header on non-final documents. A stapled bundle gets separated.
3. **New: the assurance summary line.** Immediately below the status block, non-final exports
   carry one line: `Assurance: 12 of 14 checks verified · 1 failed · 1 not checked`. If no
   report exists: `Assurance: NOT RUN — no statutory completeness checks have been performed
   on this document.` This is the export-side fix for defects **A**–**D**, and without it the
   proof stays trapped in the app.
4. **Filenames carry status.** `buildExportFilename` (`lib/export/filename.ts`) should prefix
   non-final exports with `DRAFT-`. The filename is often the only thing visible in an email
   attachment list.

---

## 6. Light and dark mode

**The app does not support dark mode, and V4 does not add one.**

Verified: zero `dark:` variants across `app/`, `components/`, `lib/` and `globals.css`; no
`prefers-color-scheme` media query anywhere; no `class`/`data-theme` strategy on
`app/layout.tsx:26`; `<body>` hard-codes `bg-neutral-50 text-neutral-900` at `layout.tsx:27`.

This is the right call for now and should be a deliberate decision rather than an oversight.
The product's mental model is paper. A dark surface is a poor rehearsal for a document that
will be printed, and every status colour would need a second full contrast verification pass
against dark grounds — the tinted `-50` chip backgrounds in particular do not invert, they have
to be redesigned as `-800`-on-transparent with `-300` text, which is a different system.

If dark mode is ever prioritised, it is a separate spec with its own measured contrast table.
Do not derive it by inverting these tokens.

---

## 7. Accessibility

### 7.1 Measured contrast

Every ratio below was computed from the sRGB hex values in §2.2 using the WCAG 2.x relative
luminance formula. These are calculated, not asserted. Thresholds: **4.5:1** for normal text
(SC 1.4.3 AA), **3:1** for large text ≥18.66px bold / ≥24px regular and for UI component
boundaries and graphical objects (SC 1.4.11).

| Foreground | Background | Ratio | AA text (4.5) | 3:1 (UI/large) |
|---|---|---|---|---|
| `paper-900` #1C1B18 | `paper-50` #FAFAF8 | **16.48:1** | PASS | PASS |
| `paper-900` #1C1B18 | `white` #FFFFFF | **17.22:1** | PASS | PASS |
| `paper-800` #2E2D29 | `white` #FFFFFF | **13.78:1** | PASS | PASS |
| `paper-700` #45443E | `white` #FFFFFF | **9.77:1** | PASS | PASS |
| `paper-700` #45443E | `paper-50` #FAFAF8 | **9.35:1** | PASS | PASS |
| `paper-600` #5C5A53 | `white` #FFFFFF | **6.90:1** | PASS | PASS |
| `paper-600` #5C5A53 | `paper-50` #FAFAF8 | **6.60:1** | PASS | PASS |
| `paper-500` #74736A | `white` #FFFFFF | **4.77:1** | PASS | PASS |
| `paper-500` #74736A | `paper-50` #FAFAF8 | **4.56:1** | PASS | PASS |
| `paper-450` #8A887E | `white` #FFFFFF | **3.56:1** | fail | PASS |
| `paper-450` #8A887E | `paper-50` #FAFAF8 | **3.40:1** | fail | PASS |
| `paper-400` #9A988E | `white` #FFFFFF | **2.89:1** | fail | fail |
| `paper-300` #D3D2CB | `white` #FFFFFF | **1.52:1** | fail | fail |
| `paper-200` #E6E5E0 | `white` #FFFFFF | **1.26:1** | fail | fail |
| `white` #FFFFFF | `ink-600` #2C4568 | **9.73:1** | PASS | PASS |
| `white` #FFFFFF | `ink-700` #22364F | **12.29:1** | PASS | PASS |
| `ink-600` #2C4568 | `white` #FFFFFF | **9.73:1** | PASS | PASS |
| `ink-600` #2C4568 | `paper-50` #FAFAF8 | **9.31:1** | PASS | PASS |
| `ink-600` #2C4568 | `ink-50` #EFF3F8 | **8.73:1** | PASS | PASS |
| `ink-700` #22364F | `ink-50` #EFF3F8 | **11.03:1** | PASS | PASS |
| `ink-500` #3D5A80 | `white` #FFFFFF | **7.06:1** | PASS | PASS |
| `verified-800` #1B4D2A | `verified-50` #ECF5EE | **8.81:1** | PASS | PASS |
| `verified-800` #1B4D2A | `verified-100` #D5E9DA | **7.70:1** | PASS | PASS |
| `verified-700` #236336 | `verified-50` #ECF5EE | **6.48:1** | PASS | PASS |
| `verified-700` #236336 | `white` #FFFFFF | **7.22:1** | PASS | PASS |
| `verified-600` #2E7D46 | `white` #FFFFFF | **5.07:1** | PASS | PASS |
| `verified-600` #2E7D46 | `paper-50` #FAFAF8 | **4.86:1** | PASS | PASS |
| `verified-600` #2E7D46 | `verified-50` #ECF5EE | **4.56:1** | PASS | PASS |
| `white` #FFFFFF | `verified-600` #2E7D46 | **5.07:1** | PASS | PASS |
| `unknown-800` #363E46 | `unknown-50` #F2F4F6 | **9.85:1** | PASS | PASS |
| `unknown-800` #363E46 | `unknown-100` #E3E7EB | **8.73:1** | PASS | PASS |
| `unknown-700` #47515B | `unknown-50` #F2F4F6 | **7.34:1** | PASS | PASS |
| `unknown-700` #47515B | `white` #FFFFFF | **8.09:1** | PASS | PASS |
| `unknown-600` #5A6672 | `white` #FFFFFF | **5.87:1** | PASS | PASS |
| `unknown-600` #5A6672 | `paper-50` #FAFAF8 | **5.62:1** | PASS | PASS |
| `unknown-600` #5A6672 | `unknown-50` #F2F4F6 | **5.32:1** | PASS | PASS |
| `white` #FFFFFF | `unknown-600` #5A6672 | **5.87:1** | PASS | PASS |
| `failed-800` #7A2119 | `failed-50` #FDEDEC | **8.99:1** | PASS | PASS |
| `failed-800` #7A2119 | `failed-100` #FADCD9 | **7.92:1** | PASS | PASS |
| `failed-700` #9C2B20 | `failed-50` #FDEDEC | **6.66:1** | PASS | PASS |
| `failed-700` #9C2B20 | `white` #FFFFFF | **7.55:1** | PASS | PASS |
| `failed-600` #C0392B | `white` #FFFFFF | **5.44:1** | PASS | PASS |
| `failed-600` #C0392B | `paper-50` #FAFAF8 | **5.20:1** | PASS | PASS |
| `failed-600` #C0392B | `failed-50` #FDEDEC | **4.79:1** | PASS | PASS |
| `white` #FFFFFF | `failed-600` #C0392B | **5.44:1** | PASS | PASS |
| `risk-800` #6B4805 | `risk-50` #FDF4E3 | **7.53:1** | PASS | PASS |
| `risk-800` #6B4805 | `risk-100` #F9E6BF | **6.69:1** | PASS | PASS |
| `risk-700` #7E5606 | `risk-50` #FDF4E3 | **5.97:1** | PASS | PASS |
| `risk-700` #7E5606 | `white` #FFFFFF | **6.52:1** | PASS | PASS |
| `risk-600` #9A6A08 | `white` #FFFFFF | **4.73:1** | PASS | PASS |
| `risk-600` #9A6A08 | `paper-50` #FAFAF8 | **4.53:1** | PASS | PASS |
| `risk-600` #9A6A08 | `risk-50` #FDF4E3 | **4.33:1** | **fail** | PASS |
| `white` #FFFFFF | `risk-600` #9A6A08 | **4.73:1** | PASS | PASS |
| `white` #FFFFFF | `risk-700` #7E5606 | **6.52:1** | PASS | PASS |

### 7.2 Constraints falling out of the measurements

These are binding, not advisory.

1. **`paper-400` #9A988E is decorative only.** 2.89:1 — it fails both thresholds. It may not
   hold text and may not form the boundary of a control. It exists for pure ornament (a
   separator glyph, a disabled-state icon accompanied by text) and nothing else.
2. **`paper-300` and `paper-200` are decorative borders only.** 1.52:1 and 1.26:1. They are
   fine for card edges and dividers, which SC 1.4.11 does not cover, but they may never be the
   *only* boundary of an input, button or status indicator.
3. **Form fields must use `paper-450`** (3.56:1). This is the minimum that clears SC 1.4.11.
4. **Status rails must use the `-600` step** (4.53–5.87:1 on white). The `-300` tints measure
   ~1.8–2.1:1 and are not permissible as a meaning-bearing boundary.
5. **`risk-600` on `risk-50` is 4.33:1 and FAILS AA text.** This is the one failure in the set
   and it is why chip text is specified as the `-800` step throughout §5.1. `risk-600` remains
   valid as a border, an icon on white, and as a solid ground under white text (4.73:1).
6. **`paper-500` #74736A is the muted-text floor** at 4.77:1 on white / 4.56:1 on `paper-50`.
   Nothing lighter carries text. This is a real change: today's `text-neutral-500` is `#737373`
   at 4.74:1 on white but **4.53:1 on the `neutral-50` page ground** — marginal, and it is used
   81 times, mostly on that exact ground.

### 7.3 Non-colour requirements

- **Every status is triple-encoded** — colour + glyph + border treatment — per §3.1. Test by
  screenshotting any status surface, desaturating it, and confirming all four states remain
  distinguishable.
- **Status glyphs are SVG with `aria-hidden="true"`.** The state word in the row/chip carries
  the meaning for assistive tech. Never rely on a glyph alone.
- **Focus is always visible**, `ring-2` `ink-500` with `ring-offset-2`. Never `outline: none`
  outside a `focus-visible` selector.
- **Touch targets ≥ 44×44px** — `tap-target` already implements this (`globals.css:63-66`);
  keep it.
- **Live regions:** the save indicator, assurance re-run result and confirmation state need
  `aria-live="polite"`. A FAILED assurance result appearing after a re-run needs
  `role="alert"`.
- **`prefers-reduced-motion`:** the mobile drawer transform (`site-header.tsx:233,239`) and all
  `transition-*` utilities must be suppressed under the reduced-motion query.
- **Print stylesheet:** required, and currently absent. At minimum — force white ground, remove
  shadows, keep all borders and rails at ≥1pt, expand every collapsed `<details>`, and force
  the status block visible.

---

## 8. Principles

Eight rules. If a decision is not covered here, it should be resolvable by asking which of
these it serves.

1. **Absence of a check is a finding, not a blank.** If nothing was verified, say so loudly.
   A component that cannot determine a status renders UNKNOWN — it never renders nothing, and
   it never falls through to neutral. This is the rule the rest of the system exists to serve.

2. **Never assert what you have not proven.** A green claim requires a completed check that
   returned clean. An empty result array is not proof of a clean record; it is equally
   consistent with a scan that never ran. If the data layer cannot tell the difference, fix the
   data layer before styling the component.

3. **Colour is the third signal, never the first.** Every status carries a glyph and a border
   treatment before it carries a hue. The test is mechanical: desaturate the screen. If two
   states become the same, the design is not finished.

4. **The document outranks the interface.** This app produces evidence. When a screen
   convention and a print convention conflict, print wins — it is the artifact that survives.
   Anything a user could reasonably read as approved must be unmistakably marked when it is not.

5. **Brand colour has no opinion about correctness.** `ink` means *you can act here*. `paper`
   means *this is the record*. The four semantic families mean *this is a claim about
   correctness*. Never borrow across those three.

6. **Density is a feature.** Cosecs work through many meetings. Prefer a tighter scale, a
   smaller radius and a quieter shadow over generous whitespace. Legal readers expect
   information density and read it as competence.

7. **Long names wrap; they do not truncate.** Malaysian company names are long and legally
   exact. Wrap, balance, hyphenate — but never hide a character of an entity's registered name
   on a surface where that name identifies the record.

8. **One vocabulary, one token, one place.** If you are about to write a raw hex, a one-off
   `rounded-xl`, or a fifth kind of amber, the system is missing a token — add it to `@theme`
   and use it everywhere. Four parallel status vocabularies (defect **H**) is what happens when
   this rule is not enforced.

---

## 9. Sequencing for the apply sprint

Ordered by risk retired per unit of work.

| # | Change | Repairs |
|---|---|---|
| 1 | Add `unknown` to `AssuranceStatus`; make `detectConflicts` distinguish completed-clean from failed | **A, D** — prerequisite for everything else |
| 2 | Paste the `@theme` block; add `next/font` for Inter + Source Serif 4 | Foundation |
| 3 | Build the §5.1 status chip; delete the six components it replaces | **F, G, H** |
| 4 | Assurance panel: not-run banner, suppressed score, verified rail, new ordering | **B, C** |
| 5 | Governance panel: gate the green all-clear behind scan-completed | **A** |
| 6 | `confirmation-status.tsx` → §5.7 banners with distinct glyphs per state | **I** |
| 7 | Unify the focus ring; `border-paper-450` on every form field | **E, J** |
| 8 | Type scale + measure rules across all routes | **K, L** |
| 9 | Export status block: four states, rule weights, assurance line, `DRAFT-` filename prefix | §5.9 |
| 10 | Print stylesheet; `prefers-reduced-motion` | §7.3 |

Steps 1, 4 and 5 are the correctness work. If the sprint is cut short, ship those.
