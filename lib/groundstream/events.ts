import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "./emit";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";

/**
 * Meeting Minutes — the app's entire GroundStream contribution, declared here.
 *
 * ACTOR is the company secretary (auth user id) throughout. The journey being
 * measured is a cosec going from "set up a client" to "signed off a statutory
 * record that an outside director then confirmed". Never the director's email,
 * never a company id — same human, same actor_id, for life (spec rule 2).
 *
 * ENTITY. The spec assumes the app has an org/tenant column to map to a key.
 * This app does NOT: it is multi-tenant by user_id/workspace_id, and every
 * tenant belongs to the same business. So the entity is a constant read from
 * GS_ENTITY at the call site, and there is deliberately no per-record mapping
 * to invent. If this app ever serves a second business entity, that decision
 * has to be made properly against a real column — not guessed here.
 *
 * STAGES. The externally-decided moment is the point of the whole product: a
 * director confirming minutes via the anonymous review link is the one signal
 * the cosec cannot manufacture, which is why it is `retained` rather than
 * another self-reported success.
 *
 *   acquired   a client company is on the books
 *   engaged    a meeting exists and has a transcript
 *   activated  minutes generated / reviewed / the constitution is on file
 *   converted  minutes marked FINAL — the statutory record is signed off
 *   retained   an outside recipient confirmed the minutes are accurate
 *
 * FAILURES (spec rule 4) are the useful half: `finalisation_blocked` and
 * `assurance_risk_acknowledged` are where a cosec actually gets stuck, and the
 * reason is in the payload. Successes say it worked; these say where it dies.
 *
 * NAMES ARE PERMANENT (rule 5). Renaming any event_name below splits its
 * history in two.
 */

/** The business entity this app reports under. Constant — see ENTITY note above. */
export function gsEntity(): string | null {
  const entity = process.env.GS_ENTITY;
  return entity && entity.length > 0 ? entity : null;
}

/**
 * The only way call sites should emit.
 *
 * Handles the three things every call site would otherwise repeat and
 * eventually get wrong:
 *
 *  - builds the SERVICE-ROLE client (the outbox is RLS-deny-all; a
 *    request-scoped client is denied on every insert, silently)
 *  - resolves the entity constant, and skips cleanly when it is unset
 *  - never lets a telemetry problem fail the user's action
 *
 * It is loud about being unconfigured but only ONCE per process, so a
 * deployment without keys does not bury real errors under a log flood. It
 * still never reports success it did not have — nothing here returns a value
 * that a caller could mistake for delivery.
 */
let warnedUnconfigured = false;

export async function emitGs(
  fn: (admin: SupabaseClient, entity: string, at: string) => Promise<void>,
  at: string = new Date().toISOString(),
): Promise<void> {
  const entity = gsEntity();
  if (!entity || !adminClientAvailable()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[gs] not configured — events are NOT being recorded. Set GS_ENTITY and " +
          "SUPABASE_SERVICE_ROLE_KEY (server-side only) to enable the outbox.",
      );
    }
    return;
  }

  try {
    await fn(createAdminClient(), entity, at);
  } catch (err) {
    // emit() already swallows its own errors; this catches a failure to build
    // the admin client. A user's meeting must never fail over telemetry.
    console.error("[gs] emit wrapper THREW", err);
  }
}

export const gsEvents = {
  // ── acquired ──────────────────────────────────────────────────────────────
  companyAdded: (db: SupabaseClient, entity: string, userId: string, companyId: string, at: string) =>
    emit(db, entity, {
      aa_stage: "acquired",
      event_name: "company_added",
      actor_id: userId,
      external_event_id: `company-${companyId}-added`,
      occurred_at: at,
      payload: { company_id: companyId },
    }),

  // ── engaged ───────────────────────────────────────────────────────────────
  meetingCreated: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    meetingId: string,
    meetingType: string,
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "engaged",
      event_name: "meeting_created",
      actor_id: userId,
      external_event_id: `meeting-${meetingId}-created`,
      occurred_at: at,
      payload: { meeting_id: meetingId, meeting_type: meetingType },
    }),

  transcriptAdded: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    meetingId: string,
    wordCount: number,
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "engaged",
      event_name: "transcript_added",
      actor_id: userId,
      external_event_id: `meeting-${meetingId}-transcript-added`,
      occurred_at: at,
      payload: { meeting_id: meetingId, word_count: wordCount },
    }),

  // ── activated ─────────────────────────────────────────────────────────────
  minutesGenerated: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    draftId: string,
    meta: { meeting_id: string; source: string; assurance_score: number | null },
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "activated",
      event_name: "minutes_generated",
      actor_id: userId,
      external_event_id: `draft-${draftId}-generated`,
      occurred_at: at,
      payload: meta,
    }),

  minutesReviewed: (db: SupabaseClient, entity: string, userId: string, draftId: string, at: string) =>
    emit(db, entity, {
      aa_stage: "activated",
      event_name: "minutes_reviewed",
      actor_id: userId,
      external_event_id: `draft-${draftId}-reviewed`,
      occurred_at: at,
      payload: { draft_id: draftId },
    }),

  constitutionFiled: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    companyId: string,
    documentId: string,
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "activated",
      event_name: "constitution_filed",
      actor_id: userId,
      external_event_id: `document-${documentId}-filed`,
      occurred_at: at,
      payload: { company_id: companyId, document_id: documentId },
    }),

  // ── converted ─────────────────────────────────────────────────────────────
  /**
   * The core job completed. Losing this makes the conversion number wrong
   * forever, so it belongs on the atomic §6.5 path eventually — see the note in
   * the call site. Until then the §7b sweep is what catches a dropped one.
   */
  minutesFinalised: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    draftId: string,
    meta: { meeting_id: string; assurance_score: number | null; assurance_fails: string[] },
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "converted",
      event_name: "minutes_finalised",
      actor_id: userId,
      external_event_id: `draft-${draftId}-finalised`,
      occurred_at: at,
      payload: meta,
    }),

  // ── retained ──────────────────────────────────────────────────────────────
  /**
   * Decided OUTSIDE the business — an anonymous recipient attesting the minutes
   * are accurate. The cosec cannot manufacture this, which is exactly what makes
   * it worth measuring. actor stays the cosec: it is their journey, and the
   * confirmer has no stable id here (and must not be identified by email).
   */
  minutesConfirmed: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    draftId: string,
    meta: { meeting_id: string; confirmation_count: number },
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "retained",
      event_name: "minutes_confirmed_by_recipient",
      actor_id: userId,
      external_event_id: `draft-${draftId}-confirmed`,
      occurred_at: at,
      payload: meta,
    }),

  // ── failures (spec rule 4) ────────────────────────────────────────────────
  /**
   * The completeness gate refused sign-off. This is the most useful event in
   * the map: it says where cosecs get stuck and which statutory check stopped
   * them.
   *
   * The id is deterministic per DRAFT, so repeated blocks on the same draft
   * dedupe to one event. That is the spec's rule (never derive from a
   * timestamp) and it is the right trade: "this draft was blocked" is the fact
   * worth recording. Frequency is not recoverable from this — accepted.
   */
  finalisationBlocked: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    draftId: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "activated",
      event_name: "finalisation_blocked",
      actor_id: userId,
      external_event_id: `draft-${draftId}-finalisation-blocked`,
      occurred_at: at,
      payload: meta,
    }),

  /**
   * Finalised anyway, with a named person accepting the outstanding gaps. Not a
   * failure of the software — a deliberate risk acceptance, and the single most
   * defensibility-relevant thing that happens in this product.
   */
  assuranceRiskAcknowledged: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    draftId: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "activated",
      event_name: "assurance_risk_acknowledged",
      actor_id: userId,
      external_event_id: `draft-${draftId}-risk-acknowledged`,
      occurred_at: at,
      payload: meta,
    }),

  generationFailed: (
    db: SupabaseClient,
    entity: string,
    userId: string,
    meetingId: string,
    reason: string,
    at: string,
  ) =>
    emit(db, entity, {
      aa_stage: "engaged",
      event_name: "minutes_generation_failed",
      actor_id: userId,
      external_event_id: `meeting-${meetingId}-generation-failed`,
      occurred_at: at,
      payload: { meeting_id: meetingId, reason: reason.slice(0, 500) },
    }),
};
