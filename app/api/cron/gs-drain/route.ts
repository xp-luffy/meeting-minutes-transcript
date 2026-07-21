import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch, type GsEvent, type SendResult } from "@/lib/groundstream/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `source` is bound to the API key (GS change I31). A wizard-issued key makes
// GroundStream stamp the source itself, and sending one that DISAGREES with the
// binding is a hard 400 — which would poison-pill every batch. So this is left
// UNSET by default and the field omitted.
//
// It stays supported for platform-issued and legacy keys, which are unbound and
// do fall back to the body value. If you set it, it must match the registered
// source exactly: it is half the dedup key on those keys, so changing it later
// re-inserts all history as new.
const SOURCE = process.env.GS_SOURCE;

const MAX_ATTEMPTS = 12;
const CRON_INTERVAL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** Per-row backoff: 5m, 10m, 20m, 40m … capped at 6h. ~24h of retries before a row dies. */
function backoffFor(attempts: number): number {
  return Math.min(CRON_INTERVAL_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("gs_outbox")
    .select("*")
    .is("delivered_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(500);

  // Do NOT collapse a read failure into `{drained: 0}` with a 200 — the cron would look
  // healthy for as long as the outbox silently backed up.
  if (error) {
    return NextResponse.json({ error: `outbox read failed: ${error.message}` }, { status: 500 });
  }
  if (!rows?.length) return NextResponse.json({ drained: 0 });

  // One request per entity — a batch may only ever carry one key.
  const byEntity = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byEntity.get(r.entity) ?? [];
    list.push(r);
    byEntity.set(r.entity, list);
  }

  let delivered = 0;
  for (const [entity, batch] of byEntity) {
    const events: GsEvent[] = batch.map((r) => ({
      aa_stage: r.aa_stage,
      event_name: r.event_name,
      // Omitted entirely unless GS_SOURCE is set — see the note above. Spreading
      // rather than sending `undefined` keeps it out of the JSON body.
      ...(SOURCE ? { source: SOURCE } : {}),
      actor_id: r.actor_id,
      external_event_id: r.external_event_id,
      occurred_at: new Date(r.occurred_at).toISOString(),
      payload: r.payload ?? {},
    }));

    const result = await sendBatch(entity, events);

    // POISON PILL. The API validates a batch as a UNIT: one malformed event 400s the whole
    // request and writes nothing. Applying that failure to all 500 rows meant the offender —
    // always lowest-id, so always back in the next window — burned every row's attempts until
    // the entire batch aged out. One bad event silently destroyed 499 good ones.
    if (!result.ok && !result.retryable && batch.length > 1) {
      for (let i = 0; i < batch.length; i++) {
        const one = await sendBatch(entity, [events[i]]);
        await recordOutcome(db, [batch[i]], one);
        if (one.ok) delivered += 1;
      }
      continue;
    }

    await recordOutcome(db, batch, result);
    if (result.ok) delivered += batch.length;
  }

  // Rows past MAX_ATTEMPTS are excluded by the query above, so without counting them here
  // they vanish: permanently undelivered, invisible, while the endpoint reports 200 forever.
  // A non-zero `dead` means you are losing data — alert on it.
  const { count: dead } = await db
    .from("gs_outbox")
    .select("id", { count: "exact", head: true })
    .is("delivered_at", null)
    .gte("attempts", MAX_ATTEMPTS);

  const { count: pending } = await db
    .from("gs_outbox")
    .select("id", { count: "exact", head: true })
    .is("delivered_at", null)
    .lt("attempts", MAX_ATTEMPTS);

  return NextResponse.json({ drained: delivered, pending: pending ?? 0, dead: dead ?? 0 });
}

/**
 * Record the outcome of one send against its rows. Checks the update error — discarding it
 * would let the endpoint report rows as drained that were never marked, so they redeliver
 * forever while the number says everything is fine.
 */
async function recordOutcome(
  db: ReturnType<typeof createAdminClient>,
  rows: { id: number; attempts: number | null }[],
  result: SendResult,
) {
  if (result.ok) {
    const { error } = await db
      .from("gs_outbox")
      .update({ delivered_at: new Date().toISOString(), last_error: null })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (error)
      console.error("[gs] mark-delivered FAILED", {
        ids: rows.map((r) => r.id),
        error: error.message,
      });
    return;
  }

  // Backoff is computed per row from ITS OWN attempts — deriving one delay from batch[0]
  // applied the first row's schedule to rows with entirely different histories.
  for (const r of rows) {
    const attempts = (r.attempts ?? 0) + 1;
    const { error } = await db
      .from("gs_outbox")
      .update({
        attempts,
        next_attempt_at: new Date(Date.now() + backoffFor(attempts)).toISOString(),
        last_error: result.error.slice(0, 500),
      })
      .eq("id", r.id);
    if (error) console.error("[gs] outbox retry-update FAILED", { id: r.id, error: error.message });
    if (attempts >= MAX_ATTEMPTS) {
      console.error("[gs] EVENT DEAD — exceeded MAX_ATTEMPTS, will never be delivered", {
        id: r.id,
        last_error: result.error.slice(0, 200),
      });
    }
  }
}
