import type { SupabaseClient } from "@supabase/supabase-js";
import type { GsEvent } from "./client";

export type EmitInput = Omit<GsEvent, "source" | "occurred_at"> & { occurred_at?: string };

/**
 * Enqueue an event.
 *
 * `db` MUST be a SERVICE-ROLE client. gs_outbox is RLS-deny-all with no policies, so a
 * request-scoped (anon/authenticated) client is refused on every insert.
 *
 * Never throws — a telemetry failure must not fail the user's action — but never stays
 * SILENT either. supabase-js RESOLVES with `{ error }` rather than throwing on database
 * errors, so a bare try/catch catches nothing and an unchecked result discards every RLS
 * denial, constraint violation and type error. Swallow the throw; never the diagnosis.
 */
export async function emit(db: SupabaseClient, entity: string, e: EmitInput): Promise<void> {
  try {
    const { error } = await db.from("gs_outbox").upsert(
      {
        entity,
        aa_stage: e.aa_stage,
        event_name: e.event_name,
        actor_id: e.actor_id ?? null,
        external_event_id: e.external_event_id,
        occurred_at: e.occurred_at ?? new Date().toISOString(),
        payload: e.payload ?? {},
      },
      { onConflict: "entity,external_event_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[gs] outbox enqueue FAILED", {
        entity,
        external_event_id: e.external_event_id,
        event_name: e.event_name,
        error: error.message,
      });
    }
  } catch (err) {
    // Only network/abort failures reach here — supabase-js returns DB errors, it does not throw.
    console.error("[gs] outbox enqueue THREW", { external_event_id: e.external_event_id, err });
  }
}
