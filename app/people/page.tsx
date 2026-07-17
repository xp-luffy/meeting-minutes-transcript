import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { getPeopleList } from "./data";

function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim();
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const q = parseQuery(params.q);

  const people = await getPeopleList(q);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">People</h1>
        <span className="text-sm text-neutral-500">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        Every person resolved across your meetings, with who they&apos;re entangled with — the
        meetings they&apos;ve attended and the companies they hold a role at.
      </p>

      <form method="get" className="mt-6 max-w-sm">
        <label htmlFor="q" className="sr-only">
          Search people
        </label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={q}
          placeholder="Search by name or alias…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
        />
      </form>

      {people.length === 0 ? (
        <EmptyState
          compact
          className="mt-6 max-w-2xl"
          message={
            q
              ? `No people match "${q}".`
              : "People are resolved automatically from meeting attendees as minutes are generated."
          }
        />
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/people/${person.id}`}
                className={`block h-full rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${FOCUS_RING}`}
              >
                <h2 className="truncate text-base font-medium text-neutral-900">
                  {person.canonical_name}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {person.meetingCount} {person.meetingCount === 1 ? "meeting" : "meetings"}
                  {" · "}
                  {person.companyCount} {person.companyCount === 1 ? "company" : "companies"}
                  {person.aliasCount > 0 ? (
                    <>
                      {" · "}
                      {person.aliasCount} {person.aliasCount === 1 ? "alias" : "aliases"}
                    </>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
