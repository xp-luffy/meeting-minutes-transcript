"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { CLEAR_OWNER, KEEP_TEXT_ONLY, type OwnerCandidate } from "@/lib/owners";

/**
 * Server actions for linking an action item's owner to a real person.
 *
 * Two rules govern this whole file:
 *
 *  1. NOTHING here ever links an owner on its own. `search_owner_candidates`
 *     returns an `exact_match` flag and the UI pre-highlights it, but the row
 *     is only written when a human submits the form. Silently binding
 *     "Aisyah" to *Aisyah binti Rahman* is the app asserting a fact it merely
 *     inferred, in the one place the product exists to prevent that.
 *
 *  2. Every mutation re-verifies ownership with a FILTERED query and a 0-row
 *     guard, and every failure is RETURNED to the caller so the UI can show
 *     it. A catch that logs and returns silently is a bug here — the user
 *     would believe a legal owner was recorded when it was not
 *     (docs/PILOT_PLAYBOOK.md pattern A).
 */

export interface OwnerActionState {
  error?: string;
  /** Set on success — the UI announces it in a polite live region. */
  message?: string;
  success?: true;
}

export interface OwnerSearchResult {
  candidates: OwnerCandidate[];
  companyName: string | null;
  error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toAliasArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * People this user could plausibly mean, ranked with the company's own people
 * first. The meeting id is re-read under RLS first, so a caller cannot use a
 * meeting they cannot see to enumerate a company's people.
 */
export async function searchOwnerCandidates(
  meetingId: string,
  query: string,
): Promise<OwnerSearchResult> {
  if (!meetingId || !UUID_RE.test(meetingId)) {
    return { candidates: [], companyName: null, error: "Invalid meeting." };
  }

  const supabase = await createClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, company_id, company_name")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    return { candidates: [], companyName: null, error: meetingError.message };
  }
  if (!meeting) {
    return { candidates: [], companyName: null, error: "Meeting not found." };
  }

  const typedMeeting = meeting as { id: string; company_id: string | null; company_name: string };

  const { data, error } = await supabase.rpc("search_owner_candidates", {
    p_query: query ?? "",
    p_company_id: typedMeeting.company_id,
    p_limit: 20,
  });

  if (error) {
    // Surfaced, never swallowed — the picker renders "Couldn't load people. [Retry]"
    // and keeps "Keep as text only" available so the user is not blocked.
    return { candidates: [], companyName: typedMeeting.company_name, error: error.message };
  }

  type Row = {
    id: string;
    canonical_name: string;
    aliases: unknown;
    at_company: boolean;
    company_relation: string | null;
    meeting_count: number | string;
    exact_match: boolean;
  };

  const candidates: OwnerCandidate[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    canonical_name: r.canonical_name,
    aliases: toAliasArray(r.aliases),
    at_company: Boolean(r.at_company),
    company_relation: r.company_relation,
    meeting_count: Number(r.meeting_count) || 0,
    exact_match: Boolean(r.exact_match),
  }));

  return { candidates, companyName: typedMeeting.company_name };
}

/** Latest draft status for a meeting — 'final' locks the DOCUMENT text. */
async function draftStatusFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  meetingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("minutes_drafts")
    .select("status")
    .eq("meeting_id", meetingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.status as string | undefined) ?? null;
}

/**
 * Assigns (or clears) the owner of one action item.
 *
 * Form fields:
 *   itemId, meetingId      — required
 *   choice                 — an entity uuid, KEEP_TEXT_ONLY, or CLEAR_OWNER
 *   alsoUpdateName         — "on" to rewrite the RECORDED owner_name too
 *   candidateName          — the canonical name, only used when alsoUpdateName is on
 *   suggested              — "1" if this option was the pre-highlighted exact match
 *
 * On a FINAL draft the recorded text is locked and the link is not: the link
 * is tracking metadata, not document content. The UI states exactly that.
 */
export async function assignActionItemOwner(
  _prevState: OwnerActionState,
  formData: FormData,
): Promise<OwnerActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const choice = String(formData.get("choice") ?? "");
  const alsoUpdateName = formData.get("alsoUpdateName") === "on";
  const candidateName = String(formData.get("candidateName") ?? "").trim();
  const wasSuggested = formData.get("suggested") === "1";

  if (!UUID_RE.test(itemId) || !UUID_RE.test(meetingId)) {
    return { error: "Couldn't identify that action item — reload the page and try again." };
  }
  if (!choice) {
    return { error: "Choose a person, or choose to keep the recorded text." };
  }

  const supabase = await createClient();

  // ── Re-verify ownership: filtered read + 0-row guard. RLS is the real
  //    boundary, but a 0-row result here is what turns a denied write into a
  //    message the user actually sees instead of a no-op.
  const { data: existing, error: readError } = await supabase
    .from("action_items")
    .select("id, owner_name, owner_entity_id")
    .eq("id", itemId)
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (readError) {
    return { error: readError.message };
  }
  if (!existing) {
    return { error: "That action item isn't available to you — it may have been deleted." };
  }

  const before = existing as { id: string; owner_name: string | null; owner_entity_id: string | null };
  const isFinal = (await draftStatusFor(supabase, meetingId)) === "final";

  const patch: { owner_entity_id?: string | null; owner_name?: string | null } = {};
  let linkedName: string | null = null;

  if (choice === CLEAR_OWNER) {
    if (isFinal) {
      return {
        error:
          "These minutes are final — the recorded owner text is locked, so it can't be cleared. You can still unlink the person.",
      };
    }
    patch.owner_entity_id = null;
    patch.owner_name = null;
  } else if (choice === KEEP_TEXT_ONLY) {
    // Honest, first-class option: sometimes the minutes genuinely say "Finance".
    patch.owner_entity_id = null;
  } else {
    if (!UUID_RE.test(choice)) {
      return { error: "That isn't a person we recognise — reopen the picker and try again." };
    }

    // Confirm the entity is a person THIS user can see. RLS on action_items
    // (migration 0017) rejects a cross-tenant entity id as well; this check
    // exists so the rejection arrives as a sentence rather than a 0-row write.
    const { data: person, error: personError } = await supabase
      .from("entities")
      .select("id, canonical_name")
      .eq("id", choice)
      .eq("kind", "person")
      .maybeSingle();

    if (personError) {
      return { error: personError.message };
    }
    if (!person) {
      return { error: "That person isn't available to you — reopen the picker and try again." };
    }

    linkedName = (person as { canonical_name: string }).canonical_name;
    patch.owner_entity_id = choice;

    if (alsoUpdateName) {
      if (isFinal) {
        return {
          error:
            "These minutes are final — the recorded owner text is locked. Uncheck “also update the recorded name” to link the person for tracking.",
        };
      }
      patch.owner_name = candidateName || linkedName;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("action_items")
    .update(patch)
    .eq("id", itemId)
    .eq("meeting_id", meetingId)
    .select("id");

  if (updateError) {
    return { error: updateError.message };
  }
  // 0 rows means RLS refused the write (or the row moved). Never treat the
  // absence of an error as success — that is the silent no-op this playbook
  // names as the dominant escaped-bug pattern.
  if (!updated || updated.length === 0) {
    return {
      error: "Couldn't save the owner — the change was not written. Reload the page and try again.",
    };
  }

  await logAudit(supabase, {
    meetingId,
    entityType: "action_item",
    entityId: itemId,
    action: "owner_linked",
    payload: {
      before: { owner_entity_id: before.owner_entity_id, owner_name: before.owner_name },
      after: {
        owner_entity_id: patch.owner_entity_id ?? null,
        owner_name: "owner_name" in patch ? patch.owner_name : before.owner_name,
      },
      suggested: wasSuggested,
      recorded_name_rewritten: "owner_name" in patch,
    },
  });

  revalidatePath("/action-items");
  revalidatePath(`/meetings/${meetingId}/draft`, "page");
  if (before.owner_entity_id) revalidatePath(`/people/${before.owner_entity_id}`, "page");
  if (patch.owner_entity_id) revalidatePath(`/people/${patch.owner_entity_id}`, "page");

  const message =
    choice === CLEAR_OWNER
      ? "Owner cleared."
      : choice === KEEP_TEXT_ONLY
        ? `Kept as recorded text only${before.owner_name ? ` — “${before.owner_name}”` : ""}.`
        : `Owner set to ${linkedName}.`;

  return { success: true, message };
}
