import { splitSentences } from "./minutes-engine";

/**
 * The obligation engine: derives downstream statutory duties from a
 * meeting's decisions. Thesis (docs/PLAN_V3.md): every board decision creates
 * a downstream statutory duty — this module links decision → obligation →
 * deadline so the app becomes a compliance engine, not just a recorder.
 *
 * IMPORTANT: this file must stay framework-free (no next/*, no supabase
 * imports) so it can be unit-tested directly with `bun run <script>.ts`,
 * matching the convention set by lib/minutes-engine.ts.
 */

export type ObligationKind =
  | "ssm_filing"
  | "mandate_renewal"
  | "dividend_payment"
  | "matters_arising"
  | "confirm_previous"
  | "custom";

export type ObligationStatus = "open" | "done" | "waived";

/** Row shape for the `obligations` table (migration 0009), reused across the
 * register page, its server actions, and the draft-page panel so there is a
 * single source of truth for this module's own consumers. */
export interface ObligationRow {
  id: string;
  meeting_id: string;
  resolution_id: string | null;
  kind: ObligationKind;
  title: string;
  detail: string | null;
  due_date: string | null;
  status: ObligationStatus;
  source: string | null;
  created_at: string;
}

export interface DerivedObligation {
  kind: ObligationKind;
  title: string;
  detail: string | null;
  due_date: string | null;
  source: string;
  /** Index into the `resolutions` input array this obligation was derived
   * from, when applicable — callers map this to the freshly-inserted
   * resolution's id. Absent for obligations not tied to a specific
   * resolution (matters_arising, confirm_previous, or a transcript-only
   * fallback match). */
  resolution_index?: number;
}

export interface DeriveObligationsMeetingInput {
  meeting_type: string;
  meeting_date: string;
  minutes_format?: string;
}

export interface DeriveObligationsResolutionInput {
  id?: string;
  resolution_number: string | null;
  resolution_text: string;
  outcome: string;
}

export interface DeriveObligationsActionItemInput {
  description: string;
  owner_name: string | null;
  due_date: string | null;
}

export interface DeriveObligationsInput {
  meeting: DeriveObligationsMeetingInput;
  resolutions: DeriveObligationsResolutionInput[];
  actionItems: DeriveObligationsActionItemInput[];
  transcriptText: string;
}

// ---------------------------------------------------------------------------
// Date arithmetic
// ---------------------------------------------------------------------------

/** Adds `days` to an ISO (yyyy-mm-dd) date string, returning an ISO date
 * string. Falls back to returning the input unchanged if it doesn't parse. */
function addDaysIso(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Rule matchers — each inspects a single piece of text (a resolution's text,
// or a transcript sentence) and returns a match descriptor, or null. Kept
// separate from date computation (which needs meeting_date) so the same
// matcher can run over both resolutions and raw transcript sentences.
// ---------------------------------------------------------------------------

interface RuleMatch {
  kind: ObligationKind;
  title: string;
  detail: string | null;
  /** Days after meeting_date the obligation falls due, or null for no due date. */
  dueDateOffsetDays: number | null;
  source: string;
}

const APPOINTMENT_VERBS_RE = /\b(appoint\w*|resign\w*|cessation|retir\w*)\b/i;
const OFFICER_ROLE_RE = /\b(director|secretary|auditor)\b/i;
// A line describing the act of filing (the logistics) rather than the officer
// change itself — e.g. "Company Secretary to lodge the appointment with SSM".
// The underlying appointment resolution already triggers this obligation, so
// the logistics line must not create a duplicate (and must not mis-read the
// actor "Company Secretary" as the appointed role).
const FILING_LOGISTICS_RE =
  /\b(?:to\s+)?(?:lodge|file|submit)\b[^.]*\b(?:ssm|registrar|companies\s+commission)\b/i;

/** Director/secretary/auditor appointment, resignation, cessation, or
 * retirement → an SSM filing to lodge the change, due 14 days after the
 * meeting (the statutory lodgement window for officer changes). */
function matchAppointmentRule(text: string): RuleMatch | null {
  if (FILING_LOGISTICS_RE.test(text)) return null;
  if (!APPOINTMENT_VERBS_RE.test(text) || !OFFICER_ROLE_RE.test(text)) return null;

  // Pick the officer role nearest the appointment verb — so "appointment of
  // Mr X as Director" reads Director even if the sentence also names a
  // secretary elsewhere. "Company Secretary" as a bare actor (no adjacent
  // appointment verb) won't win.
  const verbMatch = text.match(APPOINTMENT_VERBS_RE);
  const verbIdx = verbMatch?.index ?? 0;
  let bestRole = "Officer";
  let bestDist = Infinity;
  const roleRe = /\b(director|secretary|auditor)\b/gi;
  for (let m = roleRe.exec(text); m; m = roleRe.exec(text)) {
    // Skip "secretary" when immediately preceded by "company" (the actor).
    if (/secretary/i.test(m[1]) && /\bcompany\s*$/i.test(text.slice(0, m.index))) continue;
    const dist = Math.abs(m.index - verbIdx);
    if (dist < bestDist) {
      bestDist = dist;
      bestRole = capitalizeWord(m[1]);
    }
  }
  if (bestRole === "Officer") return null;

  return {
    kind: "ssm_filing",
    title: `Lodge change of ${bestRole} with SSM`,
    detail: `Triggered by: "${truncate(text, 160)}"`,
    dueDateOffsetDays: 14,
    source: "rule:ssm_appointment",
  };
}

const MANDATE_RE =
  /(recurrent\s+related[\s-]*party(?:\s+transactions?)?|rrpt|shareholders'?\s+mandate|share\s*buy-?back(?:\s+mandate)?)/i;

/** RRPT / recurrent related-party / shareholders' mandate / share buy-back
 * mandate → a renewal obligation, due at (approximately) the next AGM, one
 * year out. */
function matchMandateRule(text: string): RuleMatch | null {
  const match = text.match(MANDATE_RE);
  if (!match) return null;
  const matched = match[0].toLowerCase();
  let label: string;
  if (/rrpt|recurrent\s+related/.test(matched)) {
    label = "the recurrent related party transactions mandate";
  } else if (/buy-?back/.test(matched)) {
    label = "the share buy-back mandate";
  } else {
    label = "the shareholders' mandate";
  }
  return {
    kind: "mandate_renewal",
    title: `Renew ${label} before next AGM`,
    detail: `This mandate lapses at the next AGM unless renewed by ordinary resolution.`,
    dueDateOffsetDays: 365,
    source: "rule:mandate",
  };
}

/** A dividend declared/approved/recommended → process payment and lodge the
 * associated returns, due 30 days after the meeting. */
function matchDividendRule(text: string): RuleMatch | null {
  if (!/dividend/i.test(text)) return null;
  if (!/declar\w*|approv\w*|recommend\w*/i.test(text)) return null;
  return {
    kind: "dividend_payment",
    title: "Process dividend payment & lodge returns",
    detail: `Triggered by: "${truncate(text, 160)}"`,
    dueDateOffsetDays: 30,
    source: "rule:dividend",
  };
}

const CHANGE_OF_NAME_RE = /\bchange\s+of\s+name\b/i;
const CONSTITUTION_RE = /\b(amend\w*.{0,20}constitution|adopt\w*.{0,20}constitution)\b/i;

/** Change of company name, or constitution amendment/adoption → an SSM
 * filing, due 30 days after the meeting. */
function matchNameOrConstitutionRule(text: string): RuleMatch | null {
  if (CHANGE_OF_NAME_RE.test(text)) {
    return {
      kind: "ssm_filing",
      title: "Lodge the change of company name with SSM",
      detail: `Triggered by: "${truncate(text, 160)}"`,
      dueDateOffsetDays: 30,
      source: "rule:ssm_change",
    };
  }
  const constitutionMatch = text.match(CONSTITUTION_RE);
  if (constitutionMatch) {
    const label = /amend/i.test(constitutionMatch[0]) ? "the amended constitution" : "the adopted constitution";
    return {
      kind: "ssm_filing",
      title: `Lodge ${label} with SSM`,
      detail: `Triggered by: "${truncate(text, 160)}"`,
      dueDateOffsetDays: 30,
      source: "rule:ssm_change",
    };
  }
  return null;
}

const RULE_MATCHERS: ((text: string) => RuleMatch | null)[] = [
  matchAppointmentRule,
  matchMandateRule,
  matchDividendRule,
  matchNameOrConstitutionRule,
];

function toObligation(
  match: RuleMatch,
  meetingDate: string,
  resolutionIndex?: number,
): DerivedObligation {
  return {
    kind: match.kind,
    title: match.title,
    detail: match.detail,
    due_date: match.dueDateOffsetDays !== null ? addDaysIso(meetingDate, match.dueDateOffsetDays) : null,
    source: match.source,
    resolution_index: resolutionIndex,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Derives the set of downstream statutory obligations implied by a meeting's
 * decisions. Deterministic — no fabrication: every returned obligation is
 * traceable to a matched resolution, transcript sentence, action item, or the
 * always-present "confirm previous minutes" duty.
 */
export function deriveObligations(input: DeriveObligationsInput): DerivedObligation[] {
  const { meeting, resolutions, actionItems, transcriptText } = input;
  const candidates: DerivedObligation[] = [];

  // Pass 1: per-resolution matches, tied back to the originating resolution
  // via resolution_index. Only resolutions that actually carried create a
  // statutory obligation — a deferred or lapsed resolution didn't happen.
  resolutions.forEach((resolution, index) => {
    if (resolution.outcome !== "carried") return;
    for (const matcher of RULE_MATCHERS) {
      const match = matcher(resolution.resolution_text);
      if (match) {
        candidates.push(toObligation(match, meeting.meeting_date, index));
      }
    }
  });

  // Pass 2: transcript-only fallback, sentence by sentence — catches a
  // genuine trigger the extraction engine didn't turn into a formal
  // resolution. Not tied to a resolution_index. Dedup below (by kind+title,
  // first occurrence wins) means this can never create a duplicate obligation
  // alongside a resolution-based match from pass 1.
  const sentences = splitSentences(transcriptText);
  for (const sentence of sentences) {
    for (const matcher of RULE_MATCHERS) {
      const match = matcher(sentence);
      if (match) {
        candidates.push(toObligation(match, meeting.meeting_date));
      }
    }
  }

  // Every meeting, exactly once: confirm these minutes at the next meeting.
  candidates.push({
    kind: "confirm_previous",
    title: "Confirm these minutes at the next meeting",
    detail: null,
    due_date: null,
    source: "rule:confirm",
  });

  // Matters arising: one per open action item that has an owner or a due
  // date (a bare, unowned, undated action item isn't a trackable obligation).
  for (const item of actionItems) {
    if (!item.owner_name && !item.due_date) continue;
    candidates.push({
      kind: "matters_arising",
      title: `Follow up: ${truncate(item.description, 80)}`,
      detail: item.owner_name ? `Owner: ${item.owner_name}` : null,
      due_date: item.due_date,
      source: "rule:matters_arising",
    });
  }

  // Dedupe identical (kind, title) pairs, keeping the first occurrence — this
  // preserves a resolution_index from pass 1 over a resolution_index-less
  // duplicate from pass 2, since pass 1 always runs first.
  const seen = new Set<string>();
  const deduped: DerivedObligation[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}::${candidate.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}
