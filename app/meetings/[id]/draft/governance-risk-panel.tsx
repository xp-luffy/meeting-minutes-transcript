import { createClient } from "@/lib/supabase/server";
import { detectConflicts, type ConflictFinding } from "@/lib/conflicts";
import { checkConsistency, type ConsistencyFinding } from "@/lib/consistency";
import { StatusBanner, StatusRow, type StatusState } from "@/components/status";

/**
 * Server component: the "wow" governance panel. It traverses the directorship
 * graph (detectConflicts) to surface related-party / undeclared-interest
 * conflicts, then runs the deterministic consistency checks (checkConsistency)
 * for dangling references, duplicate/gap resolution numbers, and quorum
 * contradictions. Renders conflicts first (they are the sharp finding), then
 * contradictions; a clean record gets a small green all-clear.
 */

interface GovernanceRiskPanelProps {
  meetingId: string;
  bodyHtml: string;
  transcriptText: string;
  quorumMet: boolean | null;
  attendees: { name: string; role: string }[] | null;
  resolutions: { resolution_number: string | null }[];
  /**
   * True when the PAGE's own reads (resolutions / transcript) failed. Those
   * feed checkConsistency, so without this an upstream failure produced empty
   * inputs, no findings, and a green all-clear — the same false assurance the
   * conflict scan was hardened against, entering one layer up.
   */
  inputsFailed?: boolean;
}

/**
 * `flag` and `warn` used to be two amber/red variants of the SAME "!" glyph,
 * labelled "Flag" and "Review" — indistinguishable in greyscale and in print.
 * They now map onto two different states of the one status language: a flag is
 * a FAILED finding (✕, double-weight border), a warn is a RISK finding
 * (!, solid border) that wants a human's judgement.
 */
const SEVERITY_STATE: Record<"warn" | "flag", StatusState> = {
  flag: "failed",
  warn: "risk",
};

const SEVERITY_WORD: Record<"warn" | "flag", string> = {
  flag: "FLAG",
  warn: "REVIEW",
};

function ConflictRow({ finding }: { finding: ConflictFinding }) {
  return (
    <StatusRow
      state={SEVERITY_STATE[finding.severity]}
      stateWord={SEVERITY_WORD[finding.severity]}
      label={finding.title}
      detail={finding.detail}
      footer={
        finding.relatedEntity || finding.relatedCompany ? (
          <p className="text-caption font-medium tracking-[0.06em] break-words text-paper-600 uppercase">
            {finding.relatedEntity}
            {finding.relatedEntity && finding.relatedCompany ? " ↔ " : ""}
            {finding.relatedCompany}
          </p>
        ) : null
      }
    />
  );
}

function ConsistencyRow({ finding }: { finding: ConsistencyFinding }) {
  return (
    <StatusRow
      state={SEVERITY_STATE[finding.severity]}
      stateWord={SEVERITY_WORD[finding.severity]}
      label={finding.title}
      detail={finding.detail}
    />
  );
}

export async function GovernanceRiskPanel({
  meetingId,
  bodyHtml,
  transcriptText,
  quorumMet,
  attendees,
  resolutions,
  inputsFailed,
}: GovernanceRiskPanelProps) {
  const supabase = await createClient();

  // null means the scan could not run — NOT that the record is clean.
  const conflictResult = await detectConflicts(supabase, meetingId);
  const scanFailed = conflictResult === null || inputsFailed === true;
  const conflicts = conflictResult ?? [];
  const consistency = checkConsistency({
    bodyHtml,
    transcriptText,
    meeting: { quorum_met: quorumMet, attendees },
    resolutions,
  });

  // An all-clear is a positive assurance and may only be shown when the scan
  // actually completed.
  const allClear = !scanFailed && conflicts.length === 0 && consistency.length === 0;

return (
    <div className="rounded-surface border border-paper-300 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-subhead font-semibold text-paper-700">
          Governance risk — connections &amp; contradictions
        </h2>
        {!allClear ? (
          <span className="text-meta text-paper-600">
            {conflicts.length + consistency.length} finding
            {conflicts.length + consistency.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {scanFailed ? (
        /*
         * A swallowed scan error and a genuinely clean record used to produce
         * the identical green assertion. This is the UNKNOWN state: dashed on
         * every side, "?" glyph, and it says in words that nothing was checked.
         */
        <StatusBanner
          state="unknown"
          className="mt-4"
          title="Conflict scan did not complete — no connections have been checked"
        >
          This record has <strong>not</strong> been checked for related-party conflicts. This is
          not an all-clear. Re-open this draft to try again before finalising.
        </StatusBanner>
      ) : null}

      {allClear ? (
        /* Only reachable when the scan reported that it COMPLETED. */
        <StatusBanner
          state="verified"
          className="mt-4"
          title="No conflicts or contradictions detected across the record"
        >
          The directorship graph and the consistency checks both ran to completion and returned
          nothing.
        </StatusBanner>
      ) : (
        <div className="mt-4 space-y-5">
          {conflicts.length > 0 ? (
            <section>
              <h3 className="text-caption font-semibold tracking-[0.06em] text-paper-600 uppercase">
                Related-party &amp; interest conflicts
              </h3>
              <ul className="mt-2 space-y-2">
                {conflicts.map((finding, i) => (
                  <ConflictRow key={`conflict-${i}`} finding={finding} />
                ))}
              </ul>
            </section>
          ) : null}

          {consistency.length > 0 ? (
            <section>
              <h3 className="text-caption font-semibold tracking-[0.06em] text-paper-600 uppercase">
                Consistency &amp; contradictions
              </h3>
              <ul className="mt-2 space-y-2">
                {consistency.map((finding, i) => (
                  <ConsistencyRow key={`consistency-${i}`} finding={finding} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
