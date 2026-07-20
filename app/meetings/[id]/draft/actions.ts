"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { getProfile, getSessionUser } from "@/lib/auth";
import { runAssurance } from "@/lib/assurance";
import { sanitizeMinutesHtml } from "@/lib/sanitize-html";
import type { Attendee } from "@/lib/types";

export interface ActionResult {
  error?: string;
  success?: true;
}

// ---------------------------------------------------------------------------
// Internal helpers (NOT exported — this file has "use server" at the top, so
// every export must be an async function; helpers stay local to avoid
// breaking that rule).
// ---------------------------------------------------------------------------

/** Looks up the current draft status for a meeting (latest version). */
async function getDraftStatusByMeeting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  meetingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("minutes_drafts")
    .select("status")
    .eq("meeting_id", meetingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status ?? null;
}

function draftPath(meetingId: string): string {
  return `/meetings/${meetingId}/draft`;
}

/**
 * Maps a Supabase RLS-denial error (code 42501, or message mentioning
 * "row-level security") to a friendlier message; passes other errors through
 * unchanged.
 */
function friendlyRlsMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501" || error.message.toLowerCase().includes("row-level security")) {
    return "Your session has expired — sign in again to save changes.";
  }
  return error.message;
}

const RESOLUTION_OUTCOMES = ["carried", "deferred", "lapsed"] as const;
type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

const RESOLUTION_FIELDS = ["resolution_text", "resolution_number", "outcome"] as const;
type ResolutionField = (typeof RESOLUTION_FIELDS)[number];

const ACTION_ITEM_FIELDS = ["description", "owner_name", "due_date"] as const;
type ActionItemField = (typeof ACTION_ITEM_FIELDS)[number];

// ---------------------------------------------------------------------------
// 1. Draft body editing
// ---------------------------------------------------------------------------

/**
 * Saves an edited body_html for the draft. Rejected if the draft is
 * 'final' (locked) or the source is 'legacy_md' (plain-text drafts are not
 * editable in v1 — regenerate instead).
 */
export async function saveDraftBody(
  draftId: string,
  meetingId: string,
  html: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("minutes_drafts")
    .select("id, status, body_html_source")
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    return { error: "Draft not found." };
  }
  if (draft.status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }
  if (draft.body_html_source === "legacy_md") {
    return { error: "Legacy draft — regenerate to edit." };
  }

  const clean = sanitizeMinutesHtml(html);

  const { error } = await supabase
    .from("minutes_drafts")
    .update({ body_html: clean, body_html_review_status: "amended" })
    .eq("id", draftId);

  if (error) {
    return { error: error.message };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "draft",
    entityId: draftId,
    action: "edit_draft_body",
    payload: {},
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 2. Resolutions
// ---------------------------------------------------------------------------

/** Updates a single field on a resolution card, saved on blur/change. */
export async function updateResolutionField(
  resolutionId: string,
  meetingId: string,
  field: ResolutionField,
  value: string,
): Promise<ActionResult> {
  if (!RESOLUTION_FIELDS.includes(field)) {
    return { error: "Unknown field." };
  }
  if (field === "outcome" && !RESOLUTION_OUTCOMES.includes(value as ResolutionOutcome)) {
    return { error: "Invalid outcome." };
  }

  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  if (field === "resolution_text" && value.trim().length === 0) {
    return { error: "Resolution text cannot be empty." };
  }

  const { data: updated, error } = await supabase
    .from("resolutions")
    .update({ [field]: value })
    .eq("id", resolutionId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "resolution",
    entityId: resolutionId,
    action: "edit_resolution",
    payload: { field },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

/**
 * Accepts a low-confidence resolution as-is: marks resolution_text as
 * approved, clearing the amber "needs review" treatment.
 */
export async function acceptResolutionText(
  resolutionId: string,
  meetingId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  const { data: updated, error } = await supabase
    .from("resolutions")
    .update({ resolution_text_review_status: "approved" })
    .eq("id", resolutionId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "resolution",
    entityId: resolutionId,
    action: "approve_field",
    payload: { field: "resolution_text" },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 3. Action items
// ---------------------------------------------------------------------------

/** Updates a single field on an action item row, saved on blur/change. */
export async function updateActionItemField(
  itemId: string,
  meetingId: string,
  field: ActionItemField,
  value: string,
): Promise<ActionResult> {
  if (!ACTION_ITEM_FIELDS.includes(field)) {
    return { error: "Unknown field." };
  }

  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  if (field === "description" && value.trim().length === 0) {
    return { error: "Description cannot be empty." };
  }

  const updateValue = field === "due_date" || field === "owner_name" ? value || null : value;

  const { data: updated, error } = await supabase
    .from("action_items")
    .update({ [field]: updateValue })
    .eq("id", itemId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "action_item",
    entityId: itemId,
    action: "edit_action_item",
    payload: { field },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

/** Toggles an action item between 'open' and 'done'. */
export async function toggleActionItemStatus(
  itemId: string,
  meetingId: string,
  currentStatus: "open" | "done",
): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  const nextStatus = currentStatus === "open" ? "done" : "open";

  const { data: updated, error } = await supabase
    .from("action_items")
    .update({ item_status: nextStatus })
    .eq("id", itemId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "action_item",
    entityId: itemId,
    action: "toggle_action_item",
    payload: { from: currentStatus, to: nextStatus },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

/**
 * Accepts a low-confidence action item description as-is: marks it
 * approved, clearing the amber "needs review" treatment.
 */
export async function acceptActionItemDescription(
  itemId: string,
  meetingId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  const { data: updated, error } = await supabase
    .from("action_items")
    .update({ description_review_status: "approved" })
    .eq("id", itemId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "action_item",
    entityId: itemId,
    action: "approve_field",
    payload: { field: "description" },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 4. Status workflow
// ---------------------------------------------------------------------------

/** Moves a draft (and its parent meeting) from 'draft' to 'reviewed'. */
export async function markDraftReviewed(
  draftId: string,
  meetingId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: draftRow } = await supabase
    .from("minutes_drafts")
    .select("id, meeting_id, status")
    .eq("id", draftId)
    .maybeSingle();

  if (!draftRow) {
    return { error: "Draft not found." };
  }
  if (draftRow.meeting_id !== meetingId) {
    return { error: "Draft does not belong to this meeting." };
  }
  if (draftRow.status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }
  if (draftRow.status !== "draft") {
    return { error: "Only a draft in 'draft' status can be marked reviewed." };
  }

  const verifiedMeetingId = draftRow.meeting_id;
  const nowIso = new Date().toISOString();

  const { error: draftError } = await supabase
    .from("minutes_drafts")
    .update({ status: "reviewed", reviewed_at: nowIso })
    .eq("id", draftId);

  if (draftError) {
    return { error: draftError.message };
  }

  const { error: meetingError } = await supabase
    .from("meetings")
    .update({ status: "reviewed" })
    .eq("id", verifiedMeetingId);

  if (meetingError) {
    return { error: meetingError.message };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "draft",
    entityId: draftId,
    action: "status_change",
    payload: { from: "draft", to: "reviewed" },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

/** Moves a draft (and its parent meeting) from 'reviewed' to 'final'. Locks all editing once applied. */
/**
 * Runs the completeness checks against the CURRENT state of a draft.
 *
 * Shared by rerunAssurance (user-triggered) and markDraftFinal (the gate), so
 * the two can never drift apart — the number shown on screen and the number
 * that blocks sign-off come from the same code path. Returns null if the
 * draft or meeting cannot be read, which callers must treat as "cannot
 * verify" rather than "passed".
 */
async function computeAssurance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  meetingId: string,
): Promise<{ checks: { key: string; status: string }[]; score: number } | null> {
  const [{ data: meeting }, { data: draft }] = await Promise.all([
    supabase
      .from("meetings")
      .select("id, meeting_type, minutes_format, chairperson, attendees, quorum_met")
      .eq("id", meetingId)
      .maybeSingle(),
    supabase.from("minutes_drafts").select("id, meeting_id, body_html").eq("id", draftId).maybeSingle(),
  ]);

  if (!meeting || !draft || draft.meeting_id !== meetingId) return null;

  const [
    { data: resolutions, error: resolutionsError },
    { data: actionItems, error: actionItemsError },
    { data: transcript, error: transcriptError },
  ] = await Promise.all([
    supabase
      .from("resolutions")
      .select("resolution_number, resolution_text, outcome")
      .eq("meeting_id", meetingId),
    supabase
      .from("action_items")
      .select("description, owner_name, owner_entity_id, due_date")
      .eq("meeting_id", meetingId),
    supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // postgrest-js RESOLVES { data: null, error } — it does not throw. Coercing a
  // failed read to `[]` or `""` here would feed the engine an empty record, and
  // the checks would then pass vacuously ("no action items" scores
  // not_applicable, an empty transcript covers all undertakings). Finalisation
  // would proceed on inputs nobody actually read. A failed read is "cannot
  // verify", never "verified clean".
  if (resolutionsError || actionItemsError || transcriptError) return null;

  const result = runAssurance({
    meeting: {
      meeting_type: meeting.meeting_type,
      minutes_format: meeting.minutes_format ?? undefined,
      chairperson: meeting.chairperson,
      attendees: meeting.attendees,
      quorum_met: meeting.quorum_met,
    },
    bodyHtml: draft.body_html ?? "",
    resolutions: (resolutions ?? []) as {
      resolution_number: string | null;
      resolution_text: string;
      outcome: string;
    }[],
    actionItems: (actionItems ?? []) as {
      description: string;
      owner_name: string | null;
      owner_entity_id: string | null;
      due_date: string | null;
    }[],
    transcriptText: transcript?.raw_text ?? "",
  });

  return { checks: result.checks as { key: string; status: string }[], score: result.score };
}

export async function markDraftFinal(draftId: string, meetingId: string): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { error: "Sign in to finalise minutes." };
  }
  if (profile.role === "reviewer") {
    return { error: "Reviewers cannot finalise minutes — ask a cosec or admin." };
  }

  const supabase = await createClient();

  const { data: draftRow } = await supabase
    .from("minutes_drafts")
    .select("id, meeting_id, status")
    .eq("id", draftId)
    .maybeSingle();

  if (!draftRow) {
    return { error: "Draft not found." };
  }
  if (draftRow.meeting_id !== meetingId) {
    return { error: "Draft does not belong to this meeting." };
  }
  const verifiedMeetingId = draftRow.meeting_id;

  // Assurance gate. The check RUNS HERE, against the text being finalised —
  // it is never read from an earlier report.
  //
  // Two ways the old version let unverified minutes through, both silent:
  //   1. no report existed at all (engine had never run) — waved through
  //   2. a report existed but the body was edited afterwards; saving updates
  //      the same draft row, so a stale PASS still counted. Worse than no
  //      check: a green tick asserting something no longer true.
  //
  // "Final" has to mean "verified as of now", or the product's one promise —
  // nothing legally required is missing, and here is the proof — is hollow.
  const assurance = await computeAssurance(supabase, draftId, verifiedMeetingId);
  if (!assurance) {
    return { error: "Could not run the completeness check — minutes not finalised." };
  }

  // Store the run so the proof is dated to the finalisation itself.
  //
  // This insert IS the proof. If it fails silently, the draft still goes final
  // while the dated artefact that substantiates "here is the proof" does not
  // exist — the exact claim-without-evidence this product exists to prevent.
  // So a failure to record the proof refuses the finalisation.
  const { error: proofError } = await supabase.from("assurance_reports").insert({
    draft_id: draftId,
    meeting_id: verifiedMeetingId,
    results: assurance.checks,
    score: assurance.score,
  });
  if (proofError) {
    return {
      error:
        "The completeness check ran, but its result could not be recorded — minutes not finalised. Try again.",
    };
  }

  const failKeys = assurance.checks.filter((c) => c.status === "fail").map((c) => c.key).sort();

  if (failKeys.length > 0) {
    // The acknowledge escape hatch still works, but only for the gaps that
    // were actually acknowledged. New or changed gaps must be faced again.
    const { data: acked } = await supabase
      .from("assurance_reports")
      .select("results, acknowledged_at")
      .eq("draft_id", draftId)
      .not("acknowledged_at", "is", null)
      .order("acknowledged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ackedKeys = ((acked?.results ?? []) as { key: string; status: string }[])
      .filter((r) => r.status === "fail")
      .map((r) => r.key)
      .sort();

    const sameGaps =
      ackedKeys.length === failKeys.length && ackedKeys.every((k, i) => k === failKeys[i]);

    if (!sameGaps) {
      return {
        error:
          "The completeness check just found unresolved gaps — resolve them or acknowledge the risk before finalising.",
      };
    }
  }

  if (draftRow.status === "final") {
    return { error: "This draft is already finalised." };
  }
  if (draftRow.status !== "reviewed") {
    return { error: "Only a draft in 'reviewed' status can be marked final." };
  }

  const nowIso = new Date().toISOString();

  // `.select("id")` + a 0-row guard, not just an error check: an RLS refusal
  // updates zero rows and still resolves without an error. Without this the
  // status write can silently not happen while the audit trail below records
  // the transition as fact — a false history entry in the one document written
  // for a hostile reader.
  const { data: draftUpdated, error: draftError } = await supabase
    .from("minutes_drafts")
    .update({ status: "final", finalised_at: nowIso })
    .eq("id", draftId)
    .select("id");

  if (draftError) {
    return { error: friendlyRlsMessage(draftError) };
  }
  if (!draftUpdated || draftUpdated.length === 0) {
    return { error: "The minutes could not be finalised — you may not have permission." };
  }

  const { data: meetingUpdated, error: meetingError } = await supabase
    .from("meetings")
    .update({ status: "final" })
    .eq("id", verifiedMeetingId)
    .select("id");

  if (meetingError) {
    return { error: friendlyRlsMessage(meetingError) };
  }
  if (!meetingUpdated || meetingUpdated.length === 0) {
    return {
      error:
        "The draft was finalised but the meeting status could not be updated — reload before relying on this record.",
    };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "draft",
    entityId: draftId,
    action: "status_change",
    payload: {
      from: "reviewed",
      to: "final",
      // Proof is now always present and dated to this moment, never absent.
      assurance_score: assurance.score,
      assurance_fails: failKeys,
      assurance_verified_at: new Date().toISOString(),
    },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 5. Attendance & quorum
// ---------------------------------------------------------------------------

/**
 * Saves the attendee list and quorum flag for a meeting. Rejected once the
 * meeting's latest draft is 'final' (locked), same as the other editors.
 * Blank name/role pairs are dropped before persisting.
 */
export async function saveAttendance(
  meetingId: string,
  attendees: Attendee[],
  quorumMet: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await getDraftStatusByMeeting(supabase, meetingId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }

  const cleanAttendees = attendees
    .map((attendee) => ({
      name: (attendee.name ?? "").trim(),
      role: (attendee.role ?? "").trim(),
    }))
    .filter((attendee) => attendee.name.length > 0 || attendee.role.length > 0);

  const { error } = await supabase
    .from("meetings")
    .update({ attendees: cleanAttendees, quorum_met: quorumMet })
    .eq("id", meetingId);

  if (error) {
    return { error: error.message };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "meeting",
    entityId: meetingId,
    action: "edit_attendance",
    payload: { attendee_count: cleanAttendees.length, quorum_met: quorumMet },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 6. Assurance (completeness/defensibility) engine
// ---------------------------------------------------------------------------

/**
 * Re-runs the assurance completeness checks for a draft using the current
 * meeting/draft/resolutions/action-items/transcript state, and inserts a new
 * assurance_reports row (reports are append-only history, not upserted).
 */
export async function rerunAssurance(draftId: string, meetingId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { error: "Sign in to run assurance checks." };
  }

  const supabase = await createClient();

  // Calls the SAME helper the finalisation gate uses. It previously duplicated
  // the whole query-and-run block, so the two agreed only for as long as
  // someone remembered to update both — which is not a guarantee, it is luck.
  // The number shown on screen and the number that blocks sign-off must come
  // from one code path.
  const result = await computeAssurance(supabase, draftId, meetingId);
  if (!result) {
    return { error: "Could not run the completeness check — nothing was recorded." };
  }

  const { error: insertError } = await supabase.from("assurance_reports").insert({
    draft_id: draftId,
    meeting_id: meetingId,
    results: result.checks,
    score: result.score,
  });

  if (insertError) {
    return { error: friendlyRlsMessage(insertError) };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "assurance_report",
    entityId: draftId,
    action: "assurance_rerun",
    payload: {
      score: result.score,
      fail_count: result.checks.filter((c) => c.status === "fail").length,
      warn_count: result.checks.filter((c) => c.status === "warn").length,
    },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}

/**
 * Records acknowledgement of an assurance report's open gaps: the cosec is
 * accepting the risk of finalising despite outstanding fail-level checks,
 * with a note explaining why (kept for the audit trail).
 */
export async function acknowledgeAssurance(
  reportId: string,
  meetingId: string,
  note: string,
): Promise<ActionResult> {
  // Acknowledging a fail-level assurance risk is a cosec/admin act — the same
  // authority gate as finalising minutes. Reviewers cannot self-clear the gate.
  const profile = await getProfile();
  if (!profile) {
    return { error: "Sign in to acknowledge assurance findings." };
  }
  if (profile.role === "reviewer") {
    return { error: "Reviewers cannot acknowledge assurance risk — ask a cosec or admin." };
  }

  const trimmedNote = note.trim();
  if (trimmedNote.length === 0) {
    return { error: "A note is required to acknowledge outstanding gaps." };
  }
  if (trimmedNote.length > 500) {
    return { error: "Note must be 500 characters or fewer." };
  }

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("assurance_reports")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_note: trimmedNote })
    .eq("id", reportId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (error) {
    return { error: friendlyRlsMessage(error) };
  }
  if (!updated || updated.length === 0) {
    return { error: "Not found for this meeting." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "assurance_report",
    entityId: reportId,
    action: "assurance_acknowledged",
    payload: { note: trimmedNote },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}
