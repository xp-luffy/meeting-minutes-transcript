/**
 * Pure types + constants for the company document cabinet.
 *
 * This is a PLAIN module on purpose: both server actions and `"use client"`
 * components import from it. Constants shared with a server action must never
 * live in a `"use client"` file — Next swaps the export for a client-reference
 * proxy and the value silently becomes wrong at runtime while the types still
 * line up (docs/PILOT_PLAYBOOK.md #14 / pattern C). It also must not import
 * `@/lib/supabase/server`, which would drag server-only code into the bundle.
 */

export const DOC_TYPES = [
  "constitution",
  "terms_of_reference",
  "register_of_directors",
  "signed_minutes",
  "ssm_filing",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

/** Runtime narrowing for untrusted form input. */
export function isDocType(value: unknown): value is DocType {
  return typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value);
}

export interface DocTypeSlot {
  type: DocType;
  label: string;
  /** What this app can check once the slot is filled — stated as consequence, not feature. */
  backs: string;
  /** What breaks while the slot is empty. Shown on the empty slot, in the user's words. */
  consequenceIfMissing: string;
  /**
   * `single` — exactly one document in force at a time; a new one supersedes the old.
   * `collection` — many documents, each independently dated, none supersedes another.
   */
  shape: "single" | "collection";
}

/**
 * The cabinet is a CHECKLIST OF DOCUMENT TYPES THIS APP NEEDS, not a folder
 * (DESIGN_SPEC_V4 §2.1). Slots render whether or not they are filled, so a
 * company with nothing on file is visibly missing its constitution rather than
 * looking like an empty folder.
 */
export const DOC_TYPE_SLOTS: readonly DocTypeSlot[] = [
  {
    type: "constitution",
    label: "Constitution / M&A",
    backs: "Quorum threshold, resolution majorities, chair's casting vote",
    consequenceIfMissing:
      "Quorum thresholds and resolution majorities cannot be verified — checks that depend on them report “not verified”.",
    shape: "single",
  },
  {
    type: "terms_of_reference",
    label: "Terms of Reference",
    backs: "Committee quorum and mandate",
    consequenceIfMissing: "Committee minutes cannot be quorum-checked.",
    shape: "single",
  },
  {
    type: "register_of_directors",
    label: "Register of Directors",
    backs: "Who was actually a director on the meeting date",
    consequenceIfMissing:
      "The app cannot confirm who was a director on a meeting date, so attendance and conflict findings stay unverified.",
    shape: "single",
  },
  {
    type: "signed_minutes",
    label: "Signed prior minutes",
    backs: "Evidence that prior minutes were adopted and signed",
    consequenceIfMissing: "There is no signed record on file for prior meetings.",
    shape: "collection",
  },
  {
    type: "ssm_filing",
    label: "SSM filings",
    backs: "Evidence a statutory filing was actually lodged",
    consequenceIfMissing: "Filing obligations cannot be evidenced as discharged.",
    shape: "collection",
  },
  {
    type: "other",
    label: "Other",
    backs: "Nothing — filed for reference only",
    consequenceIfMissing: "",
    shape: "collection",
  },
];

export const DOC_TYPE_LABEL: Record<DocType, string> = DOC_TYPE_SLOTS.reduce(
  (acc, slot) => {
    acc[slot.type] = slot.label;
    return acc;
  },
  {} as Record<DocType, string>,
);

// --- Upload limits (enforced SERVER-SIDE; the client copy is a courtesy) -----

/**
 * Private Supabase Storage bucket holding the files. Lives here rather than in
 * the `"use server"` actions module: a `"use server"` file may only export
 * async functions, and a non-async const export there is a hard build failure
 * (docs/PILOT_PLAYBOOK.md #3).
 */
export const DOCUMENT_BUCKET = "company-documents";

/** 25 MB. Mirrored by the bucket's file_size_limit in migration 0018. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPTED_MIME_TYPES: readonly string[] = [PDF_MIME, DOCX_MIME];

/** `accept` attribute for the file input. Client-side hint only — not a control. */
export const ACCEPT_ATTRIBUTE = ".pdf,.docx";

export const MAX_TITLE_LENGTH = 200;

/**
 * Sniffs a file's leading bytes.
 *
 * A browser-supplied `File.type` is attacker-controlled, so it decides nothing
 * on its own. PDFs must start with "%PDF-"; DOCX is a ZIP container, so it must
 * start with "PK\x03\x04".
 *
 * Lives in this plain module (rather than beside the upload action) because a
 * `"use server"` file may only export async functions, which would make this
 * untestable — and an untested content check is not a control.
 */
export function sniffFileType(bytes: Uint8Array): "pdf" | "zip" | "unknown" {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  ) {
    return "pdf";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "zip";
  }
  return "unknown";
}

/**
 * Parses a strict ISO `yyyy-mm-dd` date, returning null for anything that is
 * not a real calendar date. The round-trip comparison rejects values Postgres
 * would also reject (e.g. "2026-02-30"), so the app and the database agree
 * rather than the database being the first to notice.
 */
export function parseIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

/** Human-readable byte size, e.g. "2.4 MB". */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
