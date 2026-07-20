"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function createReviewShare(
  meetingId: string,
  draftId: string,
): Promise<{ url?: string; expiresAt?: string; error?: string }> {
  if (!meetingId || !draftId) return { error: "Missing meeting or draft." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to share a draft for review." };

  // Derive the meeting from the draft server-side so a share always binds a
  // draft to its TRUE parent meeting. Trusting the client-supplied meetingId as
  // an independent pair would let a caller bind someone else's meeting id to a
  // draft they can reach; RLS (can_access_meeting on the derived meeting) then
  // governs who can actually read the share.
  const { data: draftRow } = await supabase
    .from("minutes_drafts")
    .select("id, meeting_id, status")
    .eq("id", draftId)
    .maybeSingle();

  if (!draftRow) {
    return { error: "Draft not found." };
  }
  if (meetingId && draftRow.meeting_id !== meetingId) {
    return { error: "Draft does not belong to this meeting." };
  }

  // The recipient of this link signs "I confirm these minutes are accurate" —
  // a real attestation, made by someone with no account and no way to judge
  // whether anyone has checked the document. Sending a raw first draft asks a
  // director to vouch for text nobody has reviewed, so circulation requires a
  // reviewed (or final) draft.
  if (draftRow.status !== "reviewed" && draftRow.status !== "final") {
    return {
      error:
        "Mark the minutes reviewed before circulating — a confirmation link asks a director to attest they are accurate.",
    };
  }

  const verifiedMeetingId = draftRow.meeting_id;

  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("review_shares")
    .insert({ token, draft_id: draftId, meeting_id: verifiedMeetingId })
    .select("token, expires_at")
    .single();

  if (error || !data) {
    if (error?.code === "42501" || error?.message?.includes("row-level security")) {
      return { error: "You don't have access to share this draft." };
    }
    return { error: "Could not create the review link — try again." };
  }

  await logAudit(supabase, {
    meetingId: verifiedMeetingId,
    entityType: "minutes_draft",
    entityId: draftId,
    action: "send_draft_for_review",
    payload: { expires_at: data.expires_at },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { url: `${base}/review/${data.token}`, expiresAt: data.expires_at };
}
