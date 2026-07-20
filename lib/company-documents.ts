import { createClient } from "@/lib/supabase/server";
import {
  DOC_TYPE_LABEL,
  DOC_TYPE_SLOTS,
  type DocType,
  type DocTypeSlot,
} from "@/lib/company-documents-types";

export * from "@/lib/company-documents-types";

/**
 * Company document cabinet — read side.
 *
 * The cabinet exists to make the app's checks TRUSTWORTHY. On 2026-07-20 the
 * minutes engine had no idea what quorum a company actually requires, assumed
 * one was satisfied, and wrote the assumption into a statutory document as
 * fact. Everything in this file is shaped by the fix for that:
 *
 *   RETURNING A DEFAULT WHEN A VALUE IS UNKNOWN IS FORBIDDEN. `getQuorumThreshold`
 *   returns null when it does not know, and null means "we do not know" — never
 *   "assume 2" and never "no quorum required". A caller that wants to render
 *   something must decide what to say about not knowing; this module will not
 *   decide it for them by inventing a number.
 *
 * This module deliberately does NOT import or touch lib/assurance.ts. It is the
 * clean seam the assurance work consumes later.
 */

export interface CompanyDocument {
  id: string;
  company_id: string;
  doc_type: DocType;
  title: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  in_force_from: string | null;
  quorum_threshold: number | null;
  quorum_total: number | null;
  superseded_by: string | null;
  superseded_at: string | null;
  created_at: string;
}

const DOCUMENT_COLUMNS =
  "id, company_id, doc_type, title, storage_path, mime_type, file_size, uploaded_by, in_force_from, quorum_threshold, quorum_total, superseded_by, superseded_at, created_at";

/**
 * The state a document is in, per DESIGN_SPEC_V4 §2.3. Four states, not two —
 * `undated` is the one that matters: an uploaded document with no effective
 * date CANNOT back a check, and a check depending on it degrades to
 * "not verified" (neutral), never to a pass and never to a fail.
 */
export type DocumentState = "in_force" | "superseded" | "undated";

export function documentState(doc: CompanyDocument): DocumentState {
  if (doc.superseded_by !== null) return "superseded";
  if (doc.in_force_from === null) return "undated";
  return "in_force";
}

/**
 * Result of listing a company's cabinet.
 *
 * `loadFailed` is explicit and load-bearing. If the query fails we must not
 * render an empty cabinet — an empty cabinet reads as "nothing on file", which
 * is a statement of fact we would be making without having looked
 * (docs/PILOT_PLAYBOOK.md pattern A: never let a failure look like a result).
 */
export interface CompanyCabinet {
  documents: CompanyDocument[];
  loadFailed: boolean;
}

export async function getCompanyDocuments(companyId: string): Promise<CompanyCabinet> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("company_id", companyId)
    .order("in_force_from", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getCompanyDocuments: query failed", error);
    return { documents: [], loadFailed: true };
  }

  return { documents: (data ?? []) as CompanyDocument[], loadFailed: false };
}

export interface CabinetSlot {
  slot: DocTypeSlot;
  /** For `single` slots: the one document currently in force, if any. */
  current: CompanyDocument | null;
  /** Superseded documents, newest first — the "what was in force then" history. */
  history: CompanyDocument[];
  /** Documents present but undated; they exist, and they back nothing. */
  undated: CompanyDocument[];
  /** For `collection` slots: every document, newest first. */
  items: CompanyDocument[];
}

/** Groups a flat document list into the cabinet's typed slots, empty ones included. */
export function groupIntoSlots(documents: CompanyDocument[]): CabinetSlot[] {
  return DOC_TYPE_SLOTS.map((slot) => {
    const mine = documents.filter((d) => d.doc_type === slot.type);
    const inForce = mine.filter((d) => documentState(d) === "in_force");
    return {
      slot,
      current: inForce[0] ?? null,
      history: mine.filter((d) => documentState(d) === "superseded"),
      undated: mine.filter((d) => documentState(d) === "undated"),
      items: mine,
    };
  });
}

// ---------------------------------------------------------------------------
// Derived facts — "what these documents unlock"
// ---------------------------------------------------------------------------

export interface FactProvenance {
  documentId: string;
  documentTitle: string;
  docType: DocType;
  docTypeLabel: string;
  /** ISO date. Non-null by construction: an undated document can never be provenance. */
  inForceFrom: string;
}

/**
 * A quorum threshold together with where it came from.
 *
 * There is no `source: "assumed"` variant and there never will be. The absence
 * of that variant is the fix for the shipped bug.
 */
export interface QuorumThreshold {
  threshold: number;
  /** Total directors/members the threshold is out of, when recorded ("3 of 5"). */
  total: number | null;
  provenance: FactProvenance;
}

/**
 * The quorum this company requires, or NULL when we do not know.
 *
 * Contract for callers (the assurance layer will be one):
 *
 *   - A non-null result is backed by a NAMED document that is IN FORCE and
 *     CARRIES AN EFFECTIVE DATE. It is safe to cite, and `provenance` is what
 *     you cite. Never render the number without it.
 *   - `null` means UNKNOWN. It does not mean "no quorum required", it does not
 *     mean zero, and it must not be replaced with a default. A check that needs
 *     this value and gets null degrades to "not verified" (neutral) — not to a
 *     pass, and not to a fail. Use `getQuorumThresholdReason` if you need to
 *     tell the user *why* it is unknown.
 *
 * Kept free of any lib/assurance.ts dependency on purpose: this is the seam,
 * not the consumer.
 */
export async function getQuorumThreshold(companyId: string): Promise<QuorumThreshold | null> {
  const resolved = await resolveQuorum(companyId);
  return resolved.known ? resolved.value : null;
}

export type QuorumUnknownReason =
  /** No constitution has ever been filed for this company. */
  | "no_constitution"
  /** A constitution is on file but nobody recorded when it took effect, so it cannot back a check. */
  | "effective_date_unknown"
  /** A dated constitution is in force, but no threshold was read off it. */
  | "threshold_not_recorded"
  /** The lookup itself failed. Distinct from "there is nothing" — say so out loud. */
  | "lookup_failed";

export type QuorumResolution =
  | { known: true; value: QuorumThreshold }
  | { known: false; reason: QuorumUnknownReason };

/**
 * Same lookup as `getQuorumThreshold`, but reports WHY the answer is unknown so
 * the UI can name the missing input and offer the fix. "Not verified because no
 * constitution is on file" and "not verified because the lookup errored" are
 * different facts and the user must not have them conflated.
 */
export async function getQuorumThresholdReason(companyId: string): Promise<QuorumResolution> {
  return resolveQuorum(companyId);
}

async function resolveQuorum(companyId: string): Promise<QuorumResolution> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("company_id", companyId)
    .eq("doc_type", "constitution");

  if (error) {
    // Never silently degrade a failure into "no constitution on file" — that
    // would tell the user a fact we did not establish (playbook pattern A).
    console.error("resolveQuorum: query failed", error);
    return { known: false, reason: "lookup_failed" };
  }

  const constitutions = (data ?? []) as CompanyDocument[];
  if (constitutions.length === 0) {
    return { known: false, reason: "no_constitution" };
  }

  const inForce = constitutions
    .filter((d) => documentState(d) === "in_force")
    .sort((a, b) => (b.in_force_from ?? "").localeCompare(a.in_force_from ?? ""));

  if (inForce.length === 0) {
    // Everything on file is either superseded (nothing replaced it, so the
    // slot is effectively vacant) or undated (cannot back a check, §2.3).
    const hasUndated = constitutions.some((d) => documentState(d) === "undated");
    return { known: false, reason: hasUndated ? "effective_date_unknown" : "no_constitution" };
  }

  const current = inForce[0];
  if (current.quorum_threshold === null || current.in_force_from === null) {
    return { known: false, reason: "threshold_not_recorded" };
  }

  return {
    known: true,
    value: {
      threshold: current.quorum_threshold,
      total: current.quorum_total,
      provenance: {
        documentId: current.id,
        documentTitle: current.title,
        docType: current.doc_type,
        docTypeLabel: DOC_TYPE_LABEL[current.doc_type],
        inForceFrom: current.in_force_from,
      },
    },
  };
}

/**
 * A row in the "what these documents unlock" panel.
 *
 * Three kinds, and they must render as three visibly different things:
 *
 *   `verified`  — green. A named, dated, in-force document produced this value.
 *   `unverified`— amber. The input is missing; we say which one and what breaks.
 *   `recorded`  — NEUTRAL, never green. A human typed this number and the
 *                 document behind it is not usable as authority (no effective
 *                 date). It is not verified, and it must never wear a tick.
 *
 * Unknown must not look like verified. Conflating them is exactly the confusion
 * that put an assumed quorum into a statutory document.
 */
export type DerivedFact =
  | {
      kind: "verified";
      label: string;
      value: string;
      provenance: FactProvenance;
    }
  | {
      kind: "unverified";
      label: string;
      /** Which input is missing, in plain words. */
      missing: string;
      /** What the user loses because of it. */
      consequence: string;
      /** Slot to upload into, when there is an obvious fix. */
      uploadType: DocType | null;
    }
  | {
      kind: "recorded";
      label: string;
      value: string;
      /** Why this is not verified despite having a number. */
      caveat: string;
    };

export interface UnlocksPanel {
  facts: DerivedFact[];
  /** True when derivation could not run. Render the panel as an error, never as "nothing to verify". */
  failed: boolean;
}

/**
 * Builds the panel from an already-loaded cabinet plus the quorum resolution.
 * Pure — takes data, returns rows — so the page can render it without a second
 * round trip and so it is testable without a database.
 */
export function buildUnlocksPanel(
  cabinet: CompanyCabinet,
  quorum: QuorumResolution,
): UnlocksPanel {
  if (cabinet.loadFailed || (!quorum.known && quorum.reason === "lookup_failed")) {
    return { facts: [], failed: true };
  }

  const facts: DerivedFact[] = [];
  const slots = groupIntoSlots(cabinet.documents);
  const bySlot = new Map(slots.map((s) => [s.slot.type, s]));

  // --- Quorum threshold ---
  if (quorum.known) {
    const { threshold, total } = quorum.value;
    facts.push({
      kind: "verified",
      label: "Quorum threshold",
      value: total ? `${threshold} of ${total} directors` : `${threshold} directors`,
      provenance: quorum.value.provenance,
    });
  } else if (quorum.reason === "effective_date_unknown") {
    const undated = bySlot.get("constitution")?.undated[0];
    const recorded = undated?.quorum_threshold ?? null;
    if (recorded !== null) {
      facts.push({
        kind: "recorded",
        label: "Quorum threshold",
        value: undated?.quorum_total
          ? `${recorded} of ${undated.quorum_total} directors`
          : `${recorded} directors`,
        caveat:
          "Recorded by a person from a constitution with no effective date on file. Not verified — this number cannot back a quorum check.",
      });
    } else {
      facts.push({
        kind: "unverified",
        label: "Quorum threshold",
        missing: "The constitution on file has no effective date recorded",
        consequence:
          "Quorum cannot be checked against this company's own rules — quorum checks report “not verified”.",
        uploadType: "constitution",
      });
    }
  } else if (quorum.reason === "threshold_not_recorded") {
    facts.push({
      kind: "unverified",
      label: "Quorum threshold",
      missing: "No quorum threshold was recorded against the constitution on file",
      consequence:
        "Quorum cannot be checked against this company's own rules — quorum checks report “not verified”.",
      uploadType: "constitution",
    });
  } else {
    facts.push({
      kind: "unverified",
      label: "Quorum threshold",
      missing: "No constitution on file",
      consequence:
        "Quorum thresholds and resolution majorities cannot be verified — checks that depend on them report “not verified”.",
      uploadType: "constitution",
    });
  }

  // --- Register of directors ---
  const register = bySlot.get("register_of_directors");
  if (register?.current) {
    facts.push({
      kind: "verified",
      label: "Directors on record",
      value: "Register of Directors on file",
      provenance: {
        documentId: register.current.id,
        documentTitle: register.current.title,
        docType: register.current.doc_type,
        docTypeLabel: DOC_TYPE_LABEL[register.current.doc_type],
        inForceFrom: register.current.in_force_from as string,
      },
    });
  } else if (register && register.undated.length > 0) {
    facts.push({
      kind: "unverified",
      label: "Directors on record",
      missing: "The Register of Directors on file has no effective date recorded",
      consequence:
        "The app cannot say who was a director on a given meeting date, so attendance stays unverified.",
      uploadType: "register_of_directors",
    });
  } else {
    facts.push({
      kind: "unverified",
      label: "Directors on record",
      missing: "No Register of Directors on file",
      consequence:
        "The app cannot say who was a director on a given meeting date, so attendance stays unverified.",
      uploadType: "register_of_directors",
    });
  }

  // --- Committee quorum ---
  const tor = bySlot.get("terms_of_reference");
  if (tor?.current) {
    facts.push({
      kind: "verified",
      label: "Committee mandate",
      value: "Terms of Reference on file",
      provenance: {
        documentId: tor.current.id,
        documentTitle: tor.current.title,
        docType: tor.current.doc_type,
        docTypeLabel: DOC_TYPE_LABEL[tor.current.doc_type],
        inForceFrom: tor.current.in_force_from as string,
      },
    });
  } else {
    facts.push({
      kind: "unverified",
      label: "Committee quorum",
      missing: "No Terms of Reference on file",
      consequence: "Committee minutes cannot be quorum-checked.",
      uploadType: "terms_of_reference",
    });
  }

  return { facts, failed: false };
}
