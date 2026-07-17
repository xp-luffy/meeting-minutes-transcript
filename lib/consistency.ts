/**
 * Deterministic consistency / contradiction detection for a minutes draft —
 * "does this record contradict itself, or lean on something it never shows?"
 *
 * IMPORTANT: this file must stay framework-free (no next/*, no supabase
 * imports) so it can be unit-tested directly with `bun run <script>.ts`.
 *
 * Checks (all regex/string, no I/O):
 *  - Dangling reference: the record leans on a prior approval ("as previously
 *    approved", "pursuant to the resolution", an "approved on <date>" artifact)
 *    that is not evidenced by any numbered resolution in this record.
 *  - Duplicate resolution numbers: two resolutions carry the same number.
 *  - Quorum contradiction: a stated "quorum of N" exceeds the attendees
 *    actually present, OR resolutions were carried while quorum_met is false.
 *  - Sequence gap: numbered resolutions skip a value (BD-2026-01, -03 → -02
 *    missing).
 */

export type ConsistencySeverity = "warn" | "flag";

export interface ConsistencyFinding {
  severity: ConsistencySeverity;
  title: string;
  detail: string;
}

export interface ConsistencyInput {
  bodyHtml: string;
  transcriptText: string;
  meeting: {
    quorum_met: boolean | null;
    attendees: { name: string; role: string }[] | null;
  };
  resolutions: { resolution_number: string | null }[];
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Dangling reference
// ---------------------------------------------------------------------------

/**
 * Phrases that lean on an approval which should already exist somewhere. Each
 * entry is a distinct "kind" of dangling reference so we can describe it.
 */
const DANGLING_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bas previously approved\b/i, label: '"as previously approved"' },
  { re: /\bpursuant to the resolution\b/i, label: '"pursuant to the resolution"' },
  { re: /\bpreviously resolved\b/i, label: '"previously resolved"' },
  { re: /\bas (?:previously )?resolved\b/i, label: '"as resolved"' },
  {
    re: /\b(?:SPA|agreement|resolution|mandate|approval)\b[^.]{0,40}\bapproved on\b\s*\d/i,
    label: 'an approval "approved on <date>"',
  },
  { re: /\bapproved (?:at|by) (?:the|a) (?:previous|prior|earlier)\b/i, label: "a prior-meeting approval" },
];

function checkDanglingReferences(
  combinedText: string,
  numberedResolutions: string[],
): ConsistencyFinding[] {
  const matched = DANGLING_PATTERNS.filter((p) => p.re.test(combinedText));
  if (matched.length === 0) return [];

  // If this record actually carries numbered resolutions, we treat those as
  // in-record evidence of approvals and stay quiet — the heuristic only fires
  // when there is no numbered-resolution anchor in this record at all.
  if (numberedResolutions.length > 0) return [];

  const labels = matched.map((p) => p.label).join(", ");
  return [
    {
      severity: "warn",
      title: "References a prior approval not evidenced in this record",
      detail: `The minutes lean on ${labels}, but no numbered resolution in this record evidences that approval. Cite the source resolution or attach the prior minutes.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Duplicate resolution numbers
// ---------------------------------------------------------------------------

function checkDuplicateNumbers(numbers: string[]): ConsistencyFinding[] {
  const seen = new Map<string, number>();
  for (const n of numbers) {
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  if (dupes.length === 0) return [];
  return [
    {
      severity: "flag",
      title: "Duplicate resolution numbers",
      detail: `Resolution number${dupes.length === 1 ? "" : "s"} ${dupes
        .map((n) => `"${n}"`)
        .join(", ")} ${dupes.length === 1 ? "is" : "are"} used more than once. Each resolution must carry a unique number.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Quorum contradiction
// ---------------------------------------------------------------------------

function checkQuorum(input: ConsistencyInput, bodyText: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const attendeeCount = input.meeting.attendees?.length ?? 0;

  // (a) stated "quorum of N" exceeds attendees actually present
  const quorumMatch = bodyText.match(/quorum\s+of\s+(\d{1,3})/i);
  if (quorumMatch && attendeeCount > 0) {
    const required = Number.parseInt(quorumMatch[1], 10);
    if (Number.isFinite(required) && attendeeCount < required) {
      findings.push({
        severity: "flag",
        title: "Quorum not met by recorded attendance",
        detail: `The minutes state a quorum of ${required}, but only ${attendeeCount} attendee${
          attendeeCount === 1 ? " is" : "s are"
        } recorded as present. The stated quorum and the attendance list contradict each other.`,
      });
    }
  }

  // (b) resolutions carried while quorum was not met
  if (input.meeting.quorum_met === false && input.resolutions.length > 0) {
    findings.push({
      severity: "flag",
      title: "Resolutions recorded despite quorum not met",
      detail: `Quorum is recorded as not met, yet ${input.resolutions.length} resolution${
        input.resolutions.length === 1 ? " was" : "s were"
      } recorded. Resolutions passed without quorum are open to challenge.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Sequence gap
// ---------------------------------------------------------------------------

function checkSequenceGaps(numbers: string[]): ConsistencyFinding[] {
  // Group by the non-numeric prefix that precedes the final numeric segment.
  const groups = new Map<string, { value: number; width: number; raw: string }[]>();
  for (const raw of numbers) {
    const m = raw.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    const prefix = m[1];
    const digits = m[2];
    const value = Number.parseInt(digits, 10);
    if (!Number.isFinite(value)) continue;
    const list = groups.get(prefix) ?? [];
    list.push({ value, width: digits.length, raw });
    groups.set(prefix, list);
  }

  const findings: ConsistencyFinding[] = [];
  for (const [prefix, entries] of groups) {
    if (entries.length < 2) continue;
    const values = [...new Set(entries.map((e) => e.value))].sort((a, b) => a - b);
    const width = Math.max(...entries.map((e) => e.width));
    const missing: string[] = [];
    for (let v = values[0]; v < values[values.length - 1]; v++) {
      if (!values.includes(v)) missing.push(`${prefix}${String(v).padStart(width, "0")}`);
    }
    if (missing.length > 0) {
      findings.push({
        severity: "warn",
        title: "Resolution numbering has a gap",
        detail: `The ${prefix || "resolution"} sequence skips ${missing
          .map((n) => `"${n}"`)
          .join(", ")}. Confirm no resolution was omitted from the record.`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function checkConsistency(input: ConsistencyInput): ConsistencyFinding[] {
  const bodyText = stripHtml(input.bodyHtml ?? "");
  const combinedText = `${bodyText} ${input.transcriptText ?? ""}`;

  const numbers = input.resolutions
    .map((r) => r.resolution_number)
    .filter((n): n is string => Boolean(n && n.trim().length > 0))
    .map(normalizeNumber);

  return [
    ...checkDanglingReferences(combinedText, numbers),
    ...checkDuplicateNumbers(numbers),
    ...checkQuorum(input, bodyText),
    ...checkSequenceGaps(numbers),
  ];
}
