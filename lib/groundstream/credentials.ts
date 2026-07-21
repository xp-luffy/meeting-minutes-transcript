import { createAdminClient, adminClientAvailable } from "@/lib/supabase/admin";
import { decryptSecret, encryptionAvailable } from "@/lib/crypto";

/**
 * Where a GroundStream credential comes from, in strict order:
 *
 *   1. the database (gs_settings row for the workspace, if enabled)
 *   2. GS_KEY_<WORKSPACE>
 *   3. GS_API_KEY
 *
 * Database first is what makes the settings screen purely ADDITIVE: whatever is
 * configured in env today keeps working untouched, and the screen becomes the
 * migration path rather than a breaking change on deploy.
 *
 * Resolution is per-workspace even though there is one workspace today. The
 * outbox row already carries its workspace and the drain groups by it, so
 * moving to a credential per customer is an insert into gs_settings, not a
 * change at any call site.
 */

export type CredentialSource = "database" | "env_workspace" | "env_global";

export interface ResolvedCredential {
  apiKey: string;
  sourceName: string | null;
  from: CredentialSource;
}

/** Why no credential could be resolved. Distinct reasons, never collapsed. */
export type CredentialProblem =
  | "not_configured"
  | "disabled"
  | "encryption_unavailable"
  | "decrypt_failed"
  | "lookup_failed";

export type CredentialResult =
  | { ok: true; credential: ResolvedCredential }
  | { ok: false; problem: CredentialProblem; detail: string };

function envFallback(workspace: string): CredentialResult {
  const perWorkspace = process.env[`GS_KEY_${workspace.toUpperCase()}`];
  if (perWorkspace && perWorkspace.length > 0) {
    return {
      ok: true,
      credential: {
        apiKey: perWorkspace,
        sourceName: process.env.GS_SOURCE ?? null,
        from: "env_workspace",
      },
    };
  }

  const global = process.env.GS_API_KEY;
  if (global && global.length > 0) {
    return {
      ok: true,
      credential: { apiKey: global, sourceName: process.env.GS_SOURCE ?? null, from: "env_global" },
    };
  }

  return {
    ok: false,
    problem: "not_configured",
    detail: "No credential in the settings screen and no GS_KEY_<WORKSPACE> / GS_API_KEY set.",
  };
}

/**
 * Resolve the credential for a workspace.
 *
 * Never throws, and never returns a partially-usable result: a caller either
 * gets a key it can send with, or a named reason it cannot. A decryption
 * failure in particular must NOT silently fall through to the env var — that
 * would hide a broken master key behind a stale value that still works, which
 * is the failure this whole module exists to make impossible.
 */
export async function resolveCredential(workspace: string): Promise<CredentialResult> {
  if (!adminClientAvailable()) return envFallback(workspace);

  type SettingsRow = { api_key_ciphertext: string; source_name: string; enabled: boolean };
  let row: SettingsRow | null = null;
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("gs_settings")
      .select("api_key_ciphertext, source_name, enabled")
      .eq("workspace", workspace)
      .maybeSingle<SettingsRow>();

    // A failed lookup is NOT "nothing configured". Falling back to env here
    // would mean a database problem silently changes which key is used.
    if (error) {
      return { ok: false, problem: "lookup_failed", detail: error.message };
    }
    row = data;
  } catch (e) {
    return {
      ok: false,
      problem: "lookup_failed",
      detail: e instanceof Error ? e.message : "settings lookup failed",
    };
  }

  if (!row) return envFallback(workspace);

  if (!row.enabled) {
    // Explicitly disconnected in the UI. Do NOT fall through to the env var —
    // that would make the disconnect button a lie.
    return {
      ok: false,
      problem: "disabled",
      detail: "The GroundStream connection is switched off in Settings.",
    };
  }

  if (!encryptionAvailable()) {
    return {
      ok: false,
      problem: "encryption_unavailable",
      detail: "GS_ENCRYPTION_KEY is missing or malformed, so the stored credential cannot be read.",
    };
  }

  try {
    return {
      ok: true,
      credential: {
        apiKey: decryptSecret(row.api_key_ciphertext),
        sourceName: row.source_name,
        from: "database",
      },
    };
  } catch (e) {
    return {
      ok: false,
      problem: "decrypt_failed",
      detail: e instanceof Error ? e.message : "stored credential could not be decrypted",
    };
  }
}
