import type { ReactNode } from "react";

/**
 * THE STATUS LANGUAGE (VISUAL_SYSTEM_V4 §3).
 *
 * Four states, and they must never be confusable:
 *
 *   VERIFIED  a check ran and passed          ✓  solid border
 *   UNKNOWN   no check ran / it could not run  ?  DASHED border, no fill
 *   FAILED    a check ran and found a gap      ✕  DOUBLE-weight border
 *   RISK      passed, but wants judgement      !  solid border
 *
 * Three independent channels encode every state: colour, glyph, and border
 * treatment. Remove colour entirely — greyscale print, deuteranopia, a
 * photocopied exhibit — and ✓solid / ?dashed / ✕double / !solid remain
 * distinct by shape alone. The dashed outline on UNKNOWN does the heaviest
 * lifting: it is the only discontinuous outline in the system, which reads as
 * *incomplete* without any training.
 *
 * HARD RULE: a component that cannot determine a status renders UNKNOWN. It
 * does not return null and it does not fall back to a neutral pill. Silence
 * has been used to mean both "fine" and "never looked", and a cosec who reads
 * a silent screen as a clean screen files minutes with an unverified gap.
 *
 * Glyphs are SVG, not text characters: `"✕"` renders differently per platform
 * font and some screen readers announce it. The state WORD carries the meaning
 * for assistive tech; the glyph is always aria-hidden.
 */

export type StatusState = "verified" | "unknown" | "failed" | "risk";

/** The word each state is announced and printed as. Never abbreviate these. */
export const STATUS_WORD: Record<StatusState, string> = {
  verified: "Verified",
  unknown: "Not checked",
  failed: "Failed",
  risk: "Review",
};

/**
 * failed → unknown → risk → verified.
 *
 * UNKNOWN sorts ABOVE risk deliberately: an unrun check is a larger liability
 * than a flagged-but-passing one.
 */
export const STATUS_ORDER: Record<StatusState, number> = {
  failed: 0,
  unknown: 1,
  risk: 2,
  verified: 3,
};

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

function Glyph({ state, className = "h-3 w-3" }: { state: StatusState; className?: string }) {
  const common = {
    className: `${className} flex-none`,
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const,
    focusable: "false" as const,
  };

  if (state === "verified") {
    return (
      <svg {...common}>
        <path d="M2.5 6.5 5 9l4.5-6" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg {...common}>
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    );
  }
  if (state === "risk") {
    return (
      <svg {...common}>
        <path d="M6 2v4.5" />
        <path d="M6 9.4v.1" />
      </svg>
    );
  }
  // unknown — a question mark, drawn rather than typed.
  return (
    <svg {...common}>
      <path d="M4.2 4.2a1.9 1.9 0 1 1 2.4 2.2c-.4.2-.6.5-.6 1v.2" />
      <path d="M6 9.4v.1" />
    </svg>
  );
}

/** The status glyph on its own, for use inside an existing text run. */
export function StatusGlyph({
  state,
  className,
}: {
  state: StatusState;
  className?: string;
}) {
  return <Glyph state={state} className={className} />;
}

// ---------------------------------------------------------------------------
// Chip (§5.1)
// ---------------------------------------------------------------------------

const CHIP_CLASS: Record<StatusState, string> = {
  // Chip text is the -800 step on the -50 tint (7.5–9.0:1). Never -600 on -50:
  // risk-600 on risk-50 is 4.33:1 and fails AA for text.
  verified:
    "bg-status-verified-50 text-status-verified-800 border border-status-verified-600",
  unknown:
    "bg-transparent text-status-unknown-800 border border-dashed border-status-unknown-600",
  failed: "bg-status-failed-50 text-status-failed-800 border-2 border-status-failed-600",
  risk: "bg-status-risk-50 text-status-risk-800 border border-status-risk-600",
};

/**
 * The atomic unit of the status language. The label is ALWAYS present — there
 * is no icon-only status chip, because a glyph alone is not readable by
 * assistive tech and not survivable in a fax.
 */
export function StatusChip({
  state,
  children,
  className = "",
  live = false,
}: {
  state: StatusState;
  children: ReactNode;
  className?: string;
  /** Set only when the chip updates in place; adds role="status". */
  live?: boolean;
}) {
  return (
    <span
      role={live ? "status" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-medium whitespace-nowrap ${CHIP_CLASS[state]} ${className}`}
    >
      <Glyph state={state} />
      <span>{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row icon + rail (§5.2)
// ---------------------------------------------------------------------------

const ROW_ICON_CLASS: Record<StatusState, string> = {
  verified: "bg-status-verified-100 text-status-verified-800",
  unknown: "bg-transparent border border-dashed border-status-unknown-600 text-status-unknown-800",
  failed: "bg-status-failed-100 text-status-failed-800",
  risk: "bg-status-risk-100 text-status-risk-800",
};

/** Rails must be the -600 step: the -300 tints measure ~2:1 and fail SC 1.4.11. */
export const STATUS_RAIL_CLASS: Record<StatusState, string> = {
  verified: "border-l-status-verified-600",
  unknown: "border-l-status-unknown-600",
  failed: "border-l-status-failed-600",
  risk: "border-l-status-risk-600",
};

export const STATUS_TEXT_CLASS: Record<StatusState, string> = {
  verified: "text-status-verified-800",
  unknown: "text-status-unknown-800",
  failed: "text-status-failed-800",
  risk: "text-status-risk-800",
};

export function StatusRowIcon({ state }: { state: StatusState }) {
  return (
    <span
      className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${ROW_ICON_CLASS[state]}`}
      aria-hidden="true"
    >
      <Glyph state={state} className="h-3 w-3" />
    </span>
  );
}

/**
 * A check row: rail + icon + label + THE STATE IN WORDS + detail.
 *
 * The state word is not decoration. A reader scanning a printed export gets
 * the answer from the text alone, with no colour and no glyph.
 */
export function StatusRow({
  state,
  label,
  detail,
  footer,
  stateWord,
}: {
  state: StatusState;
  label: ReactNode;
  detail?: ReactNode;
  /** Evidence chips, actions — anything that belongs under the detail line. */
  footer?: ReactNode;
  /** Override the state word (e.g. "NOT APPLICABLE"). Still always a word. */
  stateWord?: string;
}) {
  return (
    <li
      className={`flex items-start gap-3 rounded-surface border border-paper-300 border-l-[3px] bg-white px-3 py-2.5 ${STATUS_RAIL_CLASS[state]}`}
    >
      <StatusRowIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-body font-medium text-paper-900">{label}</p>
          <span
            className={`text-caption font-semibold tracking-[0.06em] uppercase ${STATUS_TEXT_CLASS[state]}`}
          >
            {stateWord ?? STATUS_WORD[state]}
          </span>
        </div>
        {detail ? <p className="mt-0.5 text-meta text-paper-600">{detail}</p> : null}
        {footer ? <div className="mt-1.5">{footer}</div> : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Banner (§5.7)
// ---------------------------------------------------------------------------

const BANNER_CLASS: Record<StatusState, string> = {
  verified:
    "bg-status-verified-50 border border-status-verified-600/30 border-l-[3px] border-l-status-verified-600",
  // Dashed on ALL sides. This is the state that must stop a reader cold.
  unknown:
    "bg-white border border-dashed border-status-unknown-600 border-l-[3px] border-l-status-unknown-600",
  failed:
    "bg-status-failed-50 border border-status-failed-600/30 border-l-[3px] border-l-status-failed-600",
  risk: "bg-status-risk-50 border border-status-risk-600/30 border-l-[3px] border-l-status-risk-600",
};

const BANNER_ICON_CLASS: Record<StatusState, string> = {
  verified: "text-status-verified-700",
  unknown: "text-status-unknown-700",
  failed: "text-status-failed-700",
  risk: "text-status-risk-700",
};

export function StatusBanner({
  state,
  title,
  children,
  action,
  className = "",
}: {
  state: StatusState;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={state === "failed" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-surface px-4 py-3 ${BANNER_CLASS[state]} ${className}`}
    >
      <span className={`mt-0.5 ${BANNER_ICON_CLASS[state]}`}>
        <Glyph state={state} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-body font-semibold ${STATUS_TEXT_CLASS[state]}`}>{title}</p>
        {/* Body copy never uses the tinted -800 on a tint: paper-700 is 9.77:1. */}
        {children ? <div className="mt-1 text-meta text-paper-700">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow chip — NOT a status (§5.1 "→ Changes")
// ---------------------------------------------------------------------------

/**
 * Draft / Reviewed / Final is a WORKFLOW position, not a claim about
 * correctness, so it may not borrow the semantic families. It gets a
 * paper-toned outline and its own glyph set (○ ◐ ●), which is what stops a
 * grey "Draft" pill being mistaken for an UNKNOWN assurance result.
 */
export function WorkflowChip({
  label,
  fill,
  className = "",
}: {
  label: string;
  fill: "empty" | "half" | "full";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border border-paper-450 bg-white px-2 py-0.5 text-caption font-medium whitespace-nowrap text-paper-700 ${className}`}
    >
      <svg
        className="h-3 w-3 flex-none"
        viewBox="0 0 12 12"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {fill === "full" ? <circle cx="6" cy="6" r="2.75" fill="currentColor" /> : null}
        {fill === "half" ? <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5Z" fill="currentColor" /> : null}
      </svg>
      <span>{label}</span>
    </span>
  );
}
