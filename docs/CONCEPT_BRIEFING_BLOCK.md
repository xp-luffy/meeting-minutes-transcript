# Concept — "Worth knowing before you sign"

The proposed new surface for the **connect** pillar. Status: concept, not built.

## The problem it solves

The app holds a real graph (people, companies, meetings, resolutions,
obligations, documents) and already renders an ego-graph at
`app/people/ego-graph.tsx`. But a node-link diagram asks the reader to *derive*
the insight, and nobody does that under time pressure. Humans dismiss abstract
visualisations; they act on sentences containing a name, a document and a date.

So: keep the graph as the data structure, demote it as a surface, and render
traversals as plain findings at the moment of decision.

## Design rules this concept encodes

1. **Sentences, not shapes.** Every finding names a person, a document and a
   date, so it is instantly checkable against what the cosec already knows.
2. **Provenance on the same line.** Grey sub-line states where the claim came
   from. This converts "the app says" into "the record says".
3. **Silence is the default.** The block should be empty most sessions. Rarity
   is what earns attention; software that shouts every session gets ignored.
4. **The gap is a finding.** A missing register of directors is stated with the
   same weight as a positive finding, never hidden or blank.

## The mock (as presented)

Card, on the draft page, above the minutes body.

Header: **Worth knowing before you sign** · right-aligned count "4 things"
Sub-header: `Nusantara Ventures Sdn Bhd · Board meeting · 20 Jul 2026`

Four rows, each = icon + sentence + grey provenance line:

| Icon | Finding | Provenance |
|---|---|---|
| alert-triangle (danger) | Datuk Roslan chairs this meeting and is a director of **Meridian Capital** — the counterparty in Resolution 3. No interest declaration is recorded. | From directorship recorded 14 Mar 2024 · Meridian board minutes |
| history (warning) | Quorum was stated in your last 4 Nusantara meetings. It isn't stated here. | Constitution requires 2 directors · in force 12 Jun 2026 |
| link (neutral) | Resolution 3 amends **BD-2024-07**, which is still in force. | Passed 18 Sep 2024 · never superseded |
| help-circle (neutral) | Ms Tan's two overdue items from the last meeting aren't mentioned here. | Due 30 Apr 2026 and 15 May 2026 · both still open |

Footer: secondary button "See the connections ↗" (opens the ego graph) +
muted text "Register of directors not on file — directorships can't be
confirmed".

## Where each finding comes from (all real capabilities)

- Row 1 — `lib/conflicts.ts` directorship traversal + interest-declaration check
- Row 2 — deviation from this company's own history + `getQuorumThreshold`
  provenance from `company_documents` (the threshold wire is NOT yet built)
- Row 3 — resolution supersession (NOT yet built)
- Row 4 — open action items carried from prior meetings (data exists)

## Open questions for design

- How does this block look when there is exactly ONE finding? When there are
  twelve? It must not become a wall.
- How does severity read without relying on colour (print, colour-blindness)?
  The app already has a four-state language: verified/unknown/failed/risk with
  glyph + border weight — see `components/status.tsx`.
- Does the block belong only on the draft page, or also at company level?
- What does it look like the first time a company is used, when there is no
  history to deviate from?
