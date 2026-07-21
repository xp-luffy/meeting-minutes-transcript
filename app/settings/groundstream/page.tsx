import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createAdminClient, adminClientAvailable } from "@/lib/supabase/admin";
import { encryptionUnavailableReason } from "@/lib/crypto";
import { workspaceForRecord } from "@/lib/groundstream/events";
import { StatusBanner } from "@/components/status";
import { SubmitButton } from "@/components/submit-button";
import { FOCUS_RING } from "@/components/ui";
import { GsConnectionForm } from "./connection-form";

export const dynamic = "force-dynamic";

/**
 * GroundStream connection settings.
 *
 * The secret is NEVER sent to the browser: this page reads only the masked
 * last-4, the source name and the enabled flag. There is no code path that
 * returns `api_key_ciphertext` to a client component, which is the point — a
 * write-only credential that can be rotated but never read back.
 */
export default async function GroundStreamSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Admin-only. The database policies enforce this independently; this is the
  // friendly gate, not the boundary.
  if (profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-title font-semibold text-paper-900">GroundStream</h1>
        <StatusBanner state="unknown" className="mt-4" title="Admin only">
          Only an admin can view or change this connection. Ask an admin on your team.
        </StatusBanner>
      </div>
    );
  }

  const workspace = workspaceForRecord();
  const cryptoProblem = encryptionUnavailableReason();
  const serviceRoleMissing = !adminClientAvailable();

  let saved: { source_name: string; api_key_last4: string; enabled: boolean } | null = null;
  let loadError: string | null = null;

  if (workspace && !serviceRoleMissing) {
    try {
      const db = createAdminClient();
      const { data, error } = await db
        .from("gs_settings")
        .select("source_name, api_key_last4, enabled")
        .eq("workspace", workspace)
        .maybeSingle<{ source_name: string; api_key_last4: string; enabled: boolean }>();
      // A failed read must not render as "not connected" — that would invite an
      // admin to paste a second key over a working one.
      if (error) loadError = error.message;
      else saved = data;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "settings lookup failed";
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-body">
        <Link href="/settings" className={`rounded-control text-paper-500 hover:text-paper-700 ${FOCUS_RING}`}>
          &larr; Settings
        </Link>
      </p>
      <h1 className="mt-2 text-title font-semibold text-paper-900">GroundStream</h1>
      <p className="mt-1 text-body text-paper-600">
        Sends events about your client companies to GroundStream. Nothing here changes what the
        app does — it only reports what already happened.
      </p>

      {serviceRoleMissing ? (
        <StatusBanner state="failed" className="mt-6" title="Cannot store a credential yet">
          <code>SUPABASE_SERVICE_ROLE_KEY</code> is not set on the server. Without it the event
          outbox cannot be written at all, so connecting here would have no effect.
        </StatusBanner>
      ) : null}

      {cryptoProblem ? (
        <StatusBanner state="failed" className="mt-6" title="Encryption is not configured">
          {cryptoProblem} Credentials are never stored unencrypted, so saving is disabled until
          this is fixed.
        </StatusBanner>
      ) : null}

      {!workspace ? (
        <StatusBanner state="unknown" className="mt-6" title="No workspace configured">
          Set <code>GS_WORKSPACE</code> on the server first. It decides which GroundStream
          workspace these events belong to, and a wrong one files your data under another
          organisation with no undo.
        </StatusBanner>
      ) : null}

      {loadError ? (
        <StatusBanner state="unknown" className="mt-6" title="Could not read the saved connection">
          {loadError} This is not the same as “not connected” — do not paste a new key until this
          loads, or you may overwrite a working one.
        </StatusBanner>
      ) : null}

      <GsConnectionForm
        workspace={workspace}
        saved={saved}
        canSave={Boolean(workspace) && !cryptoProblem && !serviceRoleMissing && !loadError}
      />

      <section className="rule-section mt-8">
        <h2 className="text-subhead font-medium text-paper-900">What gets sent</h2>
        <ul className="mt-3 space-y-1.5 text-body text-paper-700">
          <li>A client company being added, and its meetings and transcripts.</li>
          <li>Minutes generated, finalised, and confirmed by a recipient.</li>
          <li>
            Sign-off being blocked by a completeness check, and which check blocked it — the
            failures are the useful half.
          </li>
        </ul>
        <p className="mt-3 text-caption text-paper-600">
          Never sent: minutes text, transcripts, uploaded documents, or anything a director wrote.
          Events carry ids, counts and check names only.
        </p>
      </section>
    </div>
  );
}
