"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createAdminClient, adminClientAvailable } from "@/lib/supabase/admin";
import { encryptSecret, encryptionUnavailableReason, last4 } from "@/lib/crypto";
import { resolveCredential } from "@/lib/groundstream/credentials";
import { sendBatch } from "@/lib/groundstream/client";
import { workspaceForRecord } from "@/lib/groundstream/events";

export interface GsSettingsResult {
  error?: string;
  success?: string;
}

/**
 * Admin check. Enforced in the DATABASE by the gs_settings policies too — this
 * is the friendly gate, not the security boundary. If this were the only check,
 * hiding the screen would be the whole of the access control.
 */
async function requireAdmin(): Promise<{ id: string; email: string | null } | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sign in to manage the GroundStream connection." };
  if (profile.role !== "admin") {
    return { error: "Only an admin can change the GroundStream connection." };
  }
  return { id: profile.id, email: profile.email ?? null };
}

/**
 * Audit rows are written with the SERVICE-ROLE client and gs_settings_audit has
 * no INSERT policy, so nothing holding a user JWT can forge one. The VALUE is
 * never recorded — only who, when, and what kind of change.
 */
async function audit(
  workspace: string,
  action: "set" | "rotate" | "disable" | "enable" | "remove",
  actorId: string,
  detail?: string,
) {
  try {
    const db = createAdminClient();
    const { error } = await db
      .from("gs_settings_audit")
      .insert({ workspace, action, actor_id: actorId, detail: detail ?? null });
    if (error) console.error("[gs] audit write FAILED", { workspace, action, error: error.message });
  } catch (err) {
    console.error("[gs] audit write THREW", err);
  }
}

/** Save or rotate the credential. The plaintext never leaves this function. */
export async function saveGsCredential(formData: FormData): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  const sourceName = String(formData.get("source_name") ?? "").trim();
  const workspace = workspaceForRecord() ?? String(formData.get("workspace") ?? "").trim();

  if (!workspace) return { error: "No workspace configured. Set GS_WORKSPACE first." };
  if (!apiKey) return { error: "Paste the GroundStream API key." };
  if (!sourceName) {
    return {
      error:
        "The source name is required — it must match the name registered in GroundStream exactly.",
    };
  }
  // Not a validation of the key's validity, just a shape check so an obvious
  // paste error is caught before it is stored encrypted and unreadable.
  if (!apiKey.startsWith("gs_")) {
    return { error: "That does not look like a GroundStream key — expected it to start with gs_." };
  }
  if (sourceName !== sourceName.trim()) {
    return { error: "The source name has leading or trailing spaces — it must match exactly." };
  }

  const cryptoProblem = encryptionUnavailableReason();
  if (cryptoProblem) return { error: cryptoProblem };
  if (!adminClientAvailable()) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY is not set, so the credential cannot be stored." };
  }

  const db = createAdminClient();
  const { data: existing } = await db
    .from("gs_settings")
    .select("id")
    .eq("workspace", workspace)
    .maybeSingle<{ id: string }>();

  const row = {
    workspace,
    source_name: sourceName,
    api_key_ciphertext: encryptSecret(apiKey),
    api_key_last4: last4(apiKey),
    enabled: true,
    created_by: admin.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await db.from("gs_settings").update(row).eq("id", existing.id)
    : await db.from("gs_settings").insert(row);

  if (error) return { error: `Could not save the credential: ${error.message}` };

  await audit(workspace, existing ? "rotate" : "set", admin.id, `source_name=${sourceName}`);
  revalidatePath("/settings/groundstream", "page");
  return { success: existing ? "Credential rotated." : "Connected." };
}

/** The visible disconnect control. Keeps the row (and its audit trail) intact. */
export async function setGsEnabled(formData: FormData): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const enabled = String(formData.get("enabled") ?? "") === "true";
  const workspace = workspaceForRecord() ?? String(formData.get("workspace") ?? "").trim();
  if (!workspace) return { error: "No workspace configured." };
  if (!adminClientAvailable()) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set." };

  const db = createAdminClient();
  const { data: updated, error } = await db
    .from("gs_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("workspace", workspace)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "No connection to change." };

  await audit(workspace, enabled ? "enable" : "disable", admin.id);
  revalidatePath("/settings/groundstream", "page");
  return { success: enabled ? "Connection re-enabled." : "Disconnected. No further events will be sent." };
}

/** Remove the credential entirely. */
export async function removeGsCredential(): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const workspace = workspaceForRecord();
  if (!workspace) return { error: "No workspace configured." };
  if (!adminClientAvailable()) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set." };

  const db = createAdminClient();
  const { data: removed, error } = await db
    .from("gs_settings")
    .delete()
    .eq("workspace", workspace)
    .select("id");

  if (error) return { error: error.message };
  if (!removed || removed.length === 0) return { error: "Nothing to remove." };

  await audit(workspace, "remove", admin.id);
  revalidatePath("/settings/groundstream", "page");
  return { success: "Credential removed. Env-var fallback (if any) applies again." };
}

/**
 * Test connection — sends ONE real probe and reports what actually came back.
 *
 * `external_event_id` is the fixed string `connection-test`, so pressing this
 * twice is the proof that dedup works rather than a way to create two events.
 *
 * BOTH outcomes are success and the UI says so: `accepted:1` is the first send,
 * `deduped:1` is every send after it. Without saying that out loud, the second
 * press reads as a failure ("accepted: 0") to anyone who has not read the API
 * docs — which is everyone using a settings screen.
 */
export async function testGsConnection(): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const workspace = workspaceForRecord();
  if (!workspace) return { error: "No workspace configured. Set GS_WORKSPACE first." };

  const cred = await resolveCredential(workspace);
  if (!cred.ok) return { error: `${cred.problem}: ${cred.detail}` };

  const source = cred.credential.sourceName ?? process.env.GS_SOURCE;
  if (!source) {
    return {
      error:
        "No source name configured. Omitting it writes NULL on an unbound key and silently breaks dedup.",
    };
  }

  const result = await sendBatch(cred.credential.apiKey, [
    {
      aa_stage: "engaged",
      event_name: "connection_test",
      source,
      actor_id: "connection-test",
      external_event_id: "connection-test",
      occurred_at: new Date().toISOString(),
      payload: { app: "Meeting Minutes", tested_by: admin.email ?? "unknown" },
    },
  ]);

  if (!result.ok) {
    return { error: `GroundStream rejected the probe — ${result.error}` };
  }

  const via =
    cred.credential.from === "database"
      ? "the saved credential"
      : cred.credential.from === "env_workspace"
        ? "GS_KEY_<WORKSPACE>"
        : "GS_API_KEY";

  if (result.accepted > 0) {
    return {
      success: `Connected. GroundStream accepted the test event (accepted: ${result.accepted}), sent with ${via} as source "${source}".`,
    };
  }

  return {
    success: `Connected. GroundStream recognised this as a repeat and deduplicated it (deduped: ${result.deduped}) — this is a SUCCESS, and it proves retries will not create duplicates. Sent with ${via} as source "${source}".`,
  };
}
