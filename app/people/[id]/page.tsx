import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, FOCUS_RING } from "@/components/ui";
import {
  getEntity,
  getPersonDetail,
  getPersonOwes,
  getUnlinkedOwnerMatches,
  findCompanyIdForOrgEntity,
  relationLabel,
} from "../data";
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

  const [detail, owes, unlinked] = await Promise.all([
    getPersonDetail(entity),
    getPersonOwes(entity.id),
    getUnlinkedOwnerMatches(entity.id),
  ]);

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

      {/* OWES — promoted above everything else. What someone owes is the
          reason you opened their page, and it is the one view that spans
          every company in the portfolio. */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Owes</h2>
          {owes.failed ? null : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="indigo">{owes.openTotal} open</Badge>
              {owes.overdueTotal > 0 ? <Badge variant="red">{owes.overdueTotal} overdue</Badge> : null}
            </div>
          )}
        </div>

        {owes.failed ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Couldn&apos;t load what this person owes. This is not the same as owing nothing — refresh
            to try again.
          </div>
        ) : owes.groups.length === 0 ? (
          <EmptyState compact message="No open action items are linked to this person." />
        ) : (
          <div className="space-y-4">
            {owes.truncated ? (
              <p className="text-xs text-neutral-500">
                Showing the first 400 linked items — this list is incomplete.
              </p>
            ) : null}
            {owes.groups.map((group) => (
              <details
                key={group.companyName}
                open={group.overdueCount > 0}
                className="rounded-lg border border-neutral-200 bg-white shadow-sm"
              >
                <summary
                  className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 ${FOCUS_RING}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                    {group.companyName}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {group.openCount} open
                    {group.overdueCount > 0 ? (
                      <span className="font-medium text-red-600"> · {group.overdueCount} overdue</span>
                    ) : null}
                  </span>
                </summary>
                <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                  {group.items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <p className="min-w-0 flex-1 text-sm text-neutral-800">
                        {/* Overdue is never colour-only: glyph + the word + red. */}
                        {a.isOverdue ? <span aria-hidden className="font-bold text-red-600">! </span> : null}
                        {a.description}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={`text-xs ${a.isOverdue ? "font-medium text-red-600" : "text-neutral-500"}`}>
                          {a.isOverdue ? "overdue · " : ""}
                          {a.due_date ? `due ${formatDate(a.due_date)}` : "no due date"}
                        </span>
                        <Link
                          href={`/meetings/${a.meeting_id}/draft`}
                          className={`rounded-sm text-xs text-indigo-600 hover:underline ${FOCUS_RING}`}
                        >
                          open →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}

            {owes.completed.length > 0 ? (
              <details className="rounded-lg border border-neutral-200 bg-white shadow-sm">
                <summary className={`cursor-pointer px-4 py-3 text-xs text-neutral-600 ${FOCUS_RING}`}>
                  Show {owes.completed.length} completed item
                  {owes.completed.length === 1 ? "" : "s"}
                </summary>
                <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                  {owes.completed.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <p className="min-w-0 flex-1 text-sm text-neutral-500 line-through">{a.description}</p>
                      <Link
                        href={`/meetings/${a.meeting_id}/draft`}
                        className={`rounded-sm text-xs text-indigo-600 hover:underline ${FOCUS_RING}`}
                      >
                        open →
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        )}

        {/* The honest-state guard. Without it the list above reads as a
            COMPLETE account of what this person owes, while items naming them
            in free text float outside it entirely. */}
        {unlinked.failed ? (
          <p className="mt-3 rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700">
            Could not check for unlinked items naming this person. The list above may be incomplete.
          </p>
        ) : unlinked.total > 0 ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p>
              <span aria-hidden>⚠ </span>
              {unlinked.total} further action item{unlinked.total === 1 ? "" : "s"} record an owner
              name that resembles this person but{" "}
              {unlinked.total === 1 ? "is" : "are"} not linked to them, so{" "}
              {unlinked.total === 1 ? "it is" : "they are"} not counted above.
            </p>
            <ul className="mt-2 space-y-1">
              {unlinked.sample.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.meeting_id}/draft`}
                    className={`rounded-sm hover:underline ${FOCUS_RING}`}
                  >
                    &ldquo;{m.owner_name}&rdquo; — {m.description}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              <Link
                href="/action-items?owner_state=text_only&status=all"
                className={`rounded-sm font-medium underline ${FOCUS_RING}`}
              >
                Review unlinked owners →
              </Link>
            </p>
          </div>
        ) : null}
      </section>

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
