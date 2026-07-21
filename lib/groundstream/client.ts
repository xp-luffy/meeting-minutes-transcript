const ENDPOINT = "https://groundstream.co/api/v1/events";

export type GsEvent = {
  aa_stage: "acquired" | "engaged" | "activated" | "converted" | "retained";
  event_name: string;
  /**
   * ALWAYS sent, matching the registered name character-for-character.
   *
   * Omitting looked safe — a bound key stamps its own source — but on an
   * UNBOUND key it writes NULL and still returns 201, so dedup breaks
   * SILENTLY. Sending a wrong name fails loudly with a 400 naming the correct
   * one. Prefer the loud failure.
   *
   * The match is CASE-SENSITIVE and not trimmed on unbound keys, so " BD OS "
   * would become a third distinct source matching nothing.
   */
  source: string;
  actor_id?: string | null;
  external_event_id: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
};

/**
 * Credential resolution lives in lib/groundstream/credentials.ts (database
 * first, then GS_KEY_<WORKSPACE>, then GS_API_KEY). This module stays a thin
 * HTTP layer and takes the resolved key as an argument, so the transport can be
 * unit-tested without a database and the resolution order exists in exactly one
 * place.
 *
 * `tenant_id` is never read from the payload — the key alone decides where an
 * event lands, which is why there is no entity field on the wire.
 */

export type SendResult =
  | { ok: true; accepted: number; deduped: number }
  | { ok: false; retryable: boolean; error: string };

/** POST one batch (≤500) with an already-resolved key. Never throws. */
export async function sendBatch(key: string, events: GsEvent[]): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch (e) {
    // Network-level failure: always worth retrying.
    return { ok: false, retryable: true, error: e instanceof Error ? e.message : "network error" };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { accepted?: number; deduped?: number };
    return { ok: true, accepted: body.accepted ?? 0, deduped: body.deduped ?? 0 };
  }

  const text = await res.text().catch(() => "");
  // 4xx except 429 means the payload is wrong — retrying cannot fix it, so do not
  // spin forever on a malformed event. 429 and 5xx are transient.
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}
