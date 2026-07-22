import type { GeneratedMinutes, Meeting } from "./types";

/**
 * Deterministic, rule-based statutory-minutes extraction engine.
 *
 * IMPORTANT: this file must stay framework-free (no next/*, no supabase
 * imports) so it can be unit-tested directly with `bun run <script>.ts`.
 */

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

// Abbreviations whose trailing period must never be treated as a sentence
// boundary (e.g. "Mr. Lim seconded." should not split after "Mr.").
const ABBREVIATIONS = [
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Prof",
  "Messrs",
  "St",
  "Sdn",
  "Bhd",
  "Datin",
  "Dato",
  "Tan",
  "Puan",
  "Encik",
  "Capt",
  "Col",
  "Gen",
  "Hon",
  "Jr",
  "Sr",
  "vs",
  "etc",
  "No",
];

const DOT_PLACEHOLDER = " DOT ";

function protectAbbreviations(text: string): string {
  let out = text;
  for (const abbr of ABBREVIATIONS) {
    const re = new RegExp(`\\b${abbr}\\.`, "g");
    out = out.replace(re, `${abbr}${DOT_PLACEHOLDER}`);
  }
  // "Dato'" is sometimes written "Dato' " with no trailing period — nothing to
  // protect there, but guard the possessive-apostrophe form anyway in case it
  // is followed by a period from truncation ("Dato'.").
  out = out.replace(/Dato'\./g, `Dato'${DOT_PLACEHOLDER}`);
  return out;
}

function restoreAbbreviations(text: string): string {
  return text.split(DOT_PLACEHOLDER).join(".");
}

/**
 * Split transcript text into sentences.
 * - Splits on . ! ? followed by whitespace + a capital letter (or end of text).
 * - Known abbreviations (Mr/Ms/Dato'/Sdn/Bhd/...) never trigger a split.
 * - Falls back to newline splitting for blocks with no terminal punctuation.
 */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n+/);
  const sentences: string[] = [];

  for (const block of blocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const protectedBlock = protectAbbreviations(trimmedBlock);
    // Split, keeping the terminal punctuation attached to the preceding
    // sentence, on punctuation followed by whitespace + an uppercase letter.
    const parts = protectedBlock.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);

    for (const part of parts) {
      const restored = restoreAbbreviations(part).trim();
      if (restored) sentences.push(restored);
    }
  }

  return sentences;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordCount(sentence: string): number {
  const matches = sentence.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function stripSpeakerLabel(sentence: string): string {
  // "Chairman: I call this meeting to order..." -> "I call this meeting to order..."
  return sentence.replace(/^[A-Za-z][A-Za-z'.\s]{0,30}:\s*/, "").trim();
}

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function parseDueDate(sentence: string): string | null {
  // "by 30 June 2025"
  const named = sentence.match(/\bby\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i);
  if (named) {
    const day = named[1].padStart(2, "0");
    const month = MONTH_MAP[named[2].toLowerCase()];
    const year = named[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // "by 2025-06-30"
  const iso = sentence.match(/\bby\s+(\d{4})-(\d{2})-(\d{2})\b/i);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  // "by 30/6/2025" or "by 30-06-2025" (day/month/year, Malaysian convention)
  const numeric = sentence.match(/\bby\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/i);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    const year = numeric[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolutions
// ---------------------------------------------------------------------------

// Includes the outcome-only verbs (deferred/postponed/tabled) alongside the
// classic approval verbs so that deferral decisions ("...was deferred
// pending...") are recognised as resolutions in their own right, not just as
// an outcome label on an already-matched sentence.
const RESOLUTION_KEYWORDS_RE =
  /\b(resolved|resolution|approved|carried|passed|agreed to approve|deferred|postponed|tabled)\b/i;

const SUBSTANTIVE_MIN_WORDS = 5;

// Sentences that are purely reporting discussion ("Directors discussed...",
// "Legal counsel summarised...") rather than a decision. These must never be
// treated as resolutions, and must never be tracked as the "proposal"
// antecedent for a later fragment outcome like "Carried."
const DISCUSSION_VERBS_RE =
  /\b(discussed|considered|noted|reviewed|presented|summarised|summarized|deliberated)\b/i;

function isDiscussionOnly(sentence: string): boolean {
  return DISCUSSION_VERBS_RE.test(sentence) && !RESOLUTION_KEYWORDS_RE.test(sentence);
}

// Agenda-header / narrative-navigation fragments ("First item, ...", "Next,
// ...", "Moving to agenda item 3 ...") are meeting-narrative, never
// resolutions, and must never be used as the antecedent for a fragment
// outcome such as "Carried."
const AGENDA_HEADER_ONLY_RE =
  /^(?:first|second|third|fourth|fifth|sixth)\s+item\b|^next\s+item\b|^next,|^moving\s+(?:on\s+)?to\b|^turning\s+to\b|^agenda\s+item\s*\d+/i;

function isAgendaHeaderFragment(sentence: string): boolean {
  return AGENDA_HEADER_ONLY_RE.test(stripSpeakerLabel(sentence));
}

// Call-to-order / quorum / adjournment housekeeping belongs to the
// Attendance & Quorum context, not the Deliberations narrative.
const PROCEDURAL_FILLER_RE =
  /\b(?:call(?:ed)?\s+(?:the|this)\s+(?:\w+\s+){0,4}meeting\s+to\s+order|meeting\s+(?:is|was)\s+called\s+to\s+order|good\s+morning|good\s+afternoon|good\s+evening|quorum\s+(?:is|was|has\s+been)?\s*(?:present|confirmed|met)|directors?\s+(?:are|is|were)\s+present|meeting\s+(?:was\s+|is\s+)?(?:closed|adjourned)|adjourn(?:ed|ment)|meeting\s+commenced|call\s+to\s+order)\b/i;

function isProceduralFiller(sentence: string): boolean {
  return PROCEDURAL_FILLER_RE.test(sentence);
}

// Leading discourse markers that precede the actual resolution clause and
// must be stripped before the clause is rewritten, so they don't get
// double-wrapped inside "RESOLVED that ..." or mistaken for the resolution
// text itself (e.g. "After deliberation, it was resolved that X" -> "X";
// "Third item, X was deferred" -> "X be deferred").
const LEADING_DISCOURSE_MARKERS: RegExp[] = [
  /^after\s+(?:deliberation|discussion|due\s+consideration|careful\s+consideration|consideration)s?,?\s+/i,
  /^(?:first|second|third|fourth|fifth|sixth)\s+item,?\s+/i,
  /^next\s+item,?\s+/i,
  /^next,\s+/i,
  /^moving\s+(?:on\s+)?to\s+agenda\s+item\s*\d*\s*[-—,:]?\s*/i,
  /^agenda\s+item\s*\d*\s*[-—,:]?\s*/i,
  // Topic prefixes: "On the launch timeline, it was resolved that…",
  // "On marketing collateral, the meeting agreed to…". Left in place these
  // both pollute the clause AND block the "it was resolved that" unwrap
  // (which is anchored to the start), producing a double "RESOLVED that …
  // it was resolved that …". Bounded to a short phrase before the comma so
  // a genuine clause that merely starts with "on" isn't eaten.
  /^on\s+(?:the\s+)?[^,]{2,45},\s+/i,
  /^regarding\s+(?:the\s+)?[^,]{2,45},\s+/i,
  /^turning\s+to\s+(?:the\s+)?[^,]{2,45},\s+/i,
  /^as\s+(?:to|for|regards)\s+(?:the\s+)?[^,]{2,45},\s+/i,
  /^with\s+(?:regard|respect)\s+to\s+(?:the\s+)?[^,]{2,45},\s+/i,
  /^in\s+relation\s+to\s+(?:the\s+)?[^,]{2,45},\s+/i,
];

function stripLeadingDiscourseMarkers(sentence: string): string {
  let out = sentence.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of LEADING_DISCOURSE_MARKERS) {
      if (re.test(out)) {
        out = out.replace(re, "");
        changed = true;
      }
    }
  }
  return out.trim();
}

/**
 * Statutory minutes phrase decisions in the subjunctive ("that X be
 * approved"), not the indicative ("X was approved"). When a sentence carries
 * its decision verb in past-tense passive voice (typically because it had no
 * "resolved that" lead-in of its own, e.g. a bare deferral sentence), convert
 * it to the subjunctive form expected inside a "RESOLVED that ..." clause.
 */
function normalizeDecisionVerbTense(text: string): string {
  return text.replace(
    /\b(?:was|were)\s+(deferred|postponed|tabled|approved|rejected|carried|adopted)\b/gi,
    (_match, verb: string) => `be ${verb.toLowerCase()}`,
  );
}

function detectOutcome(sentence: string): "carried" | "deferred" | "lapsed" {
  if (/\b(defer|postpon|tabled)\w*\b/i.test(sentence)) return "deferred";
  if (/\b(laps\w*|rejected|not carried|defeated)\b/i.test(sentence)) return "lapsed";
  return "carried";
}

/**
 * Detects whether a resolution sentence explicitly identifies itself as an
 * "ordinary resolution" or "special resolution" (statutory AGM/EGM
 * terminology). Returns null when the transcript doesn't say so — callers
 * fall back to a generic label in that case.
 */
function detectResolutionKind(sentence: string): "ordinary" | "special" | null {
  if (/\bspecial\s+resolution\b/i.test(sentence)) return "special";
  if (/\bordinary\s+resolution\b/i.test(sentence)) return "ordinary";
  return null;
}

function resolutionConfidence(sentence: string): number {
  if (/\bresolved\b/i.test(sentence)) return 0.9;
  if (/\b(carried|passed)\b/i.test(sentence)) return 0.82;
  return 0.7; // approved / agreed to approve only
}

function toPastParticiple(verb: string): string {
  const lower = verb.toLowerCase();
  if (lower.endsWith("e")) return `${lower}d`;
  return `${lower}ed`;
}

/** Lowercase the first letter unless the leading word looks like an acronym/proper noun. */
function lowerFirstLetter(text: string): string {
  if (!text) return text;
  const rawFirstWord = text.split(/\s+/)[0] ?? "";
  const firstWord = rawFirstWord.replace(/[^A-Za-z']/g, "");
  if (!firstWord) return text;
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  const isKnownProperNoun = ABBREVIATIONS.includes(firstWord);
  if (isAcronym || isKnownProperNoun) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Turn the remainder of a "resolved that/to ..." sentence into a clean clause. */
function toResolutionClause(remainder: string): string {
  let clause = remainder.trim().replace(/\.$/, "");

  const toVerbMatch = clause.match(/^to\s+([A-Za-z]+)\b\s*(.*)$/i);
  if (toVerbMatch) {
    const participle = toPastParticiple(toVerbMatch[1]);
    const rest = toVerbMatch[2].trim();
    if (!rest || /^(?:subject\s+to|pending|in\s+principle|accordingly|unanimously)\b/i.test(rest)) {
      // No object of its own ("to approve subject to ...") — statutory
      // shorthand keeps "the same" as the subject.
      clause = `the same be ${participle}${rest ? ` ${rest}` : ""}`;
    } else {
      // Object-bearing form: "to approve the gala budget subject to X"
      // -> "the gala budget be approved subject to X".
      const condMatch = rest.match(/^(.*?)(\s+(?:subject\s+to|pending)\b.*)$/i);
      if (condMatch) {
        clause = `${condMatch[1].trim()} be ${participle}${condMatch[2]}`;
      } else {
        clause = `${rest} be ${participle}`;
      }
    }
  }

  return lowerFirstLetter(clause);
}

/** Build a resolution clause for a sentence that itself contains "resolved"/"resolution". */
function selfContainedResolutionClause(sentence: string): string {
  // Strip speaker labels ("Chairman: ...") and leading discourse/agenda
  // markers ("After deliberation, ...", "Third item, ...") BEFORE looking
  // for the "it was resolved that" lead-in, otherwise the lead-in check
  // (anchored to the start of the string) misses it and the whole sentence
  // — including the embedded "it was resolved that" — gets wrapped again,
  // producing a double "RESOLVED that ... resolved that ..." clause.
  const cleaned = stripLeadingDiscourseMarkers(stripSpeakerLabel(sentence));

  // Subject-prefixed forms ("The Committee resolved to ...", "The Board
  // unanimously resolved that ...") must shed their subject before the
  // lead-in check, or the whole sentence gets re-wrapped into
  // "RESOLVED that the Committee resolved to ...".
  const resolvedThatRe =
    /^(?:the\s+(?:committee|board|meeting|members)\s+(?:unanimously\s+)?)?(?:it\s+was\s+resolved\s+that|resolved\s+that)\s+/i;
  const resolvedToRe =
    /^(?:the\s+(?:committee|board|meeting|members)\s+(?:unanimously\s+)?)?(?:it\s+was\s+resolved\s+to|resolved\s+to|agreed\s+to)\s+/i;

  let remainder: string;
  if (resolvedThatRe.test(cleaned)) {
    remainder = cleaned.replace(resolvedThatRe, "");
  } else if (resolvedToRe.test(cleaned)) {
    remainder = `to ${cleaned.replace(resolvedToRe, "")}`;
  } else {
    remainder = cleaned;
  }

  remainder = normalizeDecisionVerbTense(remainder);

  return toResolutionClause(remainder);
}

/**
 * Build a resolution clause from a preceding "substantive" sentence, used when
 * the actual resolution-keyword sentence is a bare outcome fragment like
 * "Carried unanimously." with no clause of its own.
 */
function clauseFromProposalSentence(sentence: string): string {
  const cleaned = stripSpeakerLabel(sentence).replace(/\.$/, "");

  const proposalRe =
    /^[A-Za-z][A-Za-z'.\s]{0,40}?\s+(?:proposed|moved|suggested|recommended)\s+(?:that\s+)?(.*)$/i;
  const match = cleaned.match(proposalRe);

  let rest = match ? match[1].trim() : cleaned;
  rest = rest.replace(/^we\s+/i, "the Board ");

  const verbMatch = rest.match(/^(the Board)\s+([A-Za-z]+)\b(.*)$/i);
  if (verbMatch) {
    const verb = verbMatch[2].toLowerCase();
    const conjugated = verb.endsWith("e") ? `${verb}s` : `${verb}s`;
    rest = `${verbMatch[1]} ${conjugated}${verbMatch[3]}`;
  }

  return lowerFirstLetter(rest);
}

interface ExtractedResolution {
  text: string;
  outcome: "carried" | "deferred" | "lapsed";
  confidence: number;
  sourceSentenceIndex: number;
  kind: "ordinary" | "special" | null;
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

const ACTION_RE_LABEL = /^action[:\s]/i;
const ACTION_RE_TO = /\baction\b.*\bto\b/i;
const ACTION_RE_VERB =
  /\b(to|will|shall)\s+(finalise|finalize|circulate|prepare|submit|file|arrange|follow up|review|update|send)\b/i;

function isActionSentence(sentence: string): boolean {
  return (
    ACTION_RE_LABEL.test(sentence) ||
    ACTION_RE_TO.test(sentence) ||
    ACTION_RE_VERB.test(sentence)
  );
}

interface ExtractedActionItem {
  description: string;
  owner: string | null;
  dueDate: string | null;
  confidence: number;
}

function extractActionItem(sentence: string): ExtractedActionItem {
  let working = stripSpeakerLabel(sentence);
  if (ACTION_RE_LABEL.test(working)) {
    working = working.replace(ACTION_RE_LABEL, "").trim();
  }

  const dueDate = parseDueDate(working);

  let owner: string | null = null;
  let description = working;
  const toIndex = working.search(/\s+to\s+/i);
  if (toIndex > 0) {
    const candidate = working.slice(0, toIndex).trim();
    // Only treat as an owner if it looks like a short name/role phrase, not a
    // full clause (heuristic: <= 5 words).
    if (candidate && wordCount(candidate) <= 5) {
      owner = candidate;
      const rest = working.slice(toIndex).replace(/^\s*to\s+/i, "").trim();
      if (rest) {
        description = rest.charAt(0).toUpperCase() + rest.slice(1);
      }
    }
  }

  let confidence: number;
  if (owner && dueDate) {
    confidence = 0.85;
  } else if (owner) {
    confidence = 0.78;
  } else {
    confidence = 0.7;
  }

  return {
    description,
    owner,
    dueDate,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Resolution numbering
// ---------------------------------------------------------------------------

export function resolutionNumberPrefix(meetingType: string): string {
  const t = meetingType.toLowerCase();
  if (t.includes("audit")) return "AC";
  if (t.includes("agm") || t.includes("annual general")) return "AGM";
  if (t.includes("egm") || t.includes("extraordinary")) return "EGM";
  if (t.includes("board")) return "BD";
  return "RES";
}

export function autoNumberResolutions(
  meetingType: string,
  meetingDate: string,
  count: number,
): string[] {
  const prefix = resolutionNumberPrefix(meetingType);
  const year = (meetingDate ? new Date(meetingDate).getFullYear() : new Date().getFullYear()) || new Date().getFullYear();
  const numbers: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    numbers.push(`${prefix}-${year}-${String(i).padStart(2, "0")}`);
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// Meeting-type templates
// ---------------------------------------------------------------------------
//
// A small typed config map + template functions (not string spaghetti). Each
// meeting type category carries just the handful of knobs that vary between
// statutory minute styles: how the heading reads, what the narrative section
// is called, how a resolution is labelled, how quorum/attendance are worded.
// "Board" behaviour is unchanged from before this config existed — it is the
// implicit default whenever a meeting_type string doesn't match a more
// specific category (Audit Committee / AGM / EGM), with "committee" as an
// explicit named fallback profile for generic (non-Board) committee meetings.

export type MeetingTypeCategory = "board" | "committee" | "audit" | "agm" | "egm";

export interface MeetingTypeProfile {
  category: MeetingTypeCategory;
  /** Heading of the "2. ..." narrative/deliberations section. */
  narrativeHeading: string;
  /** Generic label for a resolution section, e.g. "Resolution" or "Matter Noted". */
  resolutionNounSingular: string;
  /** Who a quorum sentence refers to, e.g. "directors", "members". */
  quorumSubjectPlural: string;
  /** AGM/EGM statutory style: "MINUTES OF THE <TYPE> OF <COMPANY>" in caps. */
  useFormalCapsHeading: boolean;
  /** AGM/EGM: collapse the attendee list to a shareholders/proxies statement
   *  when attendee roles look like shareholders/proxies rather than directors. */
  useShareholderAttendanceLabel: boolean;
}

const MEETING_TYPE_PROFILES: Record<MeetingTypeCategory, MeetingTypeProfile> = {
  board: {
    category: "board",
    narrativeHeading: "Deliberations",
    resolutionNounSingular: "Resolution",
    quorumSubjectPlural: "directors",
    useFormalCapsHeading: false,
    useShareholderAttendanceLabel: false,
  },
  committee: {
    category: "committee",
    narrativeHeading: "Deliberations",
    resolutionNounSingular: "Resolution",
    quorumSubjectPlural: "directors",
    useFormalCapsHeading: false,
    useShareholderAttendanceLabel: false,
  },
  audit: {
    category: "audit",
    narrativeHeading: "Matters Reviewed and Noted",
    resolutionNounSingular: "Matter Noted",
    quorumSubjectPlural: "Committee members",
    useFormalCapsHeading: false,
    useShareholderAttendanceLabel: false,
  },
  agm: {
    category: "agm",
    narrativeHeading: "Business of the Meeting",
    resolutionNounSingular: "Resolution",
    quorumSubjectPlural: "members",
    useFormalCapsHeading: true,
    useShareholderAttendanceLabel: true,
  },
  egm: {
    category: "egm",
    narrativeHeading: "Business of the Meeting",
    resolutionNounSingular: "Resolution",
    quorumSubjectPlural: "members",
    useFormalCapsHeading: true,
    useShareholderAttendanceLabel: true,
  },
};

/** Same precedence as {@link resolutionNumberPrefix}: audit, agm, egm, board, else committee. */
export function meetingTypeCategory(meetingType: string): MeetingTypeCategory {
  const t = meetingType.toLowerCase();
  if (t.includes("audit")) return "audit";
  if (t.includes("agm") || t.includes("annual general")) return "agm";
  if (t.includes("egm") || t.includes("extraordinary")) return "egm";
  if (t.includes("board")) return "board";
  return "committee";
}

export function resolveMeetingTypeProfile(meetingType: string): MeetingTypeProfile {
  return MEETING_TYPE_PROFILES[meetingTypeCategory(meetingType)];
}

/**
 * Human-readable guidance for the given meeting type, describing numbering
 * convention, section expectations, and statutory phrasing. Shared by the
 * rule-based engine (for its own HTML templates) and the OpenAI system
 * prompt (so both paths describe the same statutory conventions per type).
 */
export function meetingTypeGuidance(meetingType: string): string {
  const profile = resolveMeetingTypeProfile(meetingType);
  const prefix = resolutionNumberPrefix(meetingType);
  const lines = [
    `Resolution numbers use the prefix "${prefix}-<year>-<seq>".`,
    `The narrative section (after Attendance & Quorum) should be headed "${profile.narrativeHeading}".`,
    `Label each decision section "${profile.resolutionNounSingular}" unless the transcript explicitly calls it an ordinary or special resolution.`,
    `Quorum wording should refer to "${profile.quorumSubjectPlural}" (e.g. "A quorum of ${profile.quorumSubjectPlural} was present...").`,
  ];
  if (profile.useFormalCapsHeading) {
    lines.push(
      `The top heading should read "MINUTES OF THE <MEETING TYPE> OF <COMPANY NAME>" in upper case, statutory style.`,
    );
  }
  if (profile.useShareholderAttendanceLabel) {
    lines.push(
      `If attendees are shareholders/proxies rather than directors, the Attendance & Quorum section should state "Present: shareholders and proxies as per attendance records." instead of listing individuals.`,
    );
  }
  if (profile.category === "agm" || profile.category === "egm") {
    lines.push(
      `When the transcript identifies a resolution as an "ordinary resolution" or "special resolution", number and label it accordingly (e.g. "Special Resolution").`,
    );
  }
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Quorum detection
// ---------------------------------------------------------------------------

/**
 * Whether the minutes may assert that a quorum was present.
 *
 * The fallback used to be `true`: if neither the transcript nor the cosec
 * said anything about quorum, the engine wrote "A quorum of directors was
 * present and confirmed at the outset" into a statutory document as fact —
 * a legally meaningful assertion nobody had made. The assurance check then
 * found that sentence and passed, so the app fabricated the very statement
 * it went on to verify. Proven 2026-07-20 with a transcript that never
 * mentioned quorum.
 *
 * Callers now pass `meeting.quorum_met ?? false`, so an unconfirmed quorum
 * produces the honest sentence ("proceeded without a confirmed quorum; this
 * should be reviewed before finalisation") instead of a comfortable lie.
 */
function detectQuorumMet(transcriptText: string, fallback: boolean): boolean {
  if (/quorum.{0,40}(present|confirmed|met)/i.test(transcriptText)) {
    return true;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function renderAttendanceList(meeting: Meeting): string {
  const attendees = meeting.attendees ?? [];
  if (attendees.length === 0) {
    return "<p>No attendee list was captured for this meeting.</p>";
  }
  const items = attendees
    .map((a) => `<li>${escapeHtml(a.name)} &mdash; ${escapeHtml(a.role)}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

const SHAREHOLDER_ROLE_RE = /\b(shareholder|proxy|proxies)\b/i;

/**
 * AGM/EGM statutory minutes conventionally record shareholder/proxy
 * attendance as a single statement referencing attendance records rather
 * than an itemised director-style list. Falls back to the itemised list for
 * any other profile, or when the attendee roles don't look like
 * shareholders/proxies.
 */
function renderAttendanceSection(meeting: Meeting, profile: MeetingTypeProfile): string {
  const attendees = meeting.attendees ?? [];
  if (profile.useShareholderAttendanceLabel && attendees.some((a) => SHAREHOLDER_ROLE_RE.test(a.role))) {
    return "<p>Present: shareholders and proxies as per attendance records.</p>";
  }
  return renderAttendanceList(meeting);
}

/** "Minutes of {type}" as-is for Board/Committee/Audit; upper-case statutory form for AGM/EGM. */
function renderHeadingHtml(meeting: Meeting, profile: MeetingTypeProfile): string {
  if (profile.useFormalCapsHeading) {
    return `<h2>MINUTES OF THE ${escapeHtml(meeting.meeting_type.toUpperCase())} OF ${escapeHtml(
      meeting.company_name.toUpperCase(),
    )}</h2>`;
  }
  return `<h2>Minutes of ${escapeHtml(meeting.meeting_type)}</h2>`;
}

function renderQuorumSentence(profile: MeetingTypeProfile, quorumMet: boolean): string {
  if (!quorumMet) {
    return "The meeting proceeded without a confirmed quorum; this should be reviewed before finalisation.";
  }
  return `A quorum of ${profile.quorumSubjectPlural} was present and confirmed at the outset of the meeting.`;
}

/** "Resolution" / "Matter Noted" by default; "Ordinary/Special Resolution" for AGM/EGM when the transcript says so. */
function renderResolutionLabel(profile: MeetingTypeProfile, kind: "ordinary" | "special" | null): string {
  if ((profile.category === "agm" || profile.category === "egm") && kind) {
    return kind === "special" ? "Special Resolution" : "Ordinary Resolution";
  }
  return profile.resolutionNounSingular;
}

function chunkNarrative(sentences: string[]): string[] {
  if (sentences.length === 0) {
    return ["No substantive deliberations were recorded from the transcript."];
  }
  const numParagraphs =
    sentences.length <= 2 ? 1 : Math.min(4, Math.max(2, Math.ceil(sentences.length / 3)));
  const chunkSize = Math.ceil(sentences.length / numParagraphs);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    paragraphs.push(sentences.slice(i, i + chunkSize).join(" "));
  }
  return paragraphs;
}

// ---------------------------------------------------------------------------
// Pass 1: classification
// ---------------------------------------------------------------------------
//
// Every sentence is classified exactly once, up front, into the bucket that
// determines which later pass owns it. This replaces the old single
// interleaved forEach with four explicit, sequential passes over the same
// classification, which makes the "why is this sentence here" question
// answerable by reading one function instead of tracing mutable state
// through a single loop.

type SentenceClass =
  | "procedural"
  | "discussion"
  | "decision-candidate"
  | "action-candidate"
  | "outcome-fragment"
  | "narrative";

interface ClassifiedSentence {
  index: number;
  sentence: string;
  cls: SentenceClass;
  /** Only meaningful when cls === "narrative": is this an agenda-header/navigation fragment? */
  isAgendaHeader: boolean;
  /** Only meaningful when cls === "narrative": eligible to be the antecedent for a later outcome-fragment. */
  isCandidateEligible: boolean;
}

function classifySentence(
  sentence: string,
): Pick<ClassifiedSentence, "cls" | "isAgendaHeader" | "isCandidateEligible"> {
  if (isActionSentence(sentence)) {
    return { cls: "action-candidate", isAgendaHeader: false, isCandidateEligible: false };
  }

  if (RESOLUTION_KEYWORDS_RE.test(sentence)) {
    const isSelfContained =
      /\bresolved\b/i.test(sentence) || wordCount(sentence) >= SUBSTANTIVE_MIN_WORDS;
    return {
      cls: isSelfContained ? "decision-candidate" : "outcome-fragment",
      isAgendaHeader: false,
      isCandidateEligible: false,
    };
  }

  if (isProceduralFiller(sentence)) {
    return { cls: "procedural", isAgendaHeader: false, isCandidateEligible: false };
  }

  if (isDiscussionOnly(sentence)) {
    return { cls: "discussion", isAgendaHeader: false, isCandidateEligible: false };
  }

  const isAgendaHeader = isAgendaHeaderFragment(sentence);
  const isCandidateEligible = !isAgendaHeader && wordCount(sentence) >= SUBSTANTIVE_MIN_WORDS;
  return { cls: "narrative", isAgendaHeader, isCandidateEligible };
}

function classifySentences(sentences: string[]): ClassifiedSentence[] {
  return sentences.map((sentence, index) => ({
    index,
    sentence,
    ...classifySentence(sentence),
  }));
}

// ---------------------------------------------------------------------------
// Pass 2: resolve fragments + antecedents, build resolutions
// ---------------------------------------------------------------------------

function extractResolutions(
  classified: ClassifiedSentence[],
  consumedIndices: Set<number>,
): ExtractedResolution[] {
  const resolutions: ExtractedResolution[] = [];

  // Tracks the nearest preceding sentence that is itself a valid resolution
  // candidate (a real proposal/decision sentence) — used to resolve bare
  // outcome fragments like "Carried." or "Carried unanimously." that have no
  // clause of their own. Discussion-only sentences, agenda-header fragments,
  // and procedural filler are deliberately excluded from ever becoming this
  // antecedent (they are never classified "narrative"/candidate-eligible),
  // otherwise a fragment can attach to the wrong sentence (e.g. "second
  // item, appointment of external auditors" or "directors discussed the
  // funding structure").
  let lastCandidate: { sentence: string; index: number } | null = null;

  // When a bare outcome fragment ("Carried.") immediately follows a
  // decision-candidate that already produced a resolution, it is that
  // resolution's outcome — update it in place instead of attaching the
  // fragment to an older narrative sentence and fabricating a duplicate.
  let lastPushedWasDecision = false;

  for (const { index, sentence, cls, isCandidateEligible } of classified) {
    if (cls === "decision-candidate" || cls === "outcome-fragment") {
      if (cls === "outcome-fragment" && lastPushedWasDecision && resolutions.length > 0) {
        const last = resolutions[resolutions.length - 1];
        last.outcome = detectOutcome(sentence);
        last.confidence = Math.max(last.confidence, resolutionConfidence(sentence));
        consumedIndices.add(index);
        continue;
      }

      let text: string | null = null;
      if (cls === "decision-candidate") {
        text = selfContainedResolutionClause(sentence);
      } else if (lastCandidate) {
        text = clauseFromProposalSentence(lastCandidate.sentence);
        consumedIndices.add(lastCandidate.index);
      }

      if (text === null) {
        // A bare outcome fragment ("Carried.") with no valid preceding
        // resolution candidate has nothing to attach to — drop it rather
        // than fabricate a resolution from the fragment text itself.
        consumedIndices.add(index);
        continue;
      }

      resolutions.push({
        text: `RESOLVED that ${text}.`.replace(/\.\.$/, "."),
        outcome: detectOutcome(sentence),
        confidence: resolutionConfidence(sentence),
        sourceSentenceIndex: index,
        kind: detectResolutionKind(sentence),
      });
      lastPushedWasDecision = cls === "decision-candidate";
      consumedIndices.add(index);
      continue;
    }

    lastPushedWasDecision = false;
    if (cls === "narrative" && isCandidateEligible) {
      lastCandidate = { sentence, index };
    }
  }

  return resolutions;
}

// ---------------------------------------------------------------------------
// Pass 3: actions
// ---------------------------------------------------------------------------

function extractActionItems(
  classified: ClassifiedSentence[],
  consumedIndices: Set<number>,
): ExtractedActionItem[] {
  const actionItems: ExtractedActionItem[] = [];
  for (const { index, sentence, cls } of classified) {
    if (cls !== "action-candidate") continue;
    actionItems.push(extractActionItem(sentence));
    consumedIndices.add(index);
  }
  return actionItems;
}

// ---------------------------------------------------------------------------
// Pass 4: narrative assembly
// ---------------------------------------------------------------------------

function buildNarrativeSentences(
  classified: ClassifiedSentence[],
  consumedIndices: Set<number>,
): string[] {
  const narrativeSentences: string[] = [];
  for (const { index, sentence, cls } of classified) {
    if (consumedIndices.has(index)) continue;
    // Call-to-order/quorum/adjournment housekeeping belongs to the
    // Attendance & Quorum section, not the narrative section.
    if (cls === "procedural") continue;
    narrativeSentences.push(stripSpeakerLabel(sentence));
  }
  return narrativeSentences;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function generateMinutesRuleBased(
  meeting: Meeting,
  transcriptText: string,
): GeneratedMinutes {
  if (meeting.minutes_format === "maisca") {
    return generateMinutesMaisca(meeting, transcriptText);
  }

  const sentences = splitSentences(transcriptText);
  const profile = resolveMeetingTypeProfile(meeting.meeting_type);

  // Pass 1: classify every sentence once.
  const classified = classifySentences(sentences);

  const consumedIndices = new Set<number>();

  // Pass 2: resolve fragments + antecedents into resolutions.
  const resolutions = extractResolutions(classified, consumedIndices);

  // Pass 3: extract action items.
  const actionItems = extractActionItems(classified, consumedIndices);

  // Pass 4: assemble what's left into narrative paragraphs.
  const narrativeSentences = buildNarrativeSentences(classified, consumedIndices);

  const numbers = autoNumberResolutions(meeting.meeting_type, meeting.meeting_date, resolutions.length);

  const quorumMet = detectQuorumMet(transcriptText, meeting.quorum_met ?? false);

  const resolutionSections = resolutions
    .map((r, i) => {
      const number = numbers[i];
      const label = renderResolutionLabel(profile, r.kind);
      return `<h3>${3 + i}. ${escapeHtml(label)} ${escapeHtml(number)}</h3><p>${escapeHtml(
        r.text,
      )}</p><p>Outcome: ${escapeHtml(r.outcome.charAt(0).toUpperCase() + r.outcome.slice(1))}</p>`;
    })
    .join("");

  const actionItemsSectionIndex = 3 + resolutions.length;
  const actionItemsListHtml =
    actionItems.length === 0
      ? "<p>No action items were identified.</p>"
      : `<ul>${actionItems
          .map((a) => {
            const ownerLabel = a.owner ? escapeHtml(a.owner) : "Unassigned";
            const dueLabel = a.dueDate ? ` (Due: ${escapeHtml(a.dueDate)})` : "";
            return `<li>${ownerLabel} &mdash; ${escapeHtml(a.description)}${dueLabel}</li>`;
          })
          .join("")}</ul>`;

  const quorumSentence = renderQuorumSentence(profile, quorumMet);

  const narrativeParagraphs = chunkNarrative(narrativeSentences)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

  // Close of meeting — emitted ONLY when the transcript actually records one.
  // The close sentence is stripped from the narrative as procedural filler
  // (correct: it is not deliberation), but nothing re-recorded it, so
  // `close_recorded` could never pass on this template. Conditional emission
  // restores the fact without making the check unfalsifiable: no close in the
  // transcript still means no close in the body, and the check still warns.
  const close = detectMeetingClose(transcriptText);
  const closeSectionIndex = actionItemsSectionIndex + 1;
  const closeHtml = close.closed
    ? `<h3>${closeSectionIndex}. Close of Meeting</h3><p>There being no other business, the meeting was closed${
        close.time ? ` at ${escapeHtml(close.time)}` : ""
      }.</p>`
    : "";

  const minutesBodyHtml = `${renderHeadingHtml(meeting, profile)}
<p><strong>Company:</strong> ${escapeHtml(meeting.company_name)} &mdash; <strong>Date:</strong> ${escapeHtml(
    meeting.meeting_date,
  )} &mdash; <strong>Venue:</strong> ${escapeHtml(meeting.venue ?? "Not specified")}</p>
<h3>1. Attendance &amp; Quorum</h3>
${renderAttendanceSection(meeting, profile)}
<p>${escapeHtml(quorumSentence)}</p>
<h3>2. ${escapeHtml(profile.narrativeHeading)}</h3>
${narrativeParagraphs}
${resolutionSections}
<h3>${actionItemsSectionIndex}. Action Items</h3>
${actionItemsListHtml}
${closeHtml}`;

  let bodyConfidence = 0.8;
  if (resolutions.length >= 1 && actionItems.length >= 1) {
    bodyConfidence = Math.min(0.9, Math.round((bodyConfidence + 0.05) * 100) / 100);
  }

  return {
    quorum_met: quorumMet,
    minutes_body_html: minutesBodyHtml,
    body_confidence: bodyConfidence,
    resolutions: resolutions.map((r, i) => ({
      number: numbers[i],
      text: r.text,
      outcome: r.outcome,
      confidence: r.confidence,
    })),
    action_items: actionItems.map((a) => ({
      description: a.description,
      owner: a.owner,
      due_date: a.dueDate,
      confidence: a.confidence,
    })),
  };
}

// ---------------------------------------------------------------------------
// Maisca committee house-format
// ---------------------------------------------------------------------------
//
// A distinct rendering path for committee-style minutes (Meeting/Date/Time/
// Venue header table, Attendees table with 1/1 attendance, Terms-of-Reference
// quorum sentence, a fixed Chairman confidentiality address, and a numbered
// 1.0/2.0/3.0 Item/Agenda & Discussions/Dept. agenda table). It reuses the
// exact same four extraction passes (classifySentences / extractResolutions /
// extractActionItems) as the standard engine, so `resolutions` and
// `action_items` are identical in shape/content to what the standard format
// would produce for the same transcript — only `minutes_body_html` differs.

const MAISCA_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MAISCA_WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "2026-06-16" -> "Tuesday, 16 June 2026". Falls back to the raw input if unparseable. */
function formatMaiscaDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const weekday = MAISCA_WEEKDAY_NAMES[parsed.getUTCDay()];
  const day = parsed.getUTCDate();
  const month = MAISCA_MONTH_NAMES[parsed.getUTCMonth()];
  const year = parsed.getUTCFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

const CALLED_TO_ORDER_TIME_RE =
  /\b(?:call(?:ed)?\s+(?:the|this)\s+(?:\w+\s+){0,4}meeting\s+to\s+order\s+at|meeting\s+(?:was\s+|is\s+)?(?:called\s+to\s+order|opened)\s+at|opened\s+at)\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?)/i;

const CLOSE_MEETING_TIME_RE =
  /\b(?:meeting\s+(?:was\s+)?closed|closed\s+the\s+meeting|meeting\s+(?:was\s+)?adjourned)\s+at\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?)/i;

const PREVIOUS_MINUTES_RE =
  /\b(?:minutes\s+of\s+the\s+(?:last|previous)\s+meeting|previous\s+minutes)\b/i;

function detectTranscriptTime(transcriptText: string, re: RegExp): string | null {
  const match = transcriptText.match(re);
  return match ? match[1] : null;
}

/**
 * Did the TRANSCRIPT record the meeting closing?
 *
 * Exists because the generator classifies close statements as procedural filler
 * (PROCEDURAL_FILLER_RE) and drops them from the narrative — correct, they are
 * not deliberation — but the standard template then emitted no close anywhere,
 * so `close_recorded` in lib/assurance.ts could NEVER pass. The generator
 * deleted the fact and the checker reported it missing. 9 of 12 stored
 * assurance reports warn on exactly this.
 *
 * READS THE TRANSCRIPT, NEVER THE BODY. That is what keeps this honest: the
 * body is what the checker examines, so deriving the body from the body would
 * make the check unfalsifiable — which is precisely the defect `quorum_stated`
 * still has (the template asserts a quorum sentence unconditionally, so the
 * check passes 12/12 and measures nothing).
 *
 * A meeting whose transcript records no close produces minutes with no close
 * line, and the check warns. That is a real finding, and it stays reachable.
 */
export function detectMeetingClose(transcriptText: string): { closed: boolean; time: string | null } {
  const NEGATED = /\b(?:not|never|no)\b[^.]{0,30}\b(?:clos(?:ed|ure)|adjourn(?:ed|ment)?)\b/i;
  const AFFIRMED =
    /\b(?:meeting|proceedings)\b[^.]{0,60}\b(?:was|were|is|stood)?\s*(?:clos(?:ed)?|adjourn(?:ed)?|terminated)\b|there being no (?:other|further) business/i;
  const closed = AFFIRMED.test(transcriptText) && !NEGATED.test(transcriptText);
  return { closed, time: closed ? detectTranscriptTime(transcriptText, CLOSE_MEETING_TIME_RE) : null };
}

/** "2.30pm" / "2:30 PM" / "2 pm" -> "02:30 p.m." style. Passes through anything it can't parse. */
function normalizeMaiscaTime(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\.?$/i);
  if (match) {
    const hour = match[1].padStart(2, "0");
    const minute = match[2] ?? "00";
    const suffix = match[3].toLowerCase() === "a" ? "a.m." : "p.m.";
    return `${hour}:${minute} ${suffix}`;
  }
  return trimmed;
}

// Strips a trailing "by <date>" clause an action description already carries
// (extractActionItem doesn't remove it from the description), so the Maisca
// "Action: X to Y by <date>." line doesn't repeat the date twice.
const TRAILING_DUE_DATE_RE =
  /\s*\bby\s+(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\.?\s*$/i;

function stripTrailingDueDateClause(text: string): string {
  return text.replace(TRAILING_DUE_DATE_RE, "").trim();
}

function upperFirstLetter(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "First item, the joint venture with Selat Marine Bhd." -> "THE JOINT VENTURE WITH SELAT MARINE BHD" */
function deriveMaiscaHeading(sentence: string): string {
  const cleaned = stripLeadingDiscourseMarkers(stripSpeakerLabel(sentence))
    .replace(/\.$/, "")
    .trim();
  return cleaned.toUpperCase();
}

/** Decisions render bold as "The Committee RESOLVED that ..."; deferrals render as plain "... was deferred pending ...". */
function renderMaiscaResolutionLine(r: ExtractedResolution): string {
  let clause = r.text.replace(/^RESOLVED that\s+/i, "").replace(/\.$/, "");
  if (r.outcome === "deferred") {
    clause = clause.replace(
      /\bbe\s+(deferred|postponed|tabled)\b/i,
      (_match, verb: string) => `was ${verb.toLowerCase()}`,
    );
    return `<p>${escapeHtml(upperFirstLetter(clause))}.</p>`;
  }
  return `<p><strong>The Committee RESOLVED that ${escapeHtml(clause)}.</strong></p>`;
}

function renderMaiscaActionLine(a: ExtractedActionItem): string {
  const owner = a.owner ? a.owner : "the Secretariat";
  const task = lowerFirstLetter(stripTrailingDueDateClause(a.description));
  const dueSuffix = a.dueDate ? ` by ${formatMaiscaDate(a.dueDate)}` : "";
  return `<p>Action: ${escapeHtml(owner)} to ${escapeHtml(task)}${dueSuffix}.</p>`;
}

interface MaiscaSegment {
  /** Uppercase section heading derived from an explicit agenda-header sentence, or null (renders as "MATTERS ARISING"). */
  heading: string | null;
  paragraphSentences: string[];
  resolutions: ExtractedResolution[];
  actions: ExtractedActionItem[];
}

/**
 * Groups the transcript's remaining (non-fixed-item) content into agenda
 * topics, using the same agenda-header fragments ("First item, ...", "Next,
 * ...") the standard engine already detects as narrative-navigation markers.
 * Narrative text, resolutions, and action items are each attached to
 * whichever segment was "current" at their original sentence position, so an
 * item's decision/action lines stay inline with its own discussion — mirroring
 * the sample's per-item structure. Falls back to a single "MATTERS ARISING"
 * segment when the transcript has no explicit topic markers.
 */
function buildMaiscaSegments(
  classified: ClassifiedSentence[],
  consumedIndices: Set<number>,
  resolutions: ExtractedResolution[],
  actionItems: ExtractedActionItem[],
): MaiscaSegment[] {
  const segments: MaiscaSegment[] = [];
  let current: MaiscaSegment = {
    heading: null,
    paragraphSentences: [],
    resolutions: [],
    actions: [],
  };
  const indexToSegment = new Map<number, MaiscaSegment>();

  for (const c of classified) {
    if (c.cls === "procedural") continue;
    if (c.cls === "narrative" && c.isAgendaHeader) {
      current = { heading: deriveMaiscaHeading(c.sentence), paragraphSentences: [], resolutions: [], actions: [] };
      segments.push(current);
      continue;
    }
    if (segments.length === 0) segments.push(current);
    indexToSegment.set(c.index, current);
  }
  if (segments.length === 0) segments.push(current);

  for (const c of classified) {
    if (c.cls === "procedural") continue;
    if (c.cls === "narrative" && c.isAgendaHeader) continue;
    if (consumedIndices.has(c.index)) continue;
    const seg = indexToSegment.get(c.index);
    if (seg) seg.paragraphSentences.push(stripSpeakerLabel(c.sentence));
  }

  for (const r of resolutions) {
    const seg = indexToSegment.get(r.sourceSentenceIndex) ?? segments[segments.length - 1];
    seg.resolutions.push(r);
  }

  const actionCandidateIndices = classified
    .filter((c) => c.cls === "action-candidate")
    .map((c) => c.index);
  actionItems.forEach((a, i) => {
    const idx = actionCandidateIndices[i];
    const seg = (idx !== undefined ? indexToSegment.get(idx) : undefined) ?? segments[segments.length - 1];
    seg.actions.push(a);
  });

  return segments.filter(
    (s) => s.heading || s.paragraphSentences.length > 0 || s.resolutions.length > 0 || s.actions.length > 0,
  );
}

export function generateMinutesMaisca(meeting: Meeting, transcriptText: string): GeneratedMinutes {
  const sentences = splitSentences(transcriptText);
  const classified = classifySentences(sentences);
  const consumedIndices = new Set<number>();

  // Same extraction passes as the standard engine — resolutions/action_items
  // must come out identical regardless of which body template renders them.
  const resolutions = extractResolutions(classified, consumedIndices);
  const actionItems = extractActionItems(classified, consumedIndices);
  const numbers = autoNumberResolutions(meeting.meeting_type, meeting.meeting_date, resolutions.length);
  const quorumMet = detectQuorumMet(transcriptText, meeting.quorum_met ?? false);

  const attendees = meeting.attendees ?? [];
  const isApology = (role: string) => /apolog/i.test(role);
  const isInAttendance = (role: string) => /in\s*attendance|\(observer\)|observer/i.test(role);

  const mainAttendees = attendees.filter((a) => !isApology(a.role) && !isInAttendance(a.role));
  const apologyAttendees = attendees.filter((a) => isApology(a.role));
  const inAttendanceAttendees = attendees.filter((a) => isInAttendance(a.role) && !isApology(a.role));
  const nonApologyAttendees = attendees.filter((a) => !isApology(a.role));
  const quorumN = Math.max(1, Math.floor(nonApologyAttendees.length / 2) + 1);

  // --- Header table -----------------------------------------------------
  const year = meeting.meeting_date
    ? new Date(`${meeting.meeting_date}T00:00:00Z`).getUTCFullYear()
    : new Date().getUTCFullYear();
  const yy = String(Number.isNaN(year) ? new Date().getUTCFullYear() : year).slice(-2);
  const meetingNoLabel = `${meeting.meeting_type} No.01/${yy}`;
  const dateLabel = meeting.meeting_date ? formatMaiscaDate(meeting.meeting_date) : null;
  const calledToOrderRaw = detectTranscriptTime(transcriptText, CALLED_TO_ORDER_TIME_RE);
  const closeTimeRaw = detectTranscriptTime(transcriptText, CLOSE_MEETING_TIME_RE);

  const headerRows: string[] = [`<tr><th>Meeting</th><td>${escapeHtml(meetingNoLabel)}</td></tr>`];
  if (dateLabel) {
    headerRows.push(`<tr><th>Date</th><td>${escapeHtml(dateLabel)}</td></tr>`);
  }
  if (calledToOrderRaw) {
    headerRows.push(`<tr><th>Time</th><td>${escapeHtml(normalizeMaiscaTime(calledToOrderRaw))}</td></tr>`);
  }
  headerRows.push(`<tr><th>Venue</th><td>${escapeHtml(meeting.venue ?? "Not specified")}</td></tr>`);
  const headerTableHtml = `<table><tbody>${headerRows.join("")}</tbody></table>`;

  // --- Attendees ----------------------------------------------------------
  const attendeeRows = mainAttendees
    .map((a) => `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.role)}</td><td>1/1</td></tr>`)
    .join("");
  const attendeesTableHtml =
    mainAttendees.length > 0
      ? `<table><thead><tr><th>Name</th><th>Designation</th><th>Attendance</th></tr></thead><tbody>${attendeeRows}</tbody></table>`
      : "<p>No attendee list was captured for this meeting.</p>";

  const apologiesHtml =
    apologyAttendees.length > 0
      ? `<h3>Absent with Apologies</h3><ul>${apologyAttendees
          .map((a) => `<li>${escapeHtml(a.name)} &mdash; ${escapeHtml(a.role)}</li>`)
          .join("")}</ul>`
      : "";

  const inAttendanceHtml =
    inAttendanceAttendees.length > 0
      ? `<p><strong>In Attendance:</strong></p><ul>${inAttendanceAttendees
          .map((a) => `<li>${escapeHtml(a.name)} &mdash; ${escapeHtml(a.role)}</li>`)
          .join("")}</ul>`
      : "";

  // --- Quorum ---------------------------------------------------------------
  const quorumSentenceParts = [
    `In accordance with the Terms of Reference, ${quorumN} members of the Committee including the Chairman or Deputy Chairman present shall form a quorum.`,
  ];
  if (quorumMet) quorumSentenceParts.push("A quorum was present.");
  const quorumHtml = `<h3>Quorum</h3><p>${escapeHtml(quorumSentenceParts.join(" "))}</p>`;

  // --- Address by Chairman ----------------------------------------------------
  const chairman = meeting.chairperson ?? "The Chairman";
  const addressHtml = `<h3>Address by Chairman</h3><p>${escapeHtml(
    chairman,
  )} reminded members of their Confidentiality Undertaking and requested that any interests in the matters to be discussed be declared. Members were reminded that no information relating to the deliberations of the Committee is to be disclosed, whether verbally, in writing, or through any digital medium (including but not limited to SMS, WhatsApp, or social media), without the prior authorisation of the Chairman.</p>`;

  // --- Agenda -----------------------------------------------------------------
  let itemCounter = 1;
  const agendaRows: string[] = [];

  agendaRows.push(
    `<tr><td>${itemCounter}.0</td><td><p><strong>WELCOME REMARKS</strong></p><p>${escapeHtml(
      chairman,
    )} welcomed all members to the meeting and thanked them for their attendance.</p></td><td></td></tr>`,
  );
  itemCounter += 1;

  if (PREVIOUS_MINUTES_RE.test(transcriptText)) {
    agendaRows.push(
      `<tr><td>${itemCounter}.0</td><td><p><strong>MINUTES OF THE PREVIOUS MEETING</strong></p><p>The minutes of the previous meeting were confirmed as a correct record.</p></td><td></td></tr>`,
    );
    itemCounter += 1;
  }

  const segments = buildMaiscaSegments(classified, consumedIndices, resolutions, actionItems);
  for (const segment of segments) {
    const cellParts: string[] = [`<p><strong>${escapeHtml(segment.heading ?? "MATTERS ARISING")}</strong></p>`];
    const narrativeText = segment.paragraphSentences.join(" ").trim();
    if (narrativeText) {
      cellParts.push(`<p>${escapeHtml(narrativeText)}</p>`);
    }
    for (const r of segment.resolutions) {
      cellParts.push(renderMaiscaResolutionLine(r));
    }
    for (const a of segment.actions) {
      cellParts.push(renderMaiscaActionLine(a));
    }
    agendaRows.push(`<tr><td>${itemCounter}.0</td><td>${cellParts.join("")}</td><td></td></tr>`);
    itemCounter += 1;
  }

  // Conditional, for the same reason as the standard template — but this one
  // had the OPPOSITE defect. It asserted "There being no other business, the
  // meeting was closed" on EVERY maisca draft regardless of what was said, so
  // `close_recorded` could never fail here while it could never pass on the
  // standard template. One check, two templates, unreachable in both
  // directions. A minute that states a meeting closed when the transcript
  // never said so is a fabricated statutory fact, which is worse than a gap.
  const maiscaClose = detectMeetingClose(transcriptText);
  if (maiscaClose.closed) {
    const closeSuffix = closeTimeRaw ? ` at ${normalizeMaiscaTime(closeTimeRaw)}` : "";
    agendaRows.push(
      `<tr><td>${itemCounter}.0</td><td><p><strong>CLOSE OF MEETING</strong></p><p>There being no other business, the meeting was closed${escapeHtml(
        closeSuffix,
      )}.</p></td><td></td></tr>`,
    );
  }

  const agendaTableHtml = `<table><thead><tr><th>Item</th><th>Agenda &amp; Discussions</th><th>Dept.</th></tr></thead><tbody>${agendaRows.join(
    "",
  )}</tbody></table>`;

  const minutesBodyHtml = `<h2>Minutes of ${escapeHtml(meeting.meeting_type)}</h2>
${headerTableHtml}
<h3>Attendees</h3>
${attendeesTableHtml}
${apologiesHtml}
${inAttendanceHtml}
${quorumHtml}
${addressHtml}
<h3>Agenda</h3>
${agendaTableHtml}`;

  let bodyConfidence = 0.8;
  if (resolutions.length >= 1 && actionItems.length >= 1) {
    bodyConfidence = Math.min(0.9, Math.round((bodyConfidence + 0.05) * 100) / 100);
  }

  return {
    quorum_met: quorumMet,
    minutes_body_html: minutesBodyHtml,
    body_confidence: bodyConfidence,
    resolutions: resolutions.map((r, i) => ({
      number: numbers[i],
      text: r.text,
      outcome: r.outcome,
      confidence: r.confidence,
    })),
    action_items: actionItems.map((a) => ({
      description: a.description,
      owner: a.owner,
      due_date: a.dueDate,
      confidence: a.confidence,
    })),
  };
}
