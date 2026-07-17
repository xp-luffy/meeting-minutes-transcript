import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";

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
}

export type ExportFetchResult =
  | { ok: true; data: ExportData }
  | { ok: false; status: 404 | 400; error: string };
