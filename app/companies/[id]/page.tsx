import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getCompanyHistory } from "@/lib/companies";
import { StatusBadge, OutcomePill, Badge, EmptyState, FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getCompanyPeople, relationLabel } from "@/app/people/data";
import { EgoGraph } from "@/app/people/ego-graph";
import { CompanyDocumentsSection } from "./documents-section";

function excerpt(text: string, maxLength = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function DefaultsChips({ company }: { company: NonNullable<Awaited<ReturnType<typeof getCompany>>> }) {
  const defaults = company.defaults;
  const chips: string[] = [];

  if (defaults?.minutes_format === "maisca") chips.push("Maisca committee style");
  if (defaults?.meeting_type) chips.push(`Usually ${defaults.meeting_type}`);
  if (defaults?.venue) chips.push(`Usually at ${defaults.venue}`);
  if (defaults?.chairperson) chips.push(`Usual chair: ${defaults.chairperson}`);

  if (chips.length === 0) {
    return (
      <p className="mt-2 text-xs text-neutral-400">
        No usual defaults yet — they fill in automatically after your first meeting for this
        company.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge key={chip} variant="indigo">
          {chip}
        </Badge>
      ))}
    </div>
  );
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await getCompany(id);
  if (!company) {
    notFound();
  }

  const { meetings, resolutions, openActions } = await getCompanyHistory(id);
  const people = await getCompanyPeople(id);
  const egoNodes = people.map((p) => ({ id: p.id, label: p.name, kind: "person" as const, relation: p.relation }));
  const egoEdges = people.map((p) => ({ from: id, to: p.id, relation: p.relation }));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/companies" className={`rounded-sm text-neutral-500 hover:text-neutral-700 ${FOCUS_RING}`}>
          &larr; Companies
        </Link>
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-neutral-900">{company.name}</h1>
          {company.reg_no ? (
            <p className="mt-0.5 text-sm text-neutral-500">{company.reg_no}</p>
          ) : null}
          <DefaultsChips company={company} />
        </div>
        <Link
          href={`/meetings/new?company=${company.id}`}
          className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:min-h-0 sm:w-auto sm:py-1.5 ${FOCUS_RING}`}
        >
          New meeting for this company
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Meetings</h2>
        {meetings.length === 0 ? (
          <EmptyState compact message="No meetings recorded for this company yet." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className={`block h-full rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${FOCUS_RING}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-neutral-900">
                      {meeting.meeting_type}
                    </h3>
                    <StatusBadge status={meeting.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDate(meeting.meeting_date)}
                    {meeting.venue ? <> &middot; {meeting.venue}</> : null}
                    {meeting.latestDraft ? (
                      <> &middot; minutes v{meeting.latestDraft.version}</>
                    ) : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">People &amp; directors</h2>
        {people.length === 0 ? (
          <EmptyState compact message="No people linked to this company yet." />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {people.map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/people/${person.id}`}
                    className={`flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${FOCUS_RING}`}
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{person.name}</span>
                    <Badge variant="indigo">{relationLabel(person.relation)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <EgoGraph
                center={{ id: company.id, label: company.name, kind: "org" }}
                nodes={egoNodes}
                edges={egoEdges}
              />
            </div>
          </>
        )}
      </section>

      <CompanyDocumentsSection companyId={id} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Resolutions register</h2>
        <p className="mb-3 text-xs text-neutral-500">
          The firm&apos;s institutional memory for this company — every resolution passed, and how
          it was resolved.
        </p>
        {resolutions.length === 0 ? (
          <EmptyState compact message="No resolutions recorded yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Resolution</th>
                  <th className="px-4 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {resolutions.map((resolution) => (
                  <tr key={resolution.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-neutral-700">
                      {resolution.resolution_number ?? "—"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                      {formatDate(resolution.meeting_date)}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {excerpt(resolution.resolution_text)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <OutcomePill outcome={resolution.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Open action items</h2>
        {openActions.length === 0 ? (
          <EmptyState compact message="No open action items for this company." />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {openActions.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-800">{item.description}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.owner_name ?? "Unassigned"}
                    {item.due_date ? <> &middot; due {formatDate(item.due_date)}</> : null}
                    {" · "}
                    {formatDate(item.meeting_date)}
                  </p>
                </div>
                <Link
                  href={`/meetings/${item.meeting_id}/draft`}
                  className={`shrink-0 rounded-sm text-xs text-indigo-600 hover:underline ${FOCUS_RING}`}
                >
                  View in draft →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
