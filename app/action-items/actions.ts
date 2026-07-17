"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  error?: string;
  success?: true;
}

/**
 * Toggles an action item's status between 'open' and 'done' from the
 * cross-meeting Action Items list. Revalidates both this list and the
 * originating meeting's draft page so the two views stay in sync.
 */
export async function toggleActionItem(
  itemId: string,
  meetingId: string,
  next: "open" | "done",
): Promise<ActionResult> {
  if (next !== "open" && next !== "done") {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("action_items")
    .update({ item_status: next })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "action_item",
    entityId: itemId,
    action: "toggle_action_item",
    payload: { to: next },
  });

  revalidatePath("/action-items");
  revalidatePath(`/meetings/${meetingId}/draft`, "page");

  return { success: true };
}
