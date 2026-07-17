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

  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("review_shares")
    .insert({ token, draft_id: draftId, meeting_id: meetingId })
    .select("token, expires_at")
    .single();

  if (error || !data) {
    if (error?.code === "42501" || error?.message?.includes("row-level security")) {
      return { error: "You don't have access to share this draft." };
    }
    return { error: "Could not create the review link — try again." };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "minutes_draft",
    entityId: draftId,
    action: "send_draft_for_review",
    payload: { expires_at: data.expires_at },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { url: `${base}/review/${data.token}`, expiresAt: data.expires_at };
}
