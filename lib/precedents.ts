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
 */

export interface PrecedentMatch {
  resolution_id: string;
  meeting_id: string;
  company_name: string;
  meeting_date: string;
  resolution_number: string | null;
  resolution_text: string;
  similarity: number;
}

const SIMILARITY_THRESHOLD = 0.45;
const MAX_RESOLUTIONS_TO_MATCH = 5;
const MAX_CANDIDATES = 200;
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

/**
 * For up to 5 draft resolution texts, find up to 3 similar resolutions each
 * (similarity >= 0.45) from OTHER meetings, deduped by resolution id across
 * the whole result set.
 */
export async function findSimilarResolutions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  meetingId: string,
  resolutionTexts: string[],
): Promise<PrecedentMatch[]> {
  const draftTexts = resolutionTexts
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .slice(0, MAX_RESOLUTIONS_TO_MATCH);

  if (draftTexts.length === 0) return [];

  const { data, error } = await supabase
    .from("resolutions")
    .select(
      "id, meeting_id, resolution_number, resolution_text, created_at, meetings(company_name, meeting_date)",
    )
    .neq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATES);

  if (error || !data) {
    console.error("findSimilarResolutions: candidate query failed", error);
    return [];
  }

  const candidates = data as unknown as CandidateResolutionRow[];

  const seenResolutionIds = new Set<string>();
  const matches: PrecedentMatch[] = [];

  for (const draftText of draftTexts) {
    const scored = candidates
      .map((candidate) => {
        const meetingInfo = Array.isArray(candidate.meetings) ? candidate.meetings[0] : candidate.meetings;
        if (!meetingInfo) return null;
        return {
          candidate,
          meetingInfo,
          similarity: trigramSimilarity(draftText, candidate.resolution_text),
        };
      })
      .filter(
        (entry): entry is { candidate: CandidateResolutionRow; meetingInfo: CandidateMeetingInfo; similarity: number } =>
          entry !== null && entry.similarity >= SIMILARITY_THRESHOLD,
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_MATCHES_PER_RESOLUTION);

    for (const { candidate, meetingInfo, similarity } of scored) {
      if (seenResolutionIds.has(candidate.id)) continue;
      seenResolutionIds.add(candidate.id);
      matches.push({
        resolution_id: candidate.id,
        meeting_id: candidate.meeting_id,
        company_name: meetingInfo.company_name,
        meeting_date: meetingInfo.meeting_date,
        resolution_number: candidate.resolution_number,
        resolution_text: candidate.resolution_text,
        similarity: Math.round(similarity * 1000) / 1000,
      });
    }
  }

  return matches;
}
