import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, FOCUS_RING } from "@/components/ui";
import { getEntity, getPersonDetail, findCompanyIdForOrgEntity, relationLabel } from "../data";
import { EgoGraph } from "../ego-graph";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const entity = await getEntity(id);
  if (!entity) {
    notFound();
  }

  // Org entities are graph nodes mirroring `companies` rows — they don't get
  // their own detail page here (that's app/companies/[id]/page.tsx). Route
  // there when we can match one; otherwise render a minimal, non-crashing
  // fallback instead of a 404 (the id is a real entity, just not one this
  // route renders in full).
  if (entity.kind === "org") {
    const companyId = await findCompanyIdForOrgEntity(entity);
    if (companyId) {
      redirect(`/companies/${companyId}`);
    }

    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm">
          <Link href="/people" className={`rounded-sm text-neutral-500 hover:text-neutral-700 ${FOCUS_RING}`}>
            &larr; People
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-neutral-900">{entity.canonical_name}</h1>
          <Badge variant="indigo">Organisation</Badge>
        </div>
        <div className="mt-6">
          <EmptyState compact message="This organisation isn't linked to a company record yet, so there's no detail page for it here." />
        </div>
      </div>
    );
  }

  const detail = await getPersonDetail(entity);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/people" className={`rounded-sm text-neutral-500 hover:text-neutral-700 ${FOCUS_RING}`}>
          &larr; People
        </Link>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">{entity.canonical_name}</h1>
        <Badge variant="indigo">Person</Badge>
      </div>
      {entity.aliases.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entity.aliases.map((alias) => (
            <Badge key={alias} variant="neutral">
              {alias}
            </Badge>
          ))}
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Appears across</h2>
        {detail.meetings.length === 0 ? (
          <EmptyState compact message="No meetings recorded for this person yet." />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {detail.meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/meetings/${m.id}/draft`}
                    className={`truncate text-sm font-medium text-neutral-900 hover:text-indigo-600 ${FOCUS_RING}`}
                  >
                    {m.company_name}
                    <span className="font-normal text-neutral-400"> · {m.meeting_type}</span>
                  </Link>
                  <p className="mt-0.5 text-xs text-neutral-500">{formatDate(m.meeting_date)}</p>
                </div>
                <Badge variant={m.relation === "chaired" ? "indigo" : "neutral"} className="capitalize">
                  {relationLabel(m.relation)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Company roles</h2>
        {detail.companyRoles.length === 0 ? (
          <EmptyState compact message="No company roles recorded yet." />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {detail.companyRoles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link
                  href={`/companies/${c.id}`}
                  className={`min-w-0 truncate text-sm font-medium text-neutral-900 hover:text-indigo-600 ${FOCUS_RING}`}
                >
                  {c.name}
                </Link>
                <Badge variant="green">{relationLabel(c.relation)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Owns action items</h2>
        {detail.openActions.length === 0 ? (
          <EmptyState compact message="No open action items owned by this person." />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
            {detail.openActions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <p className="min-w-0 truncate text-sm text-neutral-800">{a.description}</p>
                <div className="flex shrink-0 items-center gap-3">
                  {a.due_date ? (
                    <span className="text-xs text-neutral-500">due {formatDate(a.due_date)}</span>
                  ) : null}
                  <Link
                    href={`/meetings/${a.meeting_id}/draft`}
                    className={`rounded-sm text-xs text-indigo-600 hover:underline ${FOCUS_RING}`}
                  >
                    View in draft →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Ego graph</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Who {entity.canonical_name} is entangled with — meetings attended and company roles held.
        </p>
        {detail.egoNodes.length === 0 ? (
          <EmptyState compact message="Not enough connections yet to draw a graph." />
        ) : (
          <EgoGraph
            center={{ id: entity.id, label: entity.canonical_name, kind: "person" }}
            nodes={detail.egoNodes}
            edges={detail.egoEdges}
          />
        )}
        {detail.overflowCount > 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            and {detail.overflowCount} more connection{detail.overflowCount === 1 ? "" : "s"} not shown
          </p>
        ) : null}
      </section>
    </div>
  );
}
