import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * This did not exist before the GroundStream integration. It exists now for one
 * reason: `gs_outbox` is RLS-deny-all with no policies (by design), so a
 * request-scoped anon/authenticated client is refused on every insert. The
 * integration spec is explicit that passing "the same client as the business
 * write" is what silently broke a previous rollout — every enqueue denied, and
 * the failure invisible.
 *
 * RULES FOR USING THIS:
 *   - Server-side only. There is no NEXT_PUBLIC_ variant and there must never be.
 *   - Use it for the outbox and other trusted-infrastructure writes ONLY. Do not
 *     reach for it to "fix" an RLS problem on a user-facing path: RLS being in
 *     the way usually means the policy is right and the query is wrong.
 *   - It never carries a user session, so nothing it writes is attributable by
 *     auth.uid(). Pass the actor explicitly.
 *
 * Throws if the key is absent rather than returning a crippled client, because a
 * missing key must not look like a working integration that happens to deliver
 * nothing.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — the GroundStream outbox is RLS-deny-all and " +
        "cannot be written without it. Set it in the server environment (never NEXT_PUBLIC_).",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * True when the service-role key is configured.
 *
 * Call sites use this to skip telemetry cleanly on an environment that has not
 * been given the key, instead of throwing inside a user's action. Emitting is
 * best-effort; the user's meeting must never fail because a telemetry key is
 * missing.
 */
export function adminClientAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
