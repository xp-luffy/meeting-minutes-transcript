"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getOrgContext } from "@/lib/auth";
import { createAdminClient, adminClientAvailable } from "@/lib/supabase/admin";
import { encryptSecret, encryptionUnavailableReason, last4 } from "@/lib/crypto";
import { resolveCredential } from "@/lib/groundstream/credentials";
import { sendBatch } from "@/lib/groundstream/client";

export interface GsSettingsResult {
  error?: string;
  success?: string;
}

interface AdminActor {
  id: string;
  email: string | null;
  orgId: string;
  workspace: string;
}

/**
 * Organisation-admin check.
 *
 * This used to read `profiles.role === "admin"`, which was APP-WIDE: the single
 * admin of the deployment could read, rotate and disconnect EVERY firm's
 * credential. A GroundStream key is a tenant-wide write credential, so that was
 * the most valuable secret in the system guarded by the least specific check.
 *
 * Enforced in the DATABASE by the gs_settings policies too (`is_org_admin(org_id)`);
 * this is the friendly gate, not the boundary.
 */
async function requireAdmin(): Promise<AdminActor | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sign in to manage the GroundStream connection." };

  const org = await getOrgContext();
  if (!org) {
    return { error: "Your account is not part of an organisation, so there is nothing to connect." };
  }
  if (org.role !== "owner" && org.role !== "admin") {
    return { error: `Only an admin of ${org.name} can change the GroundStream connection.` };
  }
  return { id: profile.id, email: profile.email ?? null, orgId: org.id, workspace: org.slug };
}

/**
 * Audit rows are written with the SERVICE-ROLE client and gs_settings_audit has
 * no INSERT policy, so nothing holding a user JWT can forge one. The VALUE is
 * never recorded — only who, when, and what kind of change.
 */
async function audit(
  actor: AdminActor,
  action: "set" | "rotate" | "disable" | "enable" | "remove",
  detail?: string,
) {
  try {
    const db = createAdminClient();
    const { error } = await db.from("gs_settings_audit").insert({
      workspace: actor.workspace,
      org_id: actor.orgId,
      action,
      actor_id: actor.id,
      detail: detail ?? null,
    });
    if (error) {
      console.error("[gs] audit write FAILED", { org: actor.orgId, action, error: error.message });
    }
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
  // The workspace comes from the ACTING ORGANISATION, never from the form. A
  // client-supplied workspace would let an admin of one firm store a credential
  // against another firm's tenant.
  const workspace = admin.workspace;

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
  const { data: existing, error: lookupError } = await db
    .from("gs_settings")
    .select("id")
    .eq("org_id", admin.orgId)
    .maybeSingle<{ id: string }>();

  // A failed lookup must NOT be treated as "nothing saved yet" — that would
  // insert a second row for this organisation and, if the unique index did not
  // catch it, leave which credential wins undefined.
  if (lookupError) {
    return { error: `Could not read the existing connection: ${lookupError.message}` };
  }

  const row = {
    workspace,
    org_id: admin.orgId,
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

  await audit(admin, existing ? "rotate" : "set", `source_name=${sourceName}`);
  revalidatePath("/settings/groundstream", "page");
  return { success: existing ? "Credential rotated." : "Connected." };
}

/** The visible disconnect control. Keeps the row (and its audit trail) intact. */
export async function setGsEnabled(formData: FormData): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!adminClientAvailable()) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set." };

  const db = createAdminClient();
  const { data: updated, error } = await db
    .from("gs_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("org_id", admin.orgId)
    .select("id");

  if (error) return { error: error.message };
  // 0 rows updated is NOT an error from postgrest — it resolves happily. Without
  // this guard the disconnect button would report success having changed nothing,
  // which is the worst possible lie for a control whose whole job is killing a
  // leaked credential.
  if (!updated || updated.length === 0) return { error: "No connection to change." };

  await audit(admin, enabled ? "enable" : "disable");
  revalidatePath("/settings/groundstream", "page");
  return { success: enabled ? "Connection re-enabled." : "Disconnected. No further events will be sent." };
}

/** Remove the credential entirely. */
export async function removeGsCredential(): Promise<GsSettingsResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  if (!adminClientAvailable()) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set." };

  const db = createAdminClient();
  const { data: removed, error } = await db
    .from("gs_settings")
    .delete()
    .eq("org_id", admin.orgId)
    .select("id");

  if (error) return { error: error.message };
  if (!removed || removed.length === 0) return { error: "Nothing to remove." };

  await audit(admin, "remove");
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

  const cred = await resolveCredential(admin.workspace);
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
