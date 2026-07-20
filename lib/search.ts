import { createClient } from "@/lib/supabase/server";

/**
 * Global search: one query across minutes, resolutions, action items,
 * obligations, companies and people.
 *
 * Everything that matters happens in Postgres (see
 * supabase/migrations/0016_global_search.sql) — the `search_everything`
 * function ranks with ts_rank and cuts snippets with ts_headline over the
 * `search_index` view. Both are SECURITY INVOKER, so RLS on the base tables
 * scopes the rows exactly as it does for every other read in lib/ — there is
 * no ownership logic re-derived here, same principle as lib/companies.ts.
 *
 * The row cap is applied AFTER the `document @@ query` filter, so it trims a
 * set of genuine matches rather than slicing an unfiltered table — the
 * distinction that made the old `limit(200)` on conflict detection a
 * correctness bug rather than a perf choice (docs/PILOT_PLAYBOOK.md #7).
 */

export type SearchKind =
  | "minutes"
  | "resolution"
  | "action_item"
  | "obligation"
  | "company"
  | "person";

/** One run of snippet text; `match` marks the part that matched the query. */
export interface SnippetSegment {
  text: string;
  match: boolean;
}

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** Empty when the snippet would only repeat the title (companies, people). */
  snippet: SnippetSegment[];
  href: string;
  companyName: string | null;
  date: string | null;
  rank: number;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  results: SearchResult[];
}

export interface SearchResults {
  query: string;
  groups: SearchGroup[];
  total: number;
  /** True when the cap was hit and there may be further matches. */
  truncated: boolean;
  /** Set when the query itself failed — never render "no results" for this. */
  error: string | null;
}

/** Group order on the results page: the record types, then the directories. */
const KIND_ORDER: SearchKind[] = [
  "minutes",
  "resolution",
  "action_item",
  "obligation",
  "company",
  "person",
];

const KIND_LABELS: Record<SearchKind, string> = {
  minutes: "Minutes",
  resolution: "Resolutions",
  action_item: "Action Items",
  obligation: "Obligations",
  company: "Companies",
  person: "People",
};

const MAX_RESULTS = 60;

// ts_headline wraps each match in these sentinels. They are plain text, not
// markup, precisely so the snippet is never rendered as HTML — the caller
// turns them into React nodes and the browser never parses stored content.
const HIGHLIGHT_OPEN = "[[[";
const HIGHLIGHT_CLOSE = "]]]";

interface SearchRow {
  kind: string;
  id: string;
  title: string | null;
  snippet: string | null;
  company_id: string | null;
  company_name: string | null;
  meeting_id: string | null;
  occurred_at: string | null;
  rank: number | null;
}

function isSearchKind(value: string): value is SearchKind {
  return (KIND_ORDER as string[]).includes(value);
}

/**
 * Splits a ts_headline string into plain/highlighted runs. Unbalanced or
 * absent sentinels degrade to a single unhighlighted run rather than
 * dropping text — the snippet is the thing the user reads, so losing it is
 * worse than losing the highlight.
 */
export function parseSnippet(raw: string | null | undefined): SnippetSegment[] {
  if (!raw) return [];
  const text = raw.replace(/\s+/g, " ").trim();

  const segments: SnippetSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf(HIGHLIGHT_OPEN, cursor);
    if (open === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (open > cursor) {
      segments.push({ text: text.slice(cursor, open), match: false });
    }

    const close = text.indexOf(HIGHLIGHT_CLOSE, open + HIGHLIGHT_OPEN.length);
    if (close === -1) {
      segments.push({ text: text.slice(open + HIGHLIGHT_OPEN.length), match: false });
      break;
    }

    segments.push({ text: text.slice(open + HIGHLIGHT_OPEN.length, close), match: true });
    cursor = close + HIGHLIGHT_CLOSE.length;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

/** Where a result of each kind lives in the app. */
function hrefFor(kind: SearchKind, id: string, meetingId: string | null): string | null {
  switch (kind) {
    case "minutes":
    case "resolution":
    case "action_item":
    case "obligation":
      // All four are rendered on the meeting's draft page; without a meeting
      // there is nowhere to send the user, so the row is dropped.
      return meetingId ? `/meetings/${meetingId}/draft` : null;
    case "company":
      return `/companies/${id}`;
    case "person":
      return `/people/${id}`;
  }
}

function segmentsToText(segments: SnippetSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

const EMPTY_RESULTS: Omit<SearchResults, "query"> = {
  groups: [],
  total: 0,
  truncated: false,
  error: null,
};

/**
 * Runs a global search and returns results grouped by kind, each group in
 * relevance order. An empty (or whitespace-only) query short-circuits before
 * any round trip; anything else — quotes, `%`, apostrophes, bare operators —
 * is passed through as-is, since `websearch_to_tsquery` parses hostile input
 * into a well-formed query rather than raising.
 */
export async function search(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (query.length === 0) return { query, ...EMPTY_RESULTS };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_everything", {
    q: query,
    max_results: MAX_RESULTS,
  });

  if (error) {
    // Surfaced to the user rather than swallowed into an empty result set:
    // "found nothing" and "the search broke" must not look identical
    // (docs/PILOT_PLAYBOOK.md pattern A).
    console.error("search: search_everything failed", error);
    return { query, ...EMPTY_RESULTS, error: "Search is unavailable right now." };
  }

  const rows = (data ?? []) as SearchRow[];
  const truncated = rows.length >= MAX_RESULTS;

  // Regenerating minutes inserts a new `minutes_drafts` row per version, so
  // one meeting can match several times over. They all link to the same draft
  // page — keep the best-ranked (rows arrive in rank order) and drop the rest.
  const seenMeetingIds = new Set<string>();
  const byKind = new Map<SearchKind, SearchResult[]>();

  for (const row of rows) {
    if (!isSearchKind(row.kind)) continue;

    const href = hrefFor(row.kind, row.id, row.meeting_id);
    if (!href) continue;

    if (row.kind === "minutes") {
      const meetingId = row.meeting_id as string;
      if (seenMeetingIds.has(meetingId)) continue;
      seenMeetingIds.add(meetingId);
    }

    const title = (row.title ?? "").trim() || "Untitled";
    const snippet = parseSnippet(row.snippet);
    // Companies and people (and short action items) headline to the title
    // itself; showing both would just print the same string twice.
    const snippetIsTitle = segmentsToText(snippet).trim() === title.trim();

    const list = byKind.get(row.kind) ?? [];
    list.push({
      kind: row.kind,
      id: row.id,
      title,
      snippet: snippetIsTitle ? [] : snippet,
      href,
      companyName: row.company_name,
      date: row.occurred_at,
      rank: row.rank ?? 0,
    });
    byKind.set(row.kind, list);
  }

  const groups: SearchGroup[] = KIND_ORDER.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0).map(
    (kind) => ({ kind, label: KIND_LABELS[kind], results: byKind.get(kind) as SearchResult[] }),
  );

  return {
    query,
    groups,
    total: groups.reduce((sum, group) => sum + group.results.length, 0),
    truncated,
    error: null,
  };
}
