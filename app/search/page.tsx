import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { StatusBanner } from "@/components/status";
import { search, type SnippetSegment } from "@/lib/search";

function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim();
}

/**
 * Renders a ts_headline snippet. The segments arrive as plain text — the
 * highlight is applied by wrapping React nodes, never by injecting markup,
 * so stored content is escaped by React like any other string.
 *
 * `<mark>` carries semantics that a styled <span> does not; the tint is
 * risk-100 rather than a raw amber so highlighting stays inside the token set.
 */
function Snippet({ segments }: { segments: SnippetSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <p className="mt-1 text-meta text-paper-600">
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-control bg-status-risk-100 px-0.5 text-paper-900">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const q = parseQuery(params.q);

  const { groups, total, truncated, error } = await search(q);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-page font-semibold text-paper-900">Search</h1>
      <p className="mt-1 max-w-prose text-meta text-paper-600">
        Across minutes, resolutions, action items, obligations, companies and people.
      </p>

      <form method="get" action="/search" className="mt-6">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        {/* text-base at mobile is deliberate — 14px triggers iOS Safari's focus zoom. */}
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search everything…"
          className={`block w-full rounded-control border border-paper-450 bg-white px-3 py-2 text-base text-paper-900 placeholder:text-paper-500 focus:border-ink-600 focus:ring-1 focus:ring-ink-500 focus:outline-none sm:max-w-md sm:text-body ${FOCUS_RING}`}
        />
      </form>

      {error ? (
        /*
         * "Nothing has been searched" is load-bearing. A search that failed and
         * a search that found nothing are different facts, and a user who
         * conflates them concludes the clause does not exist.
         */
        <StatusBanner state="unknown" className="mt-6" title="Search is unavailable right now">
          {error} <strong>Nothing has been searched</strong> — this is not a finding that there are
          no matches. Please retry.
        </StatusBanner>
      ) : q.length === 0 ? (
        <EmptyState
          compact
          className="mt-6"
          title="Search everything"
          message="Minutes, resolutions, obligations, action items, companies and people. Try a resolution number, a company, or a phrase from a decision."
        />
      ) : total === 0 ? (
        <EmptyState
          compact
          className="mt-6"
          title={`No matches for “${q}”`}
          message="Search covers record fields — titles, names, resolution text, descriptions and minutes body text. Uploaded document files are matched on filename, type and label only; their contents are not searched."
        />
      ) : (
        <>
          <p className="mt-6 text-meta text-paper-600" aria-live="polite">
            {total} {total === 1 ? "result" : "results"}
            {truncated ? " (showing the best matches — narrow your search for more)" : ""}
          </p>

          <div className="mt-4 space-y-8">
            {groups.map((group) => (
              <section key={group.kind}>
                {/* An eyebrow-cap label above a list — the one place the
                    system permits caps smaller than body text. */}
                <h2 className="text-caption font-semibold tracking-[0.06em] text-paper-600 uppercase">
                  {group.label}
                  <span className="ml-2 font-normal tracking-normal text-paper-600 normal-case">
                    {group.results.length}
                  </span>
                </h2>
                <ul className="mt-2 space-y-2">
                  {group.results.map((result) => (
                    <li key={`${result.kind}:${result.id}`} className="min-w-0">
                      <Link
                        href={result.href}
                        className={`block rounded-surface border border-paper-300 bg-white p-4 hover:border-paper-450 hover:bg-paper-50 sm:p-5 ${FOCUS_RING}`}
                      >
                        {/* Long Malaysian company names WRAP. They are legally
                            exact and must never lose a character to truncation
                            on the surface that identifies the record. */}
                        <h3 className="text-title font-semibold text-balance break-words text-paper-900 [hyphens:auto]">
                          {result.title}
                        </h3>
                        <Snippet segments={result.snippet} />
                        {result.companyName || result.date ? (
                          <p className="mt-2 text-meta text-paper-600">
                            {result.companyName}
                            {result.companyName && result.date ? " · " : ""}
                            {result.date ? formatDate(result.date) : ""}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {/*
        Permanent, and deliberately not dismissible. A cosec who believes the
        constitution was full-text searched and got no hits will conclude the
        clause does not exist — the exact failure this product prevents.
      */}
      <p className="mt-10 border-t border-paper-300 pt-4 text-meta text-paper-600">
        Search covers record fields — titles, names, resolution text, descriptions and minutes body
        text.{" "}
        <strong className="font-semibold">
          Uploaded document files are matched on filename, type and label only; their contents are
          not searched.
        </strong>
      </p>
    </div>
  );
}
