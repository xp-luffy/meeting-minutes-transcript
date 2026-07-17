"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  error?: string;
  success?: true;
}

// ---------------------------------------------------------------------------
// Internal helpers (NOT exported — this file has "use server" at the top, so
// every export must be an async function; helpers stay local to avoid
// breaking that rule).
// ---------------------------------------------------------------------------

/**
 * Very small v1 sanitiser: strips <script>/<style> blocks and on* attributes
 * before HTML from the editor is persisted. Not a full sanitiser, but blocks
 * the obvious injection vectors for hand-typed / pasted content.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s"'>]+/gi, "");
}

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

/** Looks up the current draft status by draft id directly. */
async function getDraftStatusById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  draftId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("minutes_drafts")
    .select("status")
    .eq("id", draftId)
    .maybeSingle();
  return data?.status ?? null;
}

function draftPath(meetingId: string): string {
  return `/meetings/${meetingId}/draft`;
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

  const clean = sanitizeHtml(html);

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

  const { error } = await supabase
    .from("resolutions")
    .update({ [field]: value })
    .eq("id", resolutionId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("resolutions")
    .update({ resolution_text_review_status: "approved" })
    .eq("id", resolutionId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("action_items")
    .update({ [field]: updateValue })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("action_items")
    .update({ item_status: nextStatus })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("action_items")
    .update({ description_review_status: "approved" })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
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

  const status = await getDraftStatusById(supabase, draftId);
  if (status === "final") {
    return { error: "This draft is finalised and can no longer be edited." };
  }
  if (status !== "draft") {
    return { error: "Only a draft in 'draft' status can be marked reviewed." };
  }

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
    .eq("id", meetingId);

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
export async function markDraftFinal(draftId: string, meetingId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await getDraftStatusById(supabase, draftId);
  if (status === "final") {
    return { error: "This draft is already finalised." };
  }
  if (status !== "reviewed") {
    return { error: "Only a draft in 'reviewed' status can be marked final." };
  }

  const nowIso = new Date().toISOString();

  const { error: draftError } = await supabase
    .from("minutes_drafts")
    .update({ status: "final", finalised_at: nowIso })
    .eq("id", draftId);

  if (draftError) {
    return { error: draftError.message };
  }

  const { error: meetingError } = await supabase
    .from("meetings")
    .update({ status: "final" })
    .eq("id", meetingId);

  if (meetingError) {
    return { error: meetingError.message };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "draft",
    entityId: draftId,
    action: "status_change",
    payload: { from: "reviewed", to: "final" },
  });

  revalidatePath(draftPath(meetingId), "page");
  return { success: true };
}
