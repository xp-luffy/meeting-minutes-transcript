import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionItem, Meeting, MinutesDraft, Resolution } from "@/lib/types";
import type { AssuranceStatus } from "@/lib/assurance";
import type { ExportFetchResult } from "./types";

/**
 * Loads everything an export route needs: the meeting, its latest minutes
 * draft, resolutions (ordered), and action items. Shared by both the DOCX
 * and PDF routes so validation (404 / empty-draft 400) stays consistent.
 */
export async function fetchExportData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  meetingId: string,
): Promise<ExportFetchResult> {
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at",
    )
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError || !meeting) {
    return { ok: false, status: 404, error: "Meeting not found" };
  }

  const { data: draft, error: draftError } = await supabase
    .from("minutes_drafts")
    .select(
      "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, created_at",
    )
    .eq("meeting_id", meetingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError || !draft || !draft.body_html || draft.body_html.trim().length === 0) {
    return { ok: false, status: 400, error: "Draft is empty" };
  }

  const [{ data: resolutions }, { data: actionItems }, { data: assuranceRow }] = await Promise.all([
    supabase
      .from("resolutions")
      .select(
        "id, meeting_id, resolution_number, resolution_text, resolution_text_source, resolution_text_confidence, resolution_text_review_status, outcome, created_at",
      )
      .eq("meeting_id", meetingId)
      .order("resolution_number", { ascending: true }),
    supabase
      .from("action_items")
      .select(
        "id, meeting_id, description, description_source, description_confidence, description_review_status, owner_name, due_date, item_status, created_at",
      )
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
    // Latest assurance report for THIS draft. A query failure and a genuinely
    // absent report both resolve to null — and null prints "Assurance: NOT RUN",
    // which is the honest statement in either case.
    supabase
      .from("assurance_reports")
      .select("results")
      .eq("draft_id", draft.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assuranceResults = (assuranceRow?.results ?? null) as
    | { status: AssuranceStatus }[]
    | null;

  return {
    ok: true,
    data: {
      meeting: meeting as Meeting,
      draft: draft as MinutesDraft,
      resolutions: (resolutions ?? []) as Resolution[],
      actionItems: (actionItems ?? []) as ActionItem[],
      assurance:
        assuranceResults && assuranceResults.length > 0
          ? { statuses: assuranceResults.map((r) => r.status) }
          : null,
    },
  };
}
