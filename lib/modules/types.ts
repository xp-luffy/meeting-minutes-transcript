/**
 * The module system — types.
 *
 * A "module" is one vertical: company secretarial today, professional services
 * next. The whole point is that adding a third vertical is a config file, not a
 * fork. This file is FRAMEWORK-FREE on purpose — no `next/*`, no `@supabase/*` —
 * the same rule lib/assurance.ts and lib/minutes-engine.ts already follow, so a
 * module definition is a plain object unit-testable with `bun run`.
 *
 * What a module owns is split across five concerns (vocabulary, meeting types,
 * completeness checks, output template, extraction). This first foundation
 * defines the two that are consumed immediately — vocabulary and meeting types —
 * and the module identity that ties them together. Checks, templates and the
 * extraction pipeline are wired in a later, separately-gated step, because
 * extracting them from lib/assurance.ts must be proven byte-identical and that
 * proof deserves its own pass rather than being done blind.
 */

export type ModuleId = "cosec" | "consulting";

/**
 * Vocabulary — the words a module uses for the same underlying record.
 *
 * RULE 1: a slot may be ABSENT (null), and absent is not empty string.
 * `convenerNoun` is null for professional services; the UI omits the field
 * rather than rendering a blank label.
 *
 * RULE 2: never interpolate a noun into a sentence that only parses in one
 * module. Whole copy strings that differ by module live beside the module, keyed
 * by id — they are not templated from these nouns. These slots are for labels,
 * headings and chips, not prose.
 */
export interface Vocabulary {
  /** "Company Secretarial" | "Professional Services" */
  moduleLabel: string;
  /** the record itself: "minutes" | "decision memo" */
  recordNoun: { singular: string; plural: string };
  /** a formal decision: "resolution" | "decision" */
  decisionNoun: { singular: string; plural: string };
  /** a follow-up: "action item" | "commitment" */
  commitmentNoun: { singular: string; plural: string };
  /** who a commitment is on: "responsible officer" | "owner" */
  ownerNoun: string;
  /** the other side: "company" | "client" */
  counterpartyNoun: string;
  /** who runs the meeting; NULL when the concept does not apply */
  convenerNoun: string | null;
  /** who confirms the record externally: "director" | "client contact" */
  confirmerNoun: string;
  /** the governing document a meeting is checked against */
  governingDocNoun: string;
  /**
   * The attestation wording on the share page. NOT cosmetic: a cosec attests
   * "I confirm these minutes are accurate" (a statutory act), a consulting
   * client acknowledges "I acknowledge this is an accurate summary of what we
   * agreed" (not a statutory act). This is why the two have different share
   * gates — see shareKind.
   */
  attestationText: string;
}

/**
 * A meeting type within a module. IDENTITY plus behaviour flags. The id is
 * stable and stored in the DB (meetings.meeting_type_id); everything else is
 * presentation and rules that live in code where they get typechecked.
 */
export interface MeetingTypeDefinition {
  /** stable, stored in DB: 'board' | 'agm' | 'discovery' | 'qbr' */
  id: string;
  /** human label: "Board Meeting" | "Discovery Call" */
  label: string;
  /** resolution/decision numbering prefix: "BD" | "DSC" */
  numberPrefix: string;
  /** heading for the narrative section */
  narrativeHeading: string;
  /** null when this type has no quorum concept at all (not "quorum of 0") */
  quorumSubjectPlural: string | null;
  /** AGM/EGM use the formal all-caps heading */
  useFormalCapsHeading: boolean;
}

/**
 * How a customer's record maps to its share gate.
 *  - "attestation"    keeps the reviewed/final gate: a director attests to text.
 *  - "acknowledgement" allowed on a draft: a client acknowledges a summary.
 * This is the resolution to createReviewShare blocking the one-click recap — a
 * consulting acknowledgement is not the statutory attestation the gate protects.
 */
export type ShareKind = "attestation" | "acknowledgement";

export interface ModuleDefinition {
  id: ModuleId;
  vocabulary: Vocabulary;
  meetingTypes: MeetingTypeDefinition[];
  defaultMeetingTypeId: string;
  /** company_documents.doc_type that supplies the governing rule */
  governingDocType: string; // 'constitution' | 'sow'
  shareKind: ShareKind;
}
