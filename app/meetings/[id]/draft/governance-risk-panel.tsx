import { createClient } from "@/lib/supabase/server";
import { detectConflicts, type ConflictFinding } from "@/lib/conflicts";
import { checkConsistency, type ConsistencyFinding } from "@/lib/consistency";

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
}

const SEVERITY_STYLES: Record<
  "warn" | "flag",
  { border: string; icon: string; iconClass: string; badge: string; badgeLabel: string }
> = {
  flag: {
    border: "border-neutral-200 border-l-4 border-l-red-400",
    icon: "!",
    iconClass: "bg-red-100 text-red-700",
    badge: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-300",
    badgeLabel: "Flag",
  },
  warn: {
    border: "border-neutral-200 border-l-4 border-l-amber-400",
    icon: "!",
    iconClass: "bg-amber-100 text-amber-700",
    badge: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300",
    badgeLabel: "Review",
  },
};

function SeverityBadge({ severity }: { severity: "warn" | "flag" }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.badge}`}
    >
      {s.badgeLabel}
    </span>
  );
}

function ConflictRow({ finding }: { finding: ConflictFinding }) {
  const s = SEVERITY_STYLES[finding.severity];
  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${s.border}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${s.iconClass}`}
        aria-hidden="true"
      >
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-neutral-900">{finding.title}</p>
          <SeverityBadge severity={finding.severity} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">{finding.detail}</p>
        {finding.relatedEntity || finding.relatedCompany ? (
          <p className="mt-1.5 break-words text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
            {finding.relatedEntity}
            {finding.relatedEntity && finding.relatedCompany ? " ↔ " : ""}
            {finding.relatedCompany}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function ConsistencyRow({ finding }: { finding: ConsistencyFinding }) {
  const s = SEVERITY_STYLES[finding.severity];
  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${s.border}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${s.iconClass}`}
        aria-hidden="true"
      >
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-neutral-800">{finding.title}</p>
          <SeverityBadge severity={finding.severity} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">{finding.detail}</p>
      </div>
    </li>
  );
}

export async function GovernanceRiskPanel({
  meetingId,
  bodyHtml,
  transcriptText,
  quorumMet,
  attendees,
  resolutions,
}: GovernanceRiskPanelProps) {
  const supabase = await createClient();

  // null means the scan could not run — NOT that the record is clean.
  const conflictResult = await detectConflicts(supabase, meetingId);
  const scanFailed = conflictResult === null;
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
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Governance risk — connections &amp; contradictions
        </h2>
        {!allClear ? (
          <span className="text-xs text-neutral-400">
            {conflicts.length + consistency.length} finding
            {conflicts.length + consistency.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {scanFailed ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5">
          <span
            className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800"
            aria-hidden="true"
          >
            ?
          </span>
          <p className="text-sm text-amber-900">
            The conflict scan could not be completed, so this record has{" "}
            <strong>not</strong> been checked for related-party conflicts. This is not an
            all-clear — re-open this draft to try again before finalising.
          </p>
        </div>
      ) : null}

      {allClear ? (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <span
            className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700"
            aria-hidden="true"
          >
            ✓
          </span>
          <p className="text-sm text-emerald-800">
            No conflicts or contradictions detected across the record.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {conflicts.length > 0 ? (
            <section>
              <h3 className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
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
              <h3 className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
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
