"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { deriveObligations, type ObligationStatus } from "@/lib/obligations";

export interface ActionResult {
  error?: string;
  success?: true;
}

const VALID_STATUSES: ObligationStatus[] = ["open", "done", "waived"];

function draftPath(meetingId: string): string {
  return `/meetings/${meetingId}/draft`;
}

/**
 * Sets an obligation's status (open/done/waived) from the obligations
 * register (or the read-only meeting panel, if ever wired up for editing).
 * Verifies the obligation actually belongs to the given meeting before
 * updating — the same "0-row guard" convention used across this app's other
 * per-meeting mutations (see app/meetings/[id]/draft/actions.ts).
 */
export async function setObligationStatus(
  id: string,
  meetingId: string,
  status: ObligationStatus,
): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("obligations")
    .update({ status })
    .eq("id", id)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Obligation not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "obligation",
    entityId: id,
    action: "obligation_status",
    payload: { to: status },
  });

  revalidatePath("/obligations");
  revalidatePath(draftPath(meetingId), "page");

  return { success: true };
}

/**
 * Runs obligation derivation for an already-generated meeting and (re)inserts
 * the results — regeneration semantics: prior rule-derived obligations
 * (source LIKE 'rule:%') are cleared first, manually-added ones untouched.
 * Used by the orchestrator to seed obligations for demo meetings that were
 * generated before this engine existed. Requires a session; RLS
 * (can_access_meeting) means a caller without access to the meeting simply
 * gets no row back from the initial select, and the function no-ops with an
 * error rather than throwing.
 */
export async function backfillObligationsForMeeting(meetingId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { error: "Sign in to backfill obligations." };
  }

  const supabase = await createClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, meeting_type, meeting_date, minutes_format")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError || !meeting) {
    return { error: "Meeting not found or not accessible." };
  }

  const [{ data: resolutions }, { data: actionItems }, { data: transcript }] = await Promise.all([
    supabase
      .from("resolutions")
      .select("id, resolution_number, resolution_text, outcome")
      .eq("meeting_id", meetingId)
      .order("resolution_number", { ascending: true }),
    supabase
      .from("action_items")
      .select("description, owner_name, due_date")
      .eq("meeting_id", meetingId)
      .eq("item_status", "open"),
    supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const resolutionRows = (resolutions ?? []) as {
    id: string;
    resolution_number: string | null;
    resolution_text: string;
    outcome: string;
  }[];

  const derived = deriveObligations({
    meeting: {
      meeting_type: meeting.meeting_type as string,
      meeting_date: meeting.meeting_date as string,
      minutes_format: (meeting.minutes_format as string | null) ?? undefined,
    },
    resolutions: resolutionRows.map((r) => ({
      resolution_number: r.resolution_number,
      resolution_text: r.resolution_text,
      outcome: r.outcome,
    })),
    actionItems: (actionItems ?? []) as { description: string; owner_name: string | null; due_date: string | null }[],
    transcriptText: (transcript?.raw_text as string | undefined) ?? "",
  });

  const { error: deleteError } = await supabase
    .from("obligations")
    .delete()
    .eq("meeting_id", meetingId)
    .like("source", "rule:%");

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (derived.length > 0) {
    const { error: insertError } = await supabase.from("obligations").insert(
      derived.map((o) => ({
        meeting_id: meetingId,
        resolution_id:
          o.resolution_index !== undefined ? (resolutionRows[o.resolution_index]?.id ?? null) : null,
        kind: o.kind,
        title: o.title,
        detail: o.detail,
        due_date: o.due_date,
        source: o.source,
      })),
    );
    if (insertError) {
      return { error: insertError.message };
    }
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "obligation",
    entityId: null,
    action: "obligation_backfill",
    payload: { obligation_count: derived.length },
  });

  revalidatePath("/obligations");
  revalidatePath(draftPath(meetingId), "page");

  return { success: true };
}
