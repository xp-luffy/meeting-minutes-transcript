import type { AssuranceStatus } from "@/lib/assurance";

/**
 * The one-line assurance summary stamped into every non-final export.
 *
 * VISUAL_SYSTEM_V4 §5.9 rule 3. Without it the proof stays trapped in the app:
 * a draft with three failed statutory checks exports with exactly the same
 * banner as a clean one, and the banner is all an auditor holding the printout
 * ever sees.
 *
 * Pure function of data — no framework, no Supabase — so it can be unit-tested
 * directly and used identically by the DOCX and PDF builders.
 */

export interface ExportAssurance {
  statuses: AssuranceStatus[];
}

export function assuranceSummaryLine(assurance: ExportAssurance | null): string {
  // NOT RUN is stated in words, in full. A missing line would read as "nothing
  // to report", which is the precise confusion this whole system exists to
  // eliminate: absence of a check is a finding, not a blank.
  if (!assurance || assurance.statuses.length === 0) {
    return "Assurance: NOT RUN — no statutory completeness checks have been performed on this document.";
  }

  const total = assurance.statuses.length;
  const verified = assurance.statuses.filter((s) => s === "pass").length;
  const failed = assurance.statuses.filter((s) => s === "fail").length;
  const review = assurance.statuses.filter((s) => s === "warn").length;
  const notChecked = assurance.statuses.filter((s) => s === "not_applicable").length;

  const parts = [`Assurance: ${verified} of ${total} checks verified`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (review > 0) parts.push(`${review} for review`);
  // "not checked" is always stated when non-zero, and never folded into any
  // other count — an unrun check is a larger liability than a flagged one.
  if (notChecked > 0) parts.push(`${notChecked} not checked`);
  return parts.join(" · ");
}
