import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { search, type SnippetSegment } from "@/lib/search";

function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim();
}

/**
 * Renders a ts_headline snippet. The segments arrive as plain text — the
 * highlight is applied by wrapping React nodes, never by injecting markup,
 * so stored content is escaped by React like any other string.
 */
function Snippet({ segments }: { segments: SnippetSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <p className="mt-1 text-sm text-neutral-600">
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-amber-100 px-0.5 text-neutral-900">
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
      <h1 className="text-lg font-semibold text-neutral-900">Search</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        Across minutes, resolutions, action items, obligations, companies and people.
      </p>

      <form method="get" action="/search" className="mt-6 max-w-md">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search everything…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
        />
      </form>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error} Please refresh the page or try again shortly.
        </div>
      ) : q.length === 0 ? (
        <EmptyState
          compact
          className="mt-6"
          message="Type a word or phrase to search everything you have access to."
        />
      ) : total === 0 ? (
        <EmptyState compact className="mt-6" message={`No results for “${q}”.`} />
      ) : (
        <>
          <p className="mt-6 text-sm text-neutral-500">
            {total} {total === 1 ? "result" : "results"}
            {truncated ? " (showing the best matches — narrow your search for more)" : ""}
          </p>

          <div className="mt-4 space-y-8">
            {groups.map((group) => (
              <section key={group.kind}>
                <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
                    {group.results.length}
                  </span>
                </h2>
                <ul className="mt-2 space-y-2">
                  {group.results.map((result) => (
                    <li key={`${result.kind}:${result.id}`} className="min-w-0">
                      <Link
                        href={result.href}
                        className={`block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${FOCUS_RING}`}
                      >
                        <h3 className="truncate text-base font-medium text-neutral-900">
                          {result.title}
                        </h3>
                        <Snippet segments={result.snippet} />
                        {result.companyName || result.date ? (
                          <p className="mt-2 text-xs text-neutral-500">
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
    </div>
  );
}
