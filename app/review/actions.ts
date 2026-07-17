"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Records an anonymous confirmation against a shared draft via the
 * security-definer RPC `confirm_shared_draft`. Works signed-out — the token
 * itself is the credential, validated (and expiry-checked) inside the RPC.
 */
export async function confirmSharedDraft(
  token: string,
  name: string,
  role: string,
): Promise<{ confirmedAt?: string; error?: string }> {
  if (!token) return { error: "Missing review link." };

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    return { error: "Enter your full name (at least 2 characters)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_shared_draft", {
    share_token: token,
    p_name: trimmedName,
    p_role: role.trim() || null,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("invalid") || message.includes("expired")) {
      return { error: "This link has expired — ask for a fresh one." };
    }
    return { error: "Could not confirm — please try again." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.confirmed_at) {
    return { error: "Could not confirm — please try again." };
  }

  return { confirmedAt: row.confirmed_at };
}
