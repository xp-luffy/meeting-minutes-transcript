import type { ReactNode } from "react";
import type { MeetingStatus } from "@/lib/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { formatConfidencePercent } from "@/lib/format";
import { StatusBanner, StatusChip, WorkflowChip } from "@/components/status";

export { StatusChip, StatusBanner, StatusRow, StatusGlyph, WorkflowChip } from "@/components/status";
export type { StatusState } from "@/components/status";

/**
 * THE focus ring. One implementation, shared with the `focus-ring` CSS utility
 * in globals.css — they are byte-identical in effect, and `outline-none` is
 * scoped to `focus-visible` so Windows High Contrast mode keeps its outline.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2";

/**
 * Non-status badge. Category tags, counts, and other labels that make NO claim
 * about correctness.
 *
 * `amber`/`green`/`red` are retained only for call sites that have not yet been
 * converted, and they map onto the semantic families. Anything that IS a claim
 * about correctness must use `StatusChip` instead — a Badge cannot carry the
 * glyph + border treatment the status language requires.
 */
type BadgeVariant = "neutral" | "amber" | "green" | "red" | "ink" | "indigo";

const BADGE_VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-paper-100 text-paper-700 ring-1 ring-inset ring-paper-300",
  amber: "bg-status-risk-50 text-status-risk-800 ring-1 ring-inset ring-status-risk-600",
  green: "bg-status-verified-50 text-status-verified-800 ring-1 ring-inset ring-status-verified-600",
  red: "bg-status-failed-50 text-status-failed-800 ring-1 ring-inset ring-status-failed-600",
  ink: "bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200",
  indigo: "bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200",
};

/** Small pill badge used across the app for non-status tags and counts. */
export function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      /* rounded-control, NOT rounded-pill: the pill shape is reserved for
         status chips, so shape alone now separates "this is a claim about
         correctness" from "this is a category label". */
      className={`inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-caption font-medium whitespace-nowrap ${BADGE_VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const MEETING_STATUS_FILL: Record<MeetingStatus, "empty" | "half" | "full"> = {
  draft: "empty",
  reviewed: "half",
  final: "full",
};

const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  final: "Final",
};

/**
 * Meeting/draft workflow position (draft, reviewed, final).
 *
 * This is NOT a correctness status and must not use the semantic families
 * (VISUAL_SYSTEM_V4 §5.1). It used to render `draft → grey pill`, which was
 * pixel-identical to a neutral "unknown" pill — so a workflow state read as an
 * assurance result. It is now a paper-toned outline chip with its own glyph
 * set (○ ◐ ●), which no status chip can be confused with.
 */
export function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <WorkflowChip label={MEETING_STATUS_LABEL[status]} fill={MEETING_STATUS_FILL[status]} />
  );
}

/**
 * Resolution outcome. Carried/deferred/lapsed IS a finding about the record,
 * so it uses the status language: lapsed is a gap, deferred wants judgement,
 * and an outcome that was never recorded is UNKNOWN — never a blank.
 */
const OUTCOME_STATE: Record<string, "verified" | "risk" | "failed"> = {
  carried: "verified",
  deferred: "risk",
  lapsed: "failed",
};

export function OutcomePill({ outcome }: { outcome: string }) {
  const state = OUTCOME_STATE[outcome?.trim().toLowerCase()];
  if (!state) {
    return <StatusChip state="unknown">Outcome not recorded</StatusChip>;
  }
  return (
    <StatusChip state={state} className="capitalize">
      {outcome}
    </StatusChip>
  );
}

/**
 * Action item status (open, done).
 *
 * "Open" is not a status claim and not a brand moment — it used to render in
 * indigo, the same colour as the primary button, the active nav, links and the
 * focus ring, so indigo meant five things and taught the user nothing. It is
 * now paper-toned. "Done" is an earned completion and keeps the verified chip.
 */
export function ItemStatusPill({ status }: { status: "open" | "done" }) {
  if (status === "done") {
    return <StatusChip state="verified">Done</StatusChip>;
  }
  return (
    <span className="inline-flex items-center rounded-pill border border-paper-450 bg-white px-2 py-0.5 text-caption font-medium whitespace-nowrap text-paper-700">
      Open
    </span>
  );
}

/**
 * "This passage needs a human look."
 *
 * THE CORRECTNESS RULE (VISUAL_SYSTEM_V4 §1.2 defect B, §3.2 rule 1):
 * this used to `return null` when confidence was null, so a draft whose
 * confidence was NEVER SCORED rendered identically to one that scored 100%.
 * Silence meant two opposite things. An unmeasured passage is now an explicit
 * UNKNOWN chip — dashed border, `?` glyph, the words "Confidence not measured".
 *
 * The only case that renders nothing is a MEASURED score at or above the
 * threshold, because there the silence is earned: a check ran and it passed,
 * and `ConfidenceChip` beside it states the number.
 */
export function ConfidenceTag({
  confidence,
  label = "Needs review",
  threshold = CONFIDENCE_REVIEW_THRESHOLD,
}: {
  confidence: number | null | undefined;
  label?: string;
  threshold?: number;
}) {
  if (confidence === null || confidence === undefined) {
    return <StatusChip state="unknown">Confidence not measured</StatusChip>;
  }
  if (confidence >= threshold) return null;
  return <StatusChip state="risk">{label}</StatusChip>;
}

/**
 * Chip that displays a confidence percentage, e.g. "Confidence 91%".
 *
 * Same rule: an absent score is a finding, not a blank. It renders UNKNOWN.
 */
export function ConfidenceChip({ confidence }: { confidence: number | null | undefined }) {
  if (confidence === null || confidence === undefined) {
    return <StatusChip state="unknown">Confidence not measured</StatusChip>;
  }
  const isLow = confidence < CONFIDENCE_REVIEW_THRESHOLD;
  return (
    <StatusChip state={isLow ? "risk" : "verified"}>
      Confidence {formatConfidencePercent(confidence)}
    </StatusChip>
  );
}

/**
 * "This statement is backed by a named document."
 *
 * The one new visual token in DESIGN_SPEC_V4 (§0). It carries the document's
 * name and the date it took effect, because "Quorum threshold: 3 of 5" is worth
 * nothing and "3 of 5 — read from Constitution, in force since 12 Jun 2026" is
 * the product.
 *
 * NEVER render this chip for a value that has no document behind it, or for a
 * document that is not in force for the date in question. A chip on an
 * unsourced number is exactly the false comfort this app exists to prevent.
 */
export function EvidenceChip({
  documentLabel,
  inForceFrom,
}: {
  documentLabel: string;
  /** Human-formatted date the document took effect. Required — an undated document is not evidence. */
  inForceFrom: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-control border border-paper-300 bg-paper-50 px-1.5 py-0.5 text-caption text-paper-600">
      <svg
        className="h-3 w-3 flex-none"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M3 1.25h3.5L9 3.75v7H3z" />
        <path d="M6.5 1.25v2.5H9" />
      </svg>
      <span className="break-words">
        {documentLabel} · in force {inForceFrom}
      </span>
    </span>
  );
}

/**
 * Empty state — TWO variants, because they are not the same thing
 * (VISUAL_SYSTEM_V4 §5.8).
 *
 *   variant="nothing-yet"  (default) — a benign, expected void. Nobody has
 *                          created anything here and that is fine.
 *   variant="unchecked"    — an absence that is ITSELF A FINDING. Renders as
 *                          the UNKNOWN banner at panel scale.
 *
 * Deciding rule: if a user could plausibly read the empty state as "everything
 * is fine here", it MUST be `unchecked`. The whole product exists because a
 * cosec reading a silent screen as a clean screen files minutes with a gap.
 */
export function EmptyState({
  title,
  message,
  action,
  compact = false,
  variant = "nothing-yet",
  className = "",
}: {
  title?: string;
  message: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  variant?: "nothing-yet" | "unchecked";
  className?: string;
}) {
  if (variant === "unchecked") {
    return (
      <StatusBanner
        state="unknown"
        title={title ?? "Nothing here has been checked"}
        action={action}
        className={className}
      >
        {message}
      </StatusBanner>
    );
  }

  return (
    <div
      className={`rounded-surface border border-dashed border-paper-300 bg-white text-center ${
        compact ? "p-6" : "p-8"
      } ${className}`}
    >
      {title ? <h2 className="text-subhead font-semibold text-paper-900">{title}</h2> : null}
      <p className={`text-body text-paper-600 ${title ? "mt-2" : ""}`}>{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
