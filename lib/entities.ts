import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Entity resolution: the invisible substrate the V3 graph depends on.
 * "Dato' Ahmad Fauzi", "Dato Ahmad", and "the Chairman" must resolve to ONE
 * node (an `entities` row) so that every edge in the graph — attendance,
 * directorships, action-item ownership, obligations — points at the same
 * person regardless of how a given transcript happened to refer to them.
 *
 * Section 1 (below, up to `resolveEntitiesForMeeting`) is deliberately
 * framework-free: no imports, pure string/array logic, so it can be
 * unit-tested in isolation (see scratchpad test-entities.ts) without a
 * Supabase project or a Next.js runtime. Only the server helper at the
 * bottom touches `@supabase/supabase-js` (type-only import, erased at
 * runtime) and the database.
 */

// ---------------------------------------------------------------------------
// 1. Pure functions — normalization, similarity, chair resolution, matching
// ---------------------------------------------------------------------------

/**
 * Leading Malaysian/English honorifics this app strips before comparing
 * names. Order matters only where one alternative is a strict text-prefix
 * of another with no word boundary between them ("puan sri" vs "puan") —
 * those pairs are ordered longest-first. Single-word pairs that merely share
 * a prefix ("mr" vs "mrs") are safe in any order because the trailing `\b`
 * requires a real word boundary, so "mr" cannot partially consume "mrs".
 */
const HONORIFIC_PATTERN =
  /^(tan sri|puan sri|dato|datuk|datin|encik|puan|tuan|haji|hajah|mrs|mr|ms|dr)\b[\s.]*/i;

/**
 * Normalizes a person's name for matching: lowercase, strip punctuation
 * (apostrophes — straight `'` and curly `’` — and periods, which only ever
 * appear in this domain as part of an honorific like "Dato'" or "Mr."),
 * strip leading honorifics (repeatedly, so stacked titles like
 * "Dato' Dr Ahmad" reduce all the way down), and collapse whitespace.
 *
 * "Dato' Ahmad Fauzi bin Ismail" -> "ahmad fauzi bin ismail"
 */
export function normalizePersonName(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading honorifics repeatedly until none remain (handles stacked
  // titles). Guarded by the "did anything change" check so it always
  // terminates even if a future edit to the pattern could otherwise loop.
  let previous: string;
  do {
    previous = result;
    result = result.replace(HONORIFIC_PATTERN, "").trim();
  } while (result !== previous && result.length > 0);

  return result.replace(/\s+/g, " ").trim();
}

/** Pads and extracts the character trigrams of a string (pg_trgm-style). */
function trigramSet(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Dice coefficient (2·|A∩B| / (|A|+|B|)) over two strings' trigram sets. */
function trigramDice(a: string, b: string): number {
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Similarity (0..1) between two person names. Normalizes both sides first
 * (honorifics stripped, case/whitespace folded), then scores with a
 * character-trigram Dice coefficient — deterministic, no dependencies.
 *
 * Plain trigram similarity alone badly underscores the case this resolver
 * exists for: a short reference ("Ahmad") against a full name ("Ahmad Fauzi
 * bin Ismail") shares only a fraction of its trigram mass with the longer
 * string, even though every token of the short form is contained in the
 * long form. So when every whitespace-token of the shorter normalized name
 * is a token of the longer one (a "token subset"), the score gets boosted
 * toward the top of the range — proportional to how much of the longer name
 * the short one covers — so short refs reliably clear a resolver's
 * match threshold.
 */
export function nameSimilarity(a: string, b: string): number {
  const normA = normalizePersonName(a);
  const normB = normalizePersonName(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const base = trigramDice(normA, normB);

  const tokensA = normA.split(" ").filter(Boolean);
  const tokensB = normB.split(" ").filter(Boolean);
  const [shortTokens, longTokens] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const isTokenSubset =
    shortTokens.length > 0 && shortTokens.every((t) => longTokens.includes(t));

  if (!isTokenSubset) return Math.min(1, base);

  const coverage = shortTokens.length / longTokens.length;
  const boosted = 0.6 + 0.4 * Math.max(base, coverage);
  return Math.min(1, Math.max(base, boosted));
}

/**
 * Resolves a generic chair reference ("the Chairman" / "Chairman" /
 * "the Chair" / "Chairperson") in free text to the name of the attendee
 * whose role looks like a chair role. Returns null when the text contains
 * no such reference, or no attendee's role matches.
 */
export function resolveChairReference(
  text: string,
  attendees: { name: string; role: string }[],
): string | null {
  if (!/\bchair(person|man)?\b/i.test(text)) return null;
  const chair = attendees.find((a) => /chair/i.test(a.role ?? ""));
  return chair ? chair.name : null;
}

/**
 * Finds the best-matching existing entity for `candidateName`, scoring
 * against both its canonical and normalized names (whichever reads closer)
 * and returning the highest scorer at or above `threshold`, or null if none
 * qualifies.
 */
export function bestEntityMatch(
  candidateName: string,
  existing: { id: string; normalized_name: string; canonical_name: string }[],
  threshold = 0.6,
): { id: string } | null {
  let bestId: string | null = null;
  let bestScore = -1;

  for (const entity of existing) {
    const score = Math.max(
      nameSimilarity(candidateName, entity.canonical_name),
      nameSimilarity(candidateName, entity.normalized_name),
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestId = entity.id;
    }
  }

  return bestId ? { id: bestId } : null;
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Entity {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  kind: "person" | "org";
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  reg_no: string | null;
  created_at: string;
}

export interface EntityLink {
  id: string;
  user_id: string | null;
  entity_id: string;
  target_type: "meeting" | "company" | "resolution" | "action_item" | "entity";
  target_id: string;
  relation: string;
  meeting_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 2. Server helper — resolves attendees + action-item owners for a meeting
//    into `entities`/`entity_links` rows. Best-effort and never throws: a
//    failure here must never break minutes generation.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

interface MeetingAttendee {
  name: string;
  role: string;
}

interface EntityCandidate {
  id: string;
  canonical_name: string;
  normalized_name: string;
  aliases: unknown;
}

export interface EntityResolutionResult {
  personIds: string[];
  created: number;
  linked: number;
}

/** Generic role-holder names seeded in the migration backfill — never worth a node. */
// Role/collective words that are NOT people — action-item owners and attendee
// entries often carry these ("Finance", "Company Secretary", "Legal Counsel",
// "the Board"). Resolving them as person entities creates junk pseudo-people
// that pollute the graph (QA finding). Match when the whole name is generic.
const GENERIC_NAMES = new Set([
  "shareholders", "various", "members", "member",
  "finance", "finance team", "the finance team", "legal", "legal team", "legal counsel",
  "management", "the management", "secretariat", "company secretary", "the company secretary",
  "board", "the board", "committee", "the committee", "chairman", "the chairman",
  "chairperson", "management team", "all", "everyone", "n/a", "tbc", "tba", "team",
]);

function isGenericName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[.]/g, "");
  if (GENERIC_NAMES.has(n)) return true;
  // A "name" with no personal-name shape (e.g. just a department/role word, or
  // a single generic token) — require at least two tokens OR a capitalised
  // personal-looking single name; reject pure role phrases.
  if (/\b(team|department|division|dept|committee|secretariat|counsel)\b/i.test(n)) return true;
  return false;
}

function aliasesArray(aliases: unknown): string[] {
  return Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [];
}

/** Maps an attendee's free-text role to the person→company edge relation. */
function roleToCompanyRelation(role: string): string {
  const r = (role ?? "").toLowerCase();
  if (/chair/.test(r)) return "chairman";
  if (/secretar/.test(r)) return "secretary";
  if (/director/.test(r)) return "director";
  if (/shareholder/.test(r)) return "shareholder";
  if (/member/.test(r)) return "member";
  return "associated";
}

/**
 * Ensures a person entity exists for `rawName` within the given scope,
 * reusing `bestEntityMatch` against the in-memory `candidates` cache
 * (mutated in place as new entities are created/aliased so later attendees
 * in the same meeting can match entities created earlier in the same run).
 * Returns null (and logs) if an insert is required but fails.
 */
async function ensureEntity(
  supabase: AnySupabaseClient,
  rawName: string,
  scope: { user_id: string | null; workspace_id: string | null },
  candidates: EntityCandidate[],
): Promise<{ id: string; created: boolean } | null> {
  const normalized = normalizePersonName(rawName);
  if (!normalized) return null;

  const match = bestEntityMatch(rawName, candidates);
  if (match) {
    const existing = candidates.find((c) => c.id === match.id);
    if (existing) {
      const aliases = aliasesArray(existing.aliases);
      if (!aliases.some((al) => al.toLowerCase() === rawName.toLowerCase())) {
        const nextAliases = [...aliases, rawName];
        const { error } = await supabase
          .from("entities")
          .update({ aliases: nextAliases })
          .eq("id", existing.id);
        if (error) {
          console.error("resolveEntitiesForMeeting: alias update failed", error);
        } else {
          existing.aliases = nextAliases;
        }
      }
    }
    return { id: match.id, created: false };
  }

  const { data: inserted, error } = await supabase
    .from("entities")
    .insert({
      user_id: scope.user_id,
      workspace_id: scope.workspace_id,
      kind: "person",
      canonical_name: rawName,
      normalized_name: normalized,
      aliases: [rawName],
    })
    .select("id, canonical_name, normalized_name, aliases")
    .single();

  if (error || !inserted) {
    console.error("resolveEntitiesForMeeting: entity insert failed", error);
    return null;
  }

  const row = inserted as EntityCandidate;
  candidates.push(row);
  return { id: row.id, created: true };
}

/**
 * Idempotently ensures an `entity_links` edge exists (matched on
 * entity_id + target_type + target_id, same as the migration 0009
 * backfill's `not exists` guards — `relation` is not part of the identity
 * so re-running never duplicates an edge even if the role text changes
 * wording between generations). Returns true if a new row was inserted.
 */
async function ensureEntityLink(
  supabase: AnySupabaseClient,
  link: {
    entity_id: string;
    target_type: EntityLink["target_type"];
    target_id: string;
    relation: string;
    meeting_id: string;
    user_id: string | null;
  },
): Promise<boolean> {
  const { data: existing, error: lookupError } = await supabase
    .from("entity_links")
    .select("id")
    .eq("entity_id", link.entity_id)
    .eq("target_type", link.target_type)
    .eq("target_id", link.target_id)
    .limit(1);

  if (lookupError) {
    console.error("resolveEntitiesForMeeting: entity_link lookup failed", lookupError);
    return false;
  }
  if (existing && existing.length > 0) return false;

  const { error: insertError } = await supabase.from("entity_links").insert({
    user_id: link.user_id,
    entity_id: link.entity_id,
    target_type: link.target_type,
    target_id: link.target_id,
    relation: link.relation,
    meeting_id: link.meeting_id,
  });

  if (insertError) {
    console.error("resolveEntitiesForMeeting: entity_link insert failed", insertError);
    return false;
  }
  return true;
}

/**
 * Resolves every attendee (and every action-item owner) of a meeting to a
 * canonical person `entities` row, creating nodes and edges as needed:
 *   - person → meeting ("chaired" if the attendee's role looks like a chair
 *     role, else "attended")
 *   - person → company (role mapped to chairman/secretary/director/
 *     shareholder/member/associated) when the meeting has a company_id
 *   - person → action_item ("owner") for each action item's owner_name
 *
 * Matching is scoped the same way the migration 0009 backfill scoped it:
 * candidate entities must share the meeting's `user_id` and `workspace_id`
 * (both compared with null-safe equality, mirroring SQL's
 * `IS NOT DISTINCT FROM`) — RLS separately guarantees the caller can only
 * ever see rows they're allowed to, but scope equality is still needed so
 * that, e.g., two different workspaces a user belongs to don't get their
 * "Ahmad"s merged into one node just because RLS lets the same user read
 * both.
 *
 * Idempotent: re-running for the same meeting reuses existing entities,
 * only appends an alias when the raw name isn't already recorded, and only
 * inserts an `entity_links` row when the entity_id/target_type/target_id
 * triple doesn't already exist. Generic role-holder names ("shareholders",
 * "various", "members") are skipped, matching the migration backfill.
 *
 * Best-effort: every failure is caught and logged, never thrown — entity
 * resolution must never break minutes generation.
 */
export async function resolveEntitiesForMeeting(
  supabase: AnySupabaseClient,
  meetingId: string,
): Promise<EntityResolutionResult> {
  const result: EntityResolutionResult = { personIds: [], created: 0, linked: 0 };

  try {
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, user_id, workspace_id, company_id, attendees")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError || !meeting) return result;

    const meetingRow = meeting as {
      id: string;
      user_id: string | null;
      workspace_id: string | null;
      company_id: string | null;
      attendees: MeetingAttendee[] | null;
    };

    // Inserts must be stamped with the ACTING user (auth.uid()), not the
    // meeting owner — otherwise a workspace co-member generating a shared
    // meeting's minutes fails the entity_links/entities insert RLS and the
    // graph silently doesn't build (audit V3 P2). Entities in a workspace are
    // shared, so match by workspace; personal meetings match by owner.
    const { data: authData } = await supabase.auth.getUser();
    const actingUid = authData?.user?.id ?? meetingRow.user_id;
    const insertScope = { user_id: actingUid, workspace_id: meetingRow.workspace_id };

    // Bounded candidate load: a meeting resolves a handful of attendees, so the
    // most-recent slice is more than enough to match returning people. Caps the
    // fetch on a mega-firm with tens of thousands of entities (SIM_REPORT_V3.md);
    // a per-attendee trigram prefilter is the future refinement for that tail.
    let candidateQuery = supabase
      .from("entities")
      .select("id, canonical_name, normalized_name, aliases")
      .eq("kind", "person")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (meetingRow.workspace_id) {
      // shared workspace scope — every member's entities are candidates
      candidateQuery = candidateQuery.eq("workspace_id", meetingRow.workspace_id);
    } else {
      candidateQuery = candidateQuery.is("workspace_id", null);
      // Legacy rows from the 0009 backfill carry user_id = NULL. Scoping
      // strictly to the acting user made them unmatchable, so every meeting
      // re-created a person who already existed — one director ended up as two
      // records in the same company, silently splitting their directorship
      // history and hiding cross-company conflicts. Match those too.
      candidateQuery = meetingRow.user_id
        ? candidateQuery.or(`user_id.eq.${meetingRow.user_id},user_id.is.null`)
        : candidateQuery.is("user_id", null);
    }

    const { data: candidateRows, error: candidateError } = await candidateQuery;
    if (candidateError) {
      console.error("resolveEntitiesForMeeting: candidate load failed", candidateError);
    }
    const candidates: EntityCandidate[] = (candidateRows ?? []) as EntityCandidate[];

    const personIds: string[] = [];
    let created = 0;
    let linked = 0;

    const attendees = (meetingRow.attendees ?? []).filter(
      (a): a is MeetingAttendee => !!a && typeof a.name === "string" && a.name.trim().length > 0,
    );

    for (const attendee of attendees) {
      const rawName = attendee.name.trim();
      if (isGenericName(rawName)) continue;

      const entity = await ensureEntity(supabase, rawName, insertScope, candidates);
      if (!entity) continue;
      if (entity.created) created += 1;
      if (!personIds.includes(entity.id)) personIds.push(entity.id);

      const meetingRelation = /chair/i.test(attendee.role ?? "") ? "chaired" : "attended";
      const linkedMeeting = await ensureEntityLink(supabase, {
        entity_id: entity.id,
        target_type: "meeting",
        target_id: meetingRow.id,
        relation: meetingRelation,
        meeting_id: meetingRow.id,
        user_id: insertScope.user_id,
      });
      if (linkedMeeting) linked += 1;

      if (meetingRow.company_id) {
        const linkedCompany = await ensureEntityLink(supabase, {
          entity_id: entity.id,
          target_type: "company",
          target_id: meetingRow.company_id,
          relation: roleToCompanyRelation(attendee.role ?? ""),
          meeting_id: meetingRow.id,
          user_id: insertScope.user_id,
        });
        if (linkedCompany) linked += 1;
      }
    }

    // Action-item owners: best-effort, isolated try/catch so a failure here
    // never loses the attendee-resolution work already done above.
    try {
      const { data: actionItems, error: actionItemsError } = await supabase
        .from("action_items")
        .select("id, owner_name")
        .eq("meeting_id", meetingRow.id);

      if (actionItemsError) {
        console.error("resolveEntitiesForMeeting: action item load failed", actionItemsError);
      }

      for (const item of (actionItems ?? []) as { id: string; owner_name: string | null }[]) {
        const ownerName = item.owner_name?.trim();
        if (!ownerName || isGenericName(ownerName)) continue;

        const entity = await ensureEntity(supabase, ownerName, insertScope, candidates);
        if (!entity) continue;
        if (entity.created) created += 1;
        if (!personIds.includes(entity.id)) personIds.push(entity.id);

        const linkedOwner = await ensureEntityLink(supabase, {
          entity_id: entity.id,
          target_type: "action_item",
          target_id: item.id,
          relation: "owner",
          meeting_id: meetingRow.id,
          user_id: insertScope.user_id,
        });
        if (linkedOwner) linked += 1;
      }
    } catch (actionItemError) {
      console.error("resolveEntitiesForMeeting: action item owner resolution failed", actionItemError);
    }

    return { personIds, created, linked };
  } catch (err) {
    console.error("resolveEntitiesForMeeting: unexpected error", err);
    return result;
  }
}
