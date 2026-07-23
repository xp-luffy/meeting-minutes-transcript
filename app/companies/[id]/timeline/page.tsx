import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getClientTimeline, type TimelineEvent } from "@/lib/companies";
import { StatusChip, StatusBanner } from "@/components/status";
import { EmptyState, FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Event-type marks are paper-toned: these are KINDS, not statuses, so they must
// not borrow the semantic status colours. The only semantic colour on this page
// is the confirmation state on the right of a decision.
const KIND_MARK: Record<TimelineEvent["kind"], string> = {
  meeting: "●",
  decision: "◆",
  commitment: "→",
  confirmation: "✓",
};

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  meeting: "Meeting",
  decision: "Decision",
  commitment: "Commitment",
  confirmation: "Confirmed",
};

function yearOf(at: string): string {
  // Avoid new Date() parsing surprises: the view emits ISO timestamps.
  return at.slice(0, 4);
}

export default async function CompanyTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const timeline = await getClientTimeline(id);

  // Group newest-first, preserving order within each year.
  const byYear: { year: string; events: TimelineEvent[] }[] = [];
  for (const e of timeline.events) {
    const y = yearOf(e.at);
    const last = byYear[byYear.length - 1];
    if (last && last.year === y) last.events.push(e);
    else byYear.push({ year: y, events: [e] });
  }

  const { counts } = timeline;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-body">
        <Link
          href={`/companies/${id}`}
          className={`rounded-control text-paper-500 hover:text-paper-700 ${FOCUS_RING}`}
        >
          &larr; {company.name}
        </Link>
      </p>
      <h1 className="mt-2 text-title font-semibold text-paper-900">History</h1>
      <p className="mt-1 text-body text-paper-600">
        Every decision, commitment and confirmation for {company.name}, in order.
      </p>

      {timeline.loadError ? (
        <StatusBanner state="unknown" className="mt-6" title="History could not be loaded">
          This is not the same as there being no history. Reload before relying on this page.
        </StatusBanner>
      ) : timeline.events.length === 0 ? (
        <EmptyState
          variant="nothing-yet"
          className="mt-6"
          message={`Nothing recorded for ${company.name} yet. The history builds itself from meetings.`}
        />
      ) : (
        <>
          {/* Counted facts — all four are consequential, none are vanity. */}
          <div className="rule-document mt-6 grid grid-cols-2 gap-x-6 gap-y-2 py-3 sm:grid-cols-4">
            <Fact n={counts.decisions} label="decisions" />
            <Fact n={counts.confirmations} label="confirmed by the client" />
            <Fact n={counts.commitments} label="commitments" />
            <Fact n={counts.unconfirmed} label="still unconfirmed" emphasise={counts.unconfirmed > 0} />
          </div>

          <div className="mt-8 space-y-8">
            {byYear.map(({ year, events }) => (
              <section key={year} className="rule-section pt-4">
                <h2 className="text-subhead font-medium text-paper-900">{year}</h2>
                <ol className="mt-3 border-l border-paper-300">
                  {events.map((e) => (
                    <li key={`${e.kind}-${e.record_id}`} className="relative py-2 pl-5">
                      <span
                        aria-hidden
                        className="absolute -left-[7px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-paper-100 text-caption text-paper-600"
                      >
                        {KIND_MARK[e.kind]}
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <span className="text-caption tabular-nums text-paper-600">
                            {formatDate(e.at)}
                          </span>
                          <span className="ml-2 text-caption text-paper-500">{KIND_LABEL[e.kind]}</span>
                          <p className="text-body text-paper-900">{e.title}</p>
                          {e.detail ? (
                            <p className="mt-0.5 text-caption text-paper-600">{e.detail}</p>
                          ) : null}
                        </div>
                        {e.kind === "confirmation" ? (
                          <StatusChip state="verified">Client confirmed</StatusChip>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {timeline.events.length >= 200 ? (
            <p className="mt-6 text-caption text-paper-600">
              Showing the most recent 200 events.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Fact({ n, label, emphasise = false }: { n: number; label: string; emphasise?: boolean }) {
  return (
    <div>
      <p className={`text-title font-semibold ${emphasise ? "text-status-risk-700" : "text-paper-900"}`}>
        {n}
      </p>
      <p className="text-caption text-paper-600">{label}</p>
    </div>
  );
}
