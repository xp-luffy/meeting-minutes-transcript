import type { ReactNode } from "react";
import type { MeetingStatus } from "@/lib/types";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/types";
import { formatConfidencePercent } from "@/lib/format";

/**
 * Shared focus-visible ring classes for buttons and links across the app —
 * keeps keyboard-focus styling consistent without relying on browser
 * defaults. Append to a className string.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

type BadgeVariant = "neutral" | "amber" | "green" | "red" | "indigo";

const BADGE_VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-300",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300",
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-300",
  indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-300",
};

/** Small pill badge used across the app for statuses, outcomes, and tags. */
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const MEETING_STATUS_VARIANT: Record<MeetingStatus, BadgeVariant> = {
  draft: "neutral",
  reviewed: "amber",
  final: "green",
};

const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  final: "Final",
};

/** Badge for a meeting / draft status (draft, reviewed, final). */
export function StatusBadge({ status }: { status: MeetingStatus }) {
  return <Badge variant={MEETING_STATUS_VARIANT[status]}>{MEETING_STATUS_LABEL[status]}</Badge>;
}

const OUTCOME_VARIANT: Record<string, BadgeVariant> = {
  carried: "green",
  deferred: "amber",
  lapsed: "red",
};

/** Pill for a resolution outcome (carried, deferred, lapsed). */
export function OutcomePill({ outcome }: { outcome: string }) {
  const variant = OUTCOME_VARIANT[outcome] ?? "neutral";
  return (
    <Badge variant={variant} className="capitalize">
      {outcome}
    </Badge>
  );
}

/** Pill for an action item status (open, done). */
export function ItemStatusPill({ status }: { status: "open" | "done" }) {
  return (
    <Badge variant={status === "done" ? "green" : "indigo"} className="capitalize">
      {status}
    </Badge>
  );
}

/**
 * Amber "needs review" tag shown when a confidence score is below the
 * review threshold. Renders nothing when confidence is missing or high enough.
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
  if (confidence === null || confidence === undefined) return null;
  if (confidence >= threshold) return null;
  return <Badge variant="amber">{label}</Badge>;
}

/** Chip that displays a confidence percentage, e.g. "Confidence 91%". */
export function ConfidenceChip({ confidence }: { confidence: number | null | undefined }) {
  if (confidence === null || confidence === undefined) return null;
  const isLow = confidence < CONFIDENCE_REVIEW_THRESHOLD;
  return (
    <Badge variant={isLow ? "amber" : "neutral"}>
      Confidence {formatConfidencePercent(confidence)}
    </Badge>
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
    <span className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] text-neutral-600">
      <span aria-hidden>📄</span>
      <span>
        {documentLabel} · in force {inForceFrom}
      </span>
    </span>
  );
}

/**
 * Shared empty-state block: a dashed card with a heading, message, and an
 * optional action. Used wherever a list/table has no rows to show.
 */
export function EmptyState({
  title,
  message,
  action,
  compact = false,
  className = "",
}: {
  title?: string;
  message: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-dashed border-neutral-300 bg-white text-center ${
        compact ? "p-6" : "p-10"
      } ${className}`}
    >
      {title ? <h2 className="text-base font-semibold text-neutral-900">{title}</h2> : null}
      <p className={`text-sm text-neutral-500 ${title ? "mt-2" : ""}`}>{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
