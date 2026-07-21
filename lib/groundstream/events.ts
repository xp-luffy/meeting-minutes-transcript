import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "./emit";
import { adminClientAvailable, createAdminClient } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/auth";

/**
 * Meeting Minutes — the app's entire GroundStream contribution, declared here.
 *
 * ACTOR IS THE CLIENT COMPANY, not the company secretary. The actor is "the
 * customer, buyer, client company or counterparty whose progression toward
 * revenue you're measuring — almost never your internal user". The cosec is the
 * operator; the book of business is the client companies. The test is whether
 * the ACTOR's state changed, not who clicked.
 *
 * STAGES — chosen to expose the stall that matters.
 *
 *   acquired   company_added                     a client is on the book
 *   engaged    meeting_created, transcript_added,
 *              minutes_generated                 meaningful, nothing committed
 *   activated  minutes_finalised,
 *              minutes_confirmed_by_recipient    the key action: signed off
 *   retained   company_minutes_repeat            2nd+ finalised meeting
 *   converted  NOT EMITTED
 *
 * A generated draft is deliberately `engaged`. Finalising is the commitment;
 * putting both at `activated` would hide "drafted but never finalised", the
 * single most useful stall in this product.
 *
 * NO `converted` EVENTS. This app has no payment, no invoice and no externally
 * verified commercial approval. Inventing one to make the funnel terminate
 * would be a fabricated number, so this workspace has no conversion rate until
 * a billing source connects.
 *
 * FAILURES are the useful half: finalisation_blocked names the statutory check
 * that stopped the work; assurance_risk_acknowledged records a sign-off where a
 * named person accepted outstanding gaps.
 *
 * event_name IS PERMANENT — renaming any of these splits its history in two.
 */

/**
 * Which workspace a record belongs to — now the acting ORGANISATION's slug.
 *
 * This used to return the `GS_WORKSPACE` env constant, which is correct for
 * exactly one tenant and silently wrong for two: every firm's events would be
 * filed under whichever workspace the deployment happened to name, and there is
 * no undo for that (/gs §5 — "the key decides, nothing else").
 *
 * The organisation slug is the identifier because it is stable, unique, and the
 * same value an admin registers as their GroundStream source name — so the
 * outbox row, the credential lookup and the operator UI all join on one string.
 *
 * Returns null when the caller has no organisation, and every caller must then
 * emit NOTHING. A missing event is recoverable; an event filed against another
 * firm's workspace is not.
 */
export async function workspaceForRecord(): Promise<string | null> {
  const org = await getOrgContext();
  return org?.slug ?? null;
}

// There is deliberately NO env-var workspace fallback. GS_WORKSPACE is gone:
// the tenant is the organisation on the record, and a deployment-wide constant
// can only ever name one of them. Keeping a fallback would mean a missing
// organisation silently resolves to whichever tenant the env var happened to
// name — the exact un-undoable misfiling this function was rewritten to prevent.

/**
 * Identity hint — CANNOT BE ADDED RETROACTIVELY.
 *
 * `actor_id` is the client COMPANY, which is right for measuring client
 * progression but says nothing about the human. Without a hint, the same person
 * operating here and in another app is TWO people in GroundStream, and their
 * history splits permanently. Adding it later does not merge them; the
 * identities already exist.
 *
 * So events carry `payload.identity.email` for the human who caused them,
 * alongside the company actor. The email is a resolution hint for GroundStream,
 * never our own actor key — emails change, and an email used as an id splits
 * the person the day it does.
 *
 * Omitted entirely when no human is known. An outside director confirming
 * minutes never signed up anywhere, and minting an identity for them would
 * create a person in GroundStream who does not exist.
 */
export type Identity = { email?: string | null; user_id?: string | null };

export function identityPayload(identity?: Identity): Record<string, unknown> {
  const email = identity?.email?.trim();
  const userId = identity?.user_id?.trim();
  if (!email && !userId) return {};
  return { identity: { ...(email ? { email } : {}), ...(userId ? { user_id: userId } : {}) } };
}

/**
 * The only way call sites should emit.
 *
 *  - builds the SERVICE-ROLE client (the outbox is RLS-deny-all; a
 *    request-scoped client is refused on every insert, silently)
 *  - resolves the workspace, and skips cleanly when unconfigured
 *  - never lets a telemetry problem fail the user's action
 *
 * Warns once per process when unconfigured so a keyless deployment does not
 * bury real errors, and never reports a success it did not have.
 */
let warnedUnconfigured = false;

export async function emitGs(
  fn: (admin: SupabaseClient, workspace: string, at: string) => Promise<void>,
  at: string = new Date().toISOString(),
): Promise<void> {
  const workspace = await workspaceForRecord();
  if (!workspace || !adminClientAvailable()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[gs] not configured — events are NOT being recorded. Needs an organisation for " +
          "the acting user and SUPABASE_SERVICE_ROLE_KEY (server-side only).",
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
  companyAdded: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "acquired",
      event_name: "company_added",
      actor_id: companyId,
      external_event_id: `company-${companyId}-added`,
      occurred_at: at,
      payload: { ...identityPayload(identity) },
    }),

  // ── engaged ───────────────────────────────────────────────────────────────
  meetingCreated: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    meetingType: string,
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "meeting_created",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-created`,
      occurred_at: at,
      payload: { meeting_id: meetingId, meeting_type: meetingType, ...identityPayload(identity) },
    }),

  transcriptAdded: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    wordCount: number,
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "transcript_added",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-transcript-added`,
      occurred_at: at,
      payload: { meeting_id: meetingId, word_count: wordCount, ...identityPayload(identity) },
    }),

  /** A draft exists but nothing is committed — the stall this makes visible. */
  minutesGenerated: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; generator: string; assurance_score: number | null },
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "minutes_generated",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-generated`,
      occurred_at: at,
      payload: { ...meta, ...identityPayload(identity) },
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
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "activated",
      event_name: "minutes_finalised",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-finalised`,
      occurred_at: at,
      payload: { ...meta, ...identityPayload(identity) },
    }),

  // ── retained ──────────────────────────────────────────────────────────────
  /**
   * The company came back: a second or later finalised meeting.
   *
   * `ordinal` must be a STABLE ordinal of the record — the count of finalised
   * meetings for that company including this one — never a live count at emit
   * time, which would change on backfill and mint a different id for the same
   * event.
   */
  companyReturned: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    ordinal: number,
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "retained",
      event_name: "company_minutes_repeat",
      actor_id: companyId,
      external_event_id: `company-${companyId}-finalised-${ordinal}`,
      occurred_at: at,
      payload: { meeting_id: meetingId, ordinal, ...identityPayload(identity) },
    }),

  // ── failures ──────────────────────────────────────────────────────────────
  /**
   * The completeness gate refused sign-off, and which check stopped it.
   *
   * The failing check is IN THE ID, so the same draft blocked for two different
   * reasons records both — one event per (draft, check). Deterministic and
   * backfill-safe; a repeat block for the SAME reason dedupes, which is the
   * intent. A discriminator is an extension of the stated
   * `<record>-<id>-<transition>` format that the reference does not settle
   * either way — logged in the harvest.
   */
  finalisationBlocked: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    failedCheck: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "finalisation_blocked",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-blocked-${failedCheck}`,
      occurred_at: at,
      payload: { ...meta, failed_check: failedCheck, ...identityPayload(identity) },
    }),

  /** Signed off WITH gaps a named person accepted. */
  assuranceRiskAcknowledged: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    draftId: string,
    meta: { meeting_id: string; failed_checks: string[] },
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "activated",
      event_name: "assurance_risk_acknowledged",
      actor_id: companyId,
      external_event_id: `draft-${draftId}-risk-acknowledged`,
      occurred_at: at,
      payload: { ...meta, ...identityPayload(identity) },
    }),

  generationFailed: (
    db: SupabaseClient,
    ws: string,
    companyId: string,
    meetingId: string,
    reason: string,
    at: string,
    identity?: Identity,
  ) =>
    emit(db, ws, {
      aa_stage: "engaged",
      event_name: "minutes_generation_failed",
      actor_id: companyId,
      external_event_id: `meeting-${meetingId}-generation-failed`,
      occurred_at: at,
      payload: { meeting_id: meetingId, reason: reason.slice(0, 500), ...identityPayload(identity) },
    }),
};
