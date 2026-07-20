import { meetingTypeCategory, splitSentences } from "./minutes-engine";

/**
 * Deterministic, rule-based completeness/defensibility checks for a minutes
 * draft — "nothing legally required is missing."
 *
 * IMPORTANT: this file must stay framework-free (no next/*, no supabase
 * imports) so it can be unit-tested directly with `bun run <script>.ts`.
 * (It may import from ./minutes-engine, which is itself framework-free.)
 */

/**
 * `not_applicable` exists because a check that quietly returned null, or that
 * passed vacuously on an empty set, rendered identically to an earned pass —
 * "no action items" scored the same as "every action item has an owner". A
 * cosec reading 90/100 could not tell which checks had actually been done.
 * Absence must be visible, never silently favourable.
 */
export type AssuranceStatus = "pass" | "warn" | "fail" | "not_applicable";

export interface AssuranceCheck {
  key: string;
  label: string;
  status: AssuranceStatus;
  detail: string;
}

export interface AssuranceResult {
  checks: AssuranceCheck[];
  score: number;
}

export interface AssuranceMeetingInput {
  meeting_type: string;
  minutes_format?: "standard" | "maisca";
  chairperson: string | null;
  attendees: { name: string; role: string }[] | null;
  quorum_met: boolean | null;
}

export interface AssuranceResolutionInput {
  resolution_number: string | null;
  resolution_text: string;
  outcome: string;
}

export interface AssuranceActionItemInput {
  description: string;
  owner_name: string | null;
  due_date: string | null;
}

export interface RunAssuranceInput {
  meeting: AssuranceMeetingInput;
  bodyHtml: string;
  resolutions: AssuranceResolutionInput[];
  actionItems: AssuranceActionItemInput[];
  transcriptText: string;
}

const FAIL_PENALTY = 15;
const WARN_PENALTY = 5;

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

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "as",
  "with",
  "from",
  "will",
  "shall",
  "not",
  "no",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "he",
  "she",
  "they",
  "we",
  "you",
  "i",
  "his",
  "her",
  "their",
  "should",
  "would",
  "can",
  "could",
]);

function normalizeTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
  return new Set(tokens);
}

/** Fraction of `a`'s tokens that also appear in `b` (0 when `a` is empty). */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let matched = 0;
  for (const token of a) {
    if (b.has(token)) matched += 1;
  }
  return matched / a.size;
}

// ---------------------------------------------------------------------------
// Individual checks — each returns null when the check doesn't apply to this
// meeting/context (so it is omitted from both the checklist and the score).
// ---------------------------------------------------------------------------

/**
 * A quorum STATEMENT, not merely the word.
 *
 * This check used to be `/quorum/i.test(bodyText)`. The engine emits a section
 * headed "Attendance & Quorum" in every document, so the word was always
 * present and the check could essentially never fail — it validated its own
 * template. Proven on 2026-07-20: a draft with the quorum sentence deleted
 * still scored quorum = pass and finalised.
 *
 * A real statement asserts a position: that a quorum was present/met, or
 * expressly that it was not. Headings are excluded so a section title can
 * never satisfy it.
 */
function hasQuorumStatement(bodyHtml: string, bodyText: string): boolean {
  const withoutHeadings = bodyHtml.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ");
  const prose = stripHtml(withoutHeadings) || bodyText;
  const sentences = prose.split(/(?<=[.!?])\s+/);
  return sentences.some(
    (s) =>
      /quorum/i.test(s) &&
      // A definition of what WOULD constitute a quorum is a rule quoted from
      // the constitution or terms of reference — not a finding about this
      // meeting. The maisca template prints "…3 members … shall form a quorum"
      // in every document, which passed this check until 2026-07-20.
      !DEFINITIONAL_QUORUM_RE.test(s) &&
      /\b(present|met|constituted|satisfied|achieved|lacking|absent|not\s+(present|met)|no\s+quorum|inquorate)\b/i.test(
        s,
      ),
  );
}

const DEFINITIONAL_QUORUM_RE =
  /\b(shall|must|would|is\s+to)\b[^.]{0,60}\b(form|constitute|be)\b|in\s+accordance\s+with\s+the\s+(terms\s+of\s+reference|constitution|articles)/i;

function checkQuorumStated(bodyText: string, bodyHtml: string): AssuranceCheck {
  const stated = hasQuorumStatement(bodyHtml, bodyText);
  return {
    key: "quorum_stated",
    label: "Quorum stated",
    status: stated ? "pass" : "fail",
    detail: stated
      ? "The minutes state a quorum position."
      : "No statement about quorum was found in the minutes body.",
  };
}

function checkAttendanceRecorded(
  bodyText: string,
  attendees: { name: string; role: string }[] | null,
): AssuranceCheck {
  // The `/attendance/i.test(bodyText)` branch is gone. Both templates print an
  // attendance heading (standard: "Attendance & Quorum"; maisca: a table header
  // and "…thanked them for their attendance"), so the check passed on a body
  // that literally read "No attendee list was captured." Recorded attendees are
  // the only real evidence.
  const attendeeCount = attendees?.length ?? 0;
  const ok = attendeeCount > 0;
  return {
    key: "attendance_recorded",
    label: "Attendance recorded",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `${attendeeCount} attendee(s) recorded.`
      : "No attendees were recorded for this meeting.",
  };
}

function checkChairpersonNamed(bodyText: string, chairperson: string | null): AssuranceCheck {
  // The body branch is gone: maisca substitutes the literal "The Chairman" when
  // nobody was identified, and the word appears in headings and boilerplate, so
  // "chairman" in the text proved only that the template ran. It also passed on
  // "No chairman was appointed…". A named chairperson on the meeting record is
  // the evidence; the body is not.
  void bodyText;
  const ok = Boolean(chairperson && chairperson.trim().length > 0);
  return {
    key: "chairperson_named",
    label: "Chairperson named",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `Chairperson recorded: ${chairperson!.trim()}.`
      : "No chairperson is recorded for this meeting.",
  };
}

const INTEREST_DECLARATION_RE = /declar\w+ .{0,40}interest|interest.{0,40}declar/i;
/** "refused to declare his interest" must not read as a declaration. */
const DECLARATION_REFUSED_RE = /\b(refus\w+|declin\w+|fail\w+)\b[^.]{0,40}\bdeclar/i;

function checkInterestDeclarations(
  bodyText: string,
  transcriptText: string,
  category: string,
): AssuranceCheck | null {
  // Previously skipped for AGM/EGM — exactly where related-party approvals are
  // voted on. An AGM resolving to approve a purchase from the chairman's own
  // company scored 95 with this check absent from the list entirely. It now
  // runs for every category.
  void category;
  void transcriptText;
  // The statement must be in the BODY: the minutes are the statutory record.
  // A declaration discussed in the room but never minuted is precisely the
  // omission an auditor finds three years later.
  const ok = INTEREST_DECLARATION_RE.test(bodyText) && !DECLARATION_REFUSED_RE.test(bodyText);
  return {
    key: "interest_declarations",
    label: "Interest declarations",
    status: ok ? "pass" : "warn",
    detail: ok
      ? "A declaration-of-interest statement is recorded in the minutes."
      : "No declaration-of-interest statement is recorded in the minutes body.",
  };
}

function checkResolutionsPresent(
  resolutions: AssuranceResolutionInput[],
  category: string,
): AssuranceCheck | null {
  if (category !== "board" && category !== "agm" && category !== "egm" && category !== "committee") {
    return null;
  }
  const none = resolutions.length === 0;
  const status: AssuranceStatus = none ? (category === "committee" ? "warn" : "fail") : "pass";
  return {
    key: "resolutions_present",
    label: "Resolutions present",
    status,
    detail: none
      ? "No resolutions were recorded for this meeting."
      : `${resolutions.length} resolution(s) recorded.`,
  };
}

function describeResolutionOffense(r: AssuranceResolutionInput): string {
  const reasons: string[] = [];
  if (!r.resolution_number || r.resolution_number.trim().length === 0) reasons.push("missing number");
  if (!r.outcome) reasons.push("missing outcome");
  if (r.resolution_text.trim().length < 20) reasons.push("text too short");
  const label = r.resolution_number || r.resolution_text.slice(0, 40) || "(untitled resolution)";
  return `${label} (${reasons.join(", ")})`;
}

const RESOLUTION_OUTCOMES = new Set(["carried", "deferred", "lapsed", "withdrawn", "not carried"]);

function checkResolutionsWellformed(resolutions: AssuranceResolutionInput[]): AssuranceCheck {
  // No resolutions is not "all resolutions well-formed" — it is nothing to
  // check. It used to score a full pass.
  if (resolutions.length === 0) {
    return {
      key: "resolutions_wellformed",
      label: "Resolutions well-formed",
      status: "not_applicable",
      detail: "No resolutions were recorded, so there is nothing to check.",
    };
  }
  const offenders = resolutions.filter(
    (r) =>
      !r.resolution_number ||
      r.resolution_number.trim().length === 0 ||
      !r.outcome ||
      !RESOLUTION_OUTCOMES.has(r.outcome.trim().toLowerCase()) ||
      r.resolution_text.trim().length < 20,
  );
  return {
    key: "resolutions_wellformed",
    label: "Resolutions well-formed",
    status: offenders.length > 0 ? "fail" : "pass",
    detail:
      offenders.length > 0
        ? `Malformed resolution(s): ${offenders.map(describeResolutionOffense).join("; ")}`
        : "All resolutions carry a number, an outcome, and sufficient detail.",
  };
}

const UNDERTAKING_VERB_RE =
  /\b(?:will|shall|to)\s+(?:circulate|prepare|submit|file|finalise|finalize|arrange|confirm|send|provide|update|review)\b/i;
const UNDERTAKING_LABEL_RE = /^action[:\s]/i;

function checkUndertakingsCovered(
  transcriptText: string,
  actionItems: AssuranceActionItemInput[],
): AssuranceCheck {
  const sentences = splitSentences(transcriptText);
  const undertakings = sentences.filter(
    (sentence) => UNDERTAKING_VERB_RE.test(sentence) || UNDERTAKING_LABEL_RE.test(sentence),
  );

  const actionTokenSets = actionItems.map((item) =>
    normalizeTokens(`${item.description} ${item.owner_name ?? ""}`),
  );

  const uncovered = undertakings.filter((sentence) => {
    const tokens = normalizeTokens(sentence);
    return !actionTokenSets.some((actionTokens) => tokenOverlap(tokens, actionTokens) >= 0.5);
  });

  return {
    key: "undertakings_covered",
    label: "Undertakings covered by action items",
    status: uncovered.length > 0 ? "fail" : "pass",
    detail:
      uncovered.length > 0
        ? `Undertaking(s) in the transcript with no matching action item: ${uncovered
            .map((s) => `"${s.trim()}"`)
            .join("; ")}`
        : undertakings.length > 0
          ? `All ${undertakings.length} undertaking(s) found in the transcript are covered by an action item.`
          : "No undertakings requiring action-item coverage were found in the transcript.",
  };
}

/** The engine's own placeholder — it names nobody, so it is not an owner. */
const PLACEHOLDER_OWNER_RE = /^(unassigned|tbc|tbd|n\/?a|-{1,2}|none)$/i;

function checkActionsHaveOwners(actionItems: AssuranceActionItemInput[]): AssuranceCheck {
  if (actionItems.length === 0) {
    return {
      key: "actions_have_owners",
      label: "Action items have owners",
      status: "not_applicable",
      detail: "No action items were recorded, so there is nothing to check.",
    };
  }
  const missing = actionItems.filter(
    (a) =>
      !a.owner_name ||
      a.owner_name.trim().length === 0 ||
      PLACEHOLDER_OWNER_RE.test(a.owner_name.trim()),
  );
  return {
    key: "actions_have_owners",
    label: "Action items have owners",
    status: missing.length > 0 ? "warn" : "pass",
    detail:
      missing.length > 0
        ? `Action item(s) missing an owner: ${missing.map((a) => `"${a.description}"`).join("; ")}`
        : "All action items have an owner assigned.",
  };
}

function checkActionsHaveDates(actionItems: AssuranceActionItemInput[]): AssuranceCheck {
  if (actionItems.length === 0) {
    return {
      key: "actions_have_dates",
      label: "Action items have due dates",
      status: "not_applicable",
      detail: "No action items were recorded, so there is nothing to check.",
    };
  }
  const missing = actionItems.filter((a) => !a.due_date || a.due_date.trim().length === 0);
  return {
    key: "actions_have_dates",
    label: "Action items have due dates",
    status: missing.length > 0 ? "warn" : "pass",
    detail:
      missing.length > 0
        ? `Action item(s) missing a due date: ${missing.map((a) => `"${a.description}"`).join("; ")}`
        : "All action items have a due date.",
  };
}

const PREVIOUS_MINUTES_MENTIONED_RE =
  /previous (?:meeting|minutes)|minutes of the .{0,40}meeting/i;
/**
 * The bare `|confirmed` fallback is gone. It matched the standard template's
 * own quorum boilerplate ("…was present and confirmed at the outset"), and any
 * unrelated sentence such as "The auditor confirmed the bank balance" — so a
 * body that never mentioned the previous minutes still passed. Confirmation of
 * previous minutes is a specific statutory act and must be phrased as one.
 */
const PREVIOUS_MINUTES_CONFIRMED_RE =
  /(?:previous (?:meeting|minutes)|minutes of the [^.]{0,40}meeting)[^.]{0,80}\bconfirm(?:ed)?\b|\bconfirm(?:ed)?\b[^.]{0,60}(?:as a (?:true and )?correct record|previous (?:meeting|minutes))/i;

function checkPreviousMinutesConfirmed(
  bodyText: string,
  transcriptText: string,
): AssuranceCheck | null {
  if (!PREVIOUS_MINUTES_MENTIONED_RE.test(transcriptText)) return null;
  const confirmed = PREVIOUS_MINUTES_CONFIRMED_RE.test(bodyText);
  return {
    key: "previous_minutes_confirmed",
    label: "Previous minutes confirmed",
    status: confirmed ? "pass" : "warn",
    detail: confirmed
      ? "The minutes record confirmation of the previous meeting's minutes."
      : "The transcript refers to previous minutes, but the minutes body does not record confirmation of them.",
  };
}

function checkCloseRecorded(bodyText: string): AssuranceCheck {
  // Negation-blind before: "The meeting was not closed; members walked out and
  // no adjournment was moved" passed, as did "members held a closed session".
  // Require a statement that the MEETING closed, and reject negated forms.
  const NEGATED_CLOSE_RE =
    /\b(?:not|never|no)\b[^.]{0,30}\b(?:clos(?:ed|ure)|adjourn(?:ed|ment)?)\b|\b(?:clos(?:ed)?|adjourn(?:ed)?)\b[^.]{0,20}\bnot\b/i;
  const AFFIRMED_CLOSE_RE =
    /\b(?:meeting|proceedings)\b[^.]{0,60}\b(?:was|were|is|stood)?\s*(?:clos(?:ed)?|adjourn(?:ed)?|declared closed|terminated)\b|there being no (?:other|further) business[^.]{0,60}\b(?:clos|adjourn)/i;
  const closed = AFFIRMED_CLOSE_RE.test(bodyText) && !NEGATED_CLOSE_RE.test(bodyText);
  return {
    key: "close_recorded",
    label: "Meeting close recorded",
    status: closed ? "pass" : "warn",
    detail: closed
      ? "The minutes record the close/adjournment of the meeting."
      : "No closing or adjournment statement was found in the minutes body.",
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runAssurance(input: RunAssuranceInput): AssuranceResult {
  const { meeting, bodyHtml, resolutions, actionItems, transcriptText } = input;
  const bodyText = stripHtml(bodyHtml);
  const category = meetingTypeCategory(meeting.meeting_type);

  const checks: AssuranceCheck[] = [];

  checks.push(checkQuorumStated(bodyText, bodyHtml));
  checks.push(checkAttendanceRecorded(bodyText, meeting.attendees));
  checks.push(checkChairpersonNamed(bodyText, meeting.chairperson));

  const interestCheck = checkInterestDeclarations(bodyText, transcriptText, category);
  if (interestCheck) checks.push(interestCheck);

  const resolutionsPresentCheck = checkResolutionsPresent(resolutions, category);
  if (resolutionsPresentCheck) checks.push(resolutionsPresentCheck);

  checks.push(checkResolutionsWellformed(resolutions));
  checks.push(checkUndertakingsCovered(transcriptText, actionItems));
  checks.push(checkActionsHaveOwners(actionItems));
  checks.push(checkActionsHaveDates(actionItems));

  const previousMinutesCheck = checkPreviousMinutesConfirmed(bodyText, transcriptText);
  if (previousMinutesCheck) checks.push(previousMinutesCheck);

  checks.push(checkCloseRecorded(bodyText));

  let score = 100;
  for (const check of checks) {
    if (check.status === "fail") score -= FAIL_PENALTY;
    else if (check.status === "warn") score -= WARN_PENALTY;
  }
  score = Math.max(0, score);

  return { checks, score };
}
