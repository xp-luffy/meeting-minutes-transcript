import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Precedent matching: find resolutions from OTHER meetings that read
 * similarly to a set of draft resolution texts, so a company secretary can
 * see how a comparable matter was resolved before.
 *
 * There is no RPC/function exposing pg_trgm similarity through PostgREST
 * (trigram operators aren't exposed as PostgREST filter operators), so this
 * fetches a bounded, recent candidate set — RLS on `resolutions`/`meetings`
 * scopes visibility automatically, same as any other query through the
 * request-scoped Supabase client — and scores similarity in TypeScript with
 * a small, deterministic, dependency-free character-trigram comparison.
 *
 * Company memory tiering: when a `companyId` is supplied, candidates are
 * fetched in two tiers — this company's own resolutions first (a lower
 * similarity bar, since precedent from the SAME company is valuable even
 * when the wording drifts, plus a similarity boost so they rank above
 * generic matches), then everyone else's (the original, stricter bar).
 * Without a `companyId` (or when it's null), behaviour is unchanged from
 * before: a single, unscoped candidate pool at the stricter threshold.
 */

export interface PrecedentMatch {
  resolution_id: string;
  meeting_id: string;
  company_name: string;
  meeting_date: string;
  resolution_number: string | null;
  resolution_text: string;
  similarity: number;
  /** True when this precedent comes from the same company as the draft. */
  sameCompany: boolean;
}

const SIMILARITY_THRESHOLD = 0.45;
const SAME_COMPANY_SIMILARITY_THRESHOLD = 0.35;
const SAME_COMPANY_SIMILARITY_BOOST = 1.15;
const MAX_RESOLUTIONS_TO_MATCH = 5;
const MAX_CANDIDATES = 200; // single-tier fallback (no companyId)
const MAX_CANDIDATES_PER_TIER = 100;
const MAX_MATCHES_PER_RESOLUTION = 3;

// ---------------------------------------------------------------------------
// Character-trigram similarity (Jaccard over trigram sets — the same shape
// of comparison pg_trgm's similarity() performs: common trigrams over the
// union of trigrams). No dependency, fully deterministic.
// ---------------------------------------------------------------------------

function normalizeForTrigram(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function trigramSet(text: string): Set<string> {
  // pg_trgm pads each string with leading/trailing blanks before extracting
  // trigrams so that short words/prefixes/suffixes still produce grams; we
  // mirror that loosely (2 leading, 1 trailing space) rather than exactly.
  const padded = `  ${normalizeForTrigram(text)} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity (0-1) between the character-trigram sets of two strings. */
export function trigramSimilarity(a: string, b: string): number {
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Precedent lookup
// ---------------------------------------------------------------------------

interface CandidateMeetingInfo {
  company_name: string;
  meeting_date: string;
}

interface CandidateResolutionRow {
  id: string;
  meeting_id: string;
  resolution_number: string | null;
  resolution_text: string;
  created_at: string;
  meetings: CandidateMeetingInfo | CandidateMeetingInfo[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

/**
 * Fetches a bounded, recent candidate set of resolutions from meetings
 * other than `meetingId`. When `companyFilter` is set, scopes to that
 * company (`mode: "same"`) or excludes it (`mode: "other"`) via an inner
 * join on `meetings.company_id` — two separate bounded queries rather than
 * one large one, so a company with a long history doesn't crowd out (or get
 * crowded out by) the rest of the portfolio.
 */
async function fetchCandidates(
  supabase: AnySupabaseClient,
  meetingId: string,
  limit: number,
  companyFilter?: { companyId: string; mode: "same" | "other" },
): Promise<CandidateResolutionRow[]> {
  let query = supabase
    .from("resolutions")
    .select(
      companyFilter
        ? "id, meeting_id, resolution_number, resolution_text, created_at, meetings!inner(company_name, meeting_date)"
        : "id, meeting_id, resolution_number, resolution_text, created_at, meetings(company_name, meeting_date)",
    )
    .neq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (companyFilter) {
    query =
      companyFilter.mode === "same"
        ? query.eq("meetings.company_id", companyFilter.companyId)
        : query.neq("meetings.company_id", companyFilter.companyId);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("findSimilarResolutions: candidate query failed", error);
    return [];
  }
  return data as unknown as CandidateResolutionRow[];
}

/**
 * For up to 5 draft resolution texts, find up to 3 similar resolutions each
 * from OTHER meetings, deduped by resolution id across the whole result
 * set. Pass the draft meeting's `companyId` to weight same-company
 * precedent higher (lower similarity bar + a ranking boost) — this is what
 * makes precedent matching part of company memory rather than a portfolio-
 * wide search.
 */
export async function findSimilarResolutions(
  supabase: AnySupabaseClient,
  meetingId: string,
  resolutionTexts: string[],
  companyId?: string | null,
): Promise<PrecedentMatch[]> {
  const draftTexts = resolutionTexts
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .slice(0, MAX_RESOLUTIONS_TO_MATCH);

  if (draftTexts.length === 0) return [];

  let candidates: { row: CandidateResolutionRow; sameCompany: boolean }[];

  if (companyId) {
    const [sameCompanyRows, otherRows] = await Promise.all([
      fetchCandidates(supabase, meetingId, MAX_CANDIDATES_PER_TIER, { companyId, mode: "same" }),
      fetchCandidates(supabase, meetingId, MAX_CANDIDATES_PER_TIER, { companyId, mode: "other" }),
    ]);
    candidates = [
      ...sameCompanyRows.map((row) => ({ row, sameCompany: true })),
      ...otherRows.map((row) => ({ row, sameCompany: false })),
    ];
  } else {
    const rows = await fetchCandidates(supabase, meetingId, MAX_CANDIDATES);
    candidates = rows.map((row) => ({ row, sameCompany: false }));
  }

  const seenResolutionIds = new Set<string>();
  const matches: PrecedentMatch[] = [];

  for (const draftText of draftTexts) {
    const scored = candidates
      .map(({ row, sameCompany }) => {
        const meetingInfo = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
        if (!meetingInfo) return null;

        const rawSimilarity = trigramSimilarity(draftText, row.resolution_text);
        const threshold = sameCompany ? SAME_COMPANY_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD;
        if (rawSimilarity < threshold) return null;

        const similarity = sameCompany
          ? Math.min(1, rawSimilarity * SAME_COMPANY_SIMILARITY_BOOST)
          : rawSimilarity;

        return { row, meetingInfo, sameCompany, similarity };
      })
      .filter(
        (
          entry,
        ): entry is {
          row: CandidateResolutionRow;
          meetingInfo: CandidateMeetingInfo;
          sameCompany: boolean;
          similarity: number;
        } => entry !== null,
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_MATCHES_PER_RESOLUTION);

    for (const { row, meetingInfo, sameCompany, similarity } of scored) {
      if (seenResolutionIds.has(row.id)) continue;
      seenResolutionIds.add(row.id);
      matches.push({
        resolution_id: row.id,
        meeting_id: row.meeting_id,
        company_name: meetingInfo.company_name,
        meeting_date: meetingInfo.meeting_date,
        resolution_number: row.resolution_number,
        resolution_text: row.resolution_text,
        similarity: Math.round(similarity * 1000) / 1000,
        sameCompany,
      });
    }
  }

  // Same-company precedent surfaces first, then by similarity.
  matches.sort((a, b) => {
    if (a.sameCompany !== b.sameCompany) return a.sameCompany ? -1 : 1;
    return b.similarity - a.similarity;
  });

  return matches;
}
