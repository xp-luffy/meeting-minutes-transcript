import type { SupabaseClient } from "@supabase/supabase-js";

export interface LogAuditParams {
  meetingId: string;
  entityType: string;
  entityId: string | null;
  action: string;
  payload?: Record<string, unknown>;
}

/**
 * Insert a row into audit_logs. Never throws — audit logging must never break
 * the main flow, so any error is swallowed (and reported to console.error).
 */
export async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  { meetingId, entityType, entityId, action, payload }: LogAuditParams,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      meeting_id: meetingId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      payload: payload ?? {},
    });

    if (error) {
      console.error("logAudit: insert failed", error);
    }
  } catch (err) {
    console.error("logAudit: unexpected error", err);
  }
}
