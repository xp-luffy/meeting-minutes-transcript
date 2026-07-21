const ENDPOINT = "https://groundstream.co/api/v1/events";

export type GsEvent = {
  aa_stage: "acquired" | "engaged" | "activated" | "converted" | "retained";
  event_name: string;
  /**
   * OPTIONAL, and normally omitted.
   *
   * `source` is bound to the API key (GS change I31): a key issued through the
   * connect wizard makes GroundStream stamp the bound source itself, and
   * sending one that DISAGREES with the binding is a hard 400 naming both. Only
   * platform-issued and legacy keys are unbound and fall back to the body.
   *
   * So this app sends it only when GS_SOURCE is explicitly set, which is the
   * legacy escape hatch — not the default. The downloaded v1 spec still says to
   * always send it; the canonical reference supersedes that.
   */
  source?: string;
  actor_id?: string | null;
  external_event_id: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
};

/** Resolve the key for an entity. Returns null if this app does not serve it. */
export function keyForEntity(entity: string): string | null {
  const key = process.env[`GS_KEY_${entity.toUpperCase()}`];
  return key && key.length > 0 ? key : null;
}

export type SendResult =
  | { ok: true; accepted: number; deduped: number }
  | { ok: false; retryable: boolean; error: string };

/** POST one batch (≤500) for a single entity. Never throws. */
export async function sendBatch(entity: string, events: GsEvent[]): Promise<SendResult> {
  const key = keyForEntity(entity);
  if (!key) return { ok: false, retryable: false, error: `No GS key configured for ${entity}` };

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
