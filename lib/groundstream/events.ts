import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "./emit";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

/**
 * Meeting Minutes — the app's entire GroundStream contribution, declared here.
 *
 * ACTOR IS THE CLIENT COMPANY, not the company secretary.
 * The actor is "the customer, buyer, client company or counterparty whose
 * progression toward revenue you're measuring — almost never your internal
 * user". The cosec is the operator; the book of business is the client
 * companies. So a company progresses acquired -> engaged -> activated as its
 * statutory work gets done, and the test is whether the ACTOR's state changed,
 * not who clicked. (An earlier version of this file used the cosec's auth id,
 * which would have measured staff activity instead of client progression.)
 *
 * STAGES — chosen to expose the stall that matters.
 *
 *   acquired   company_added                       a client is on the book
 *   engaged    meeting_created, transcript_added,
 *              minutes_generated                   meaningful, nothing committed
 *   activated  minutes_finalised                   the key action: a statutory
 *                                                  record signed off
 *   retained   minutes_finalised (2nd+ for that company)
 *   converted  NOT EMITTED — see below
 *
 * A generated draft is deliberately `engaged`, not `activated`. Finalising is
 * the commitment; putting both at `activated` would hide "drafted but never
 * finalised", which is the single most useful stall in this product.
 *
 * NO `converted` EVENTS. This app never touches money: no payment, no invoice,
 * no externally verified commercial approval. Inventing one to make the funnel
 * terminate would be a fabricated number. This workspace therefore has no
 * conversion rate until a billing source connects. Said out loud rather than
 * papered over.
 *
 * FAILURES are the useful half. finalisation_blocked says which statutory check
 * stopped the work; assurance_risk_acknowledged records a sign-off where a
 * named person accepted outstanding gaps.
 *
 * event_name IS PERMANENT — renaming any of these splits its history in two.
 */

/**
 * Which workspace a record belongs to. One workspace today, so this is a
 * constant — but it stays a per-record function because the outbox stores the
 * value and the drain groups by it. Moving to per-tenant credentials later
 * changes this function, not every call site.
 */
export function workspaceForRecord(): string | null {
  const ws = process.env.GS_WORKSPACE;
  return ws && ws.length > 0 ? ws : null;
}

/**
 * The only way call sites should emit.
 *
 *  - builds the SERVICE-ROLE client (the outbox is RLS-deny-all; a
 *    request-scoped client is refused on every insert, silently)
 *  - resolves the workspace, and skips cleanly when unconfigured
 *  - never lets a telemetry problem fail the user's action
 *
 * Warns once per process when unconfigured, so a deployment without keys does
 * not bury real errors under a log flood — but it never reports a success it
 * did not have.
 */
let warnedUnconfigured = false;

export async function emitGs(
  fn: (admin: SupabaseClient, workspace: string, at: string) => Promise<void>,
  at: string = new Date().toISOString(),
): Promise<void> {
  const workspace = workspaceForRecord();
  if (!workspace || !adminClientAvailable()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[gs] not configured — events are NOT being recorded. Set GS_WORKSPACE and " +
          "SUPABASE_SERVICE_ROLE_KEY (server-side only) to enable the outbox.",
      );
    }
    return;
  }

  try {
    await fn(createAdminClient(), workspace, at);
  } catch (err) {
    console.error("[gs] emit wrapper THREW", err);
  }
}

export const gsEvents = {
  // ── acquired ──────────────────────────────────────────────────────────────
  companyAdded: (db: SupabaseClient, ws: string, companyId: string, at: string) =>
    emit(db, ws, {
      aa_stage: "acquired",
      event_name: "company_added",
      actor_id: companyId,
      external_event_id: `company-${companyId}-added`,
      occurred_at: at,
    }),

  // ── engaged ───────────────────────────────────────────────────────────────
  meetingCreated: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    meetingType: string,
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "meeting_created",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-created`,
      occurred_at: at,
      payload: { meeting_id: meetingId, meeting_type: meetingType },
    }),

  transcriptAdded: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    wordCount: number,
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "transcript_added",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-transcript-added`,
      occurred_at: at,
      payload: { meeting_id: meetingId, word_count: wordCount },
    }),

  /** A draft exists but nothing is committed — the stall this makes visible. */
  minutesGenerated: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; generator: string; assurance_score: number | null },
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "minutes_generated",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-generated`,
      occurred_at: at,
      payload: meta,
    }),

  // ── activated ─────────────────────────────────────────────────────────────
  /** The key action: a statutory record signed off for this company. */
  minutesFinalised: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; assurance_score: number | null; assurance_fails: string[] },
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "activated",
      event_name: "minutes_finalised",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-finalised`,
      occurred_at: at,
      payload: meta,
    }),

  /** An outside recipient attested the minutes are accurate. */
  minutesConfirmed: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; confirmation_count: number },
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "activated",
      event_name: "minutes_confirmed_by_recipient",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-confirmed`,
      occurred_at: at,
      payload: meta,
    }),

  // ── retained ──────────────────────────────────────────────────────────────
  /**
   * The company came back: a second or later finalised meeting.
   *
   * `ordinal` must be a STABLE ordinal of the record — the count of finalised
   * meetings for that company up to and including this one — never a live
   * count(*) at emit time, which would change on backfill and produce a
   * different id for the same event.
   */
  companyReturned: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    ordinal: number,
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "retained",
      event_name: "company_minutes_repeat",
      actor_id: companyId,
      external_event_id: `company-${companyId}-finalised-${ordinal}`,
      occurred_at: at,
      payload: { meeting_id: meetingId, ordinal },
    }),

  // ── failures ──────────────────────────────────────────────────────────────
  /**
   * The completeness gate refused sign-off, and which check stopped it.
   *
   * The failing check is IN THE ID, so the same draft blocked twice for
   * different reasons records both — one event per (draft, check). Still fully
   * deterministic and backfill-safe; repeat blocks for the SAME reason dedupe,
   * which is the intent. This is a judgement the reference does not settle:
   * `<record>-<id>-<transition>` is the stated format, and a discriminator is a
   * deliberate extension of it — noted in the harvest.
   */
  finalisationBlocked: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    failedCheck: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "finalisation_blocked",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-blocked-${failedCheck}`,
      occurred_at: at,
      payload: { ...meta, failed_check: failedCheck },
    }),

  /** Signed off WITH gaps a named person accepted. */
  assuranceRiskAcknowledged: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "activated",
      event_name: "assurance_risk_acknowledged",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-risk-acknowledged`,
      occurred_at: at,
      payload: meta,
    }),

  generationFailed: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    reason: string,
    at: string,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "minutes_generation_failed",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-generation-failed`,
      occurred_at: at,
      payload: { meeting_id: meetingId, reason: reason.slice(0, 500) },
    }),
};
