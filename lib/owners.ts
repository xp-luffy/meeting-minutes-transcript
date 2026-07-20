/**
 * Owner = real person: the shared vocabulary for action-item ownership.
 *
 * This is a PLAIN module on purpose. Every constant here is read by BOTH a
 * server action and a "use client" component, and a value exported from a
 * "use client" file is swapped by Next for a client-reference proxy on the
 * server — so `filter === OWNER_FILTER_NEEDS` silently evaluates false and
 * the feature fails with no error anywhere (docs/PILOT_PLAYBOOK.md pattern C,
 * ledger #14 — this broke every new-company creation once). Nothing in this
 * file may ever gain a "use client" directive.
 */

/** The three — never two — states an action item's owner can be in. */
export type OwnerState = "linked" | "text_only" | "unassigned";

/**
 * Classifies an action item's owner. Takes the two fields explicitly rather
 * than the row, so a caller that forgot to SELECT `owner_entity_id` gets a
 * type error instead of a silent "not linked" on an item that IS linked.
 */
export function ownerState(
  ownerEntityId: string | null | undefined,
  ownerName: string | null | undefined,
): OwnerState {
  if (ownerEntityId) return "linked";
  if (ownerName && ownerName.trim().length > 0) return "text_only";
  return "unassigned";
}

/** Filter values for the owner column on /action-items. */
export const OWNER_FILTERS = ["all", "needs", "text_only", "unassigned", "linked"] as const;
export type OwnerFilter = (typeof OWNER_FILTERS)[number];

export const OWNER_FILTER_LABELS: Record<OwnerFilter, string> = {
  all: "All owners",
  // Deliberately BOTH unassigned and text-only: a free-text owner is not a
  // person you can chase, so it is just as unactionable as no owner at all.
  needs: "Needs an owner",
  text_only: "Text only, not linked",
  unassigned: "Unassigned",
  linked: "Linked to a person",
};

export function parseOwnerFilter(value: string | string[] | undefined): OwnerFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return OWNER_FILTERS.includes(v as OwnerFilter) ? (v as OwnerFilter) : "all";
}

/** A person the owner picker can offer, with the evidence needed to pick correctly. */
export interface OwnerCandidate {
  id: string;
  canonical_name: string;
  aliases: string[];
  at_company: boolean;
  company_relation: string | null;
  meeting_count: number;
  /**
   * Exact, case-insensitive match on the canonical name or a recorded alias.
   * This is a SUGGESTION ONLY — it pre-highlights an option and nothing else.
   * Nothing in this app ever links an owner without a human clicking Save.
   */
  exact_match: boolean;
}

/** One-line disambiguating evidence for a candidate, e.g. "Director · 7 meetings". */
export function candidateEvidence(c: OwnerCandidate): string {
  const parts: string[] = [];
  if (c.company_relation) parts.push(relationTitle(c.company_relation));
  parts.push(`${c.meeting_count} meeting${c.meeting_count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function relationTitle(relation: string): string {
  return relation.charAt(0).toUpperCase() + relation.slice(1);
}

/**
 * Full accessible name for a candidate option — screen-reader users need the
 * disambiguating detail MORE than sighted users, not less (DESIGN_SPEC_V4 §3.8).
 */
export function candidateAccessibleName(c: OwnerCandidate): string {
  const parts = [c.canonical_name, candidateEvidence(c)];
  if (c.aliases.length > 0) parts.push(`also known as ${c.aliases.join(", ")}`);
  if (c.exact_match) parts.push("suggested, exact name match");
  return parts.join(", ");
}

/** Sentinel for "leave this item's owner as recorded text only" in the picker. */
export const KEEP_TEXT_ONLY = "__text_only__";
/** Sentinel for "clear the link AND the recorded name" in the picker. */
export const CLEAR_OWNER = "__clear__";
