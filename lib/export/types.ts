import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";
import type { ExportAssurance } from "./assurance-line";

/**
 * All data needed to build an export document, gathered up-front so the
 * doc/pdf builders are pure functions of data (no Supabase, no framework
 * imports) and can be unit-tested directly.
 */
export interface ExportData {
  meeting: Meeting;
  draft: MinutesDraft;
  resolutions: Resolution[];
  actionItems: ActionItem[];
  /**
   * Assurance result for this draft, or null when no report exists.
   *
   * `null` is a MEANINGFUL value here and must not be treated as "omit the
   * line": it prints "Assurance: NOT RUN". See lib/export/assurance-line.ts.
   */
  assurance?: ExportAssurance | null;
}

export type ExportFetchResult =
  | { ok: true; data: ExportData }
  | { ok: false; status: 404 | 400; error: string };
