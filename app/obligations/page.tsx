import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ObligationKind, ObligationRow, ObligationStatus } from "@/lib/obligations";
import { ObligationStatusToggle } from "./status-toggle";

type DueFilter = "overdue" | "week" | "all";
type StatusFilter = ObligationStatus | "all";
type KindFilter = ObligationKind | "all";

const DUE_FILTERS: DueFilter[] = ["overdue", "week", "all"];
const STATUS_FILTERS: StatusFilter[] = ["open", "done", "waived", "all"];
const KIND_FILTERS: KindFilter[] = [
  "ssm_filing",
  "mandate_renewal",
  "dividend_payment",
  "matters_arising",
  "confirm_previous",
  "custom",
  "all",
];

const KIND_LABEL: Record<ObligationKind, string> = {
  ssm_filing: "SSM Filing",
  mandate_renewal: "Mandate Renewal",
  dividend_payment: "Dividend Payment",
  matters_arising: "Matters Arising",
  confirm_previous: "Confirm Minutes",
  custom: "Custom",
};

const KIND_VARIANT: Record<ObligationKind, "indigo" | "amber" | "green" | "neutral"> = {
  ssm_filing: "indigo",
  mandate_renewal: "amber",
  dividend_payment: "green",
  matters_arising: "neutral",
  confirm_previous: "neutral",
  custom: "neutral",
};

interface MeetingSummary {
  id: string;
  company_name: string;
  meeting_type: string;
}

function parseDueFilter(value: string | string[] | undefined): DueFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return DUE_FILTERS.includes(v as DueFilter) ? (v as DueFilter) : "all";
}

function parseStatusFilter(value: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.includes(v as StatusFilter) ? (v as StatusFilter) : "open";
}

function parseKindFilter(value: string | string[] | undefined): KindFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return KIND_FILTERS.includes(v as KindFilter) ? (v as KindFilter) : "all";
}

/** Today's date as a yyyy-mm-dd string (matches date-only columns). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today + 7 days as a yyyy-mm-dd string. */
function weekFromNowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

const PAGE_LIMIT = 200;

async function getObligationsWithMeetings(
  statusFilter: StatusFilter,
  dueFilter: DueFilter,
  kindFilter: KindFilter,
): Promise<{
  items: ObligationRow[];
  meetingsById: Map<string, MeetingSummary>;
  counts: { open: number; overdue: number; done: number };
  atLimit: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const today = todayIso();

  // ALL filters pushed into the query BEFORE the LIMIT (same convention as
  // app/action-items/page.tsx) — otherwise a match past row #200 (by due
  // date) would be invisible after JS filtering, and fetching everything to
  // filter in JS is much slower at portfolio scale.
  let query = supabase
    .from("obligations")
    .select("id, meeting_id, resolution_id, kind, title, detail, due_date, status, source, created_at")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(PAGE_LIMIT);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (kindFilter !== "all") {
    query = query.eq("kind", kindFilter);
  }
  if (dueFilter === "overdue") {
    query = query.not("due_date", "is", null).lt("due_date", today);
  } else if (dueFilter === "week") {
    query = query.not("due_date", "is", null).gte("due_date", today).lte("due_date", weekFromNowIso());
  }

  // Count chips apply the Kind filter too (but not Status/Due) so the "X
  // open / X overdue / X done" summary always matches the register the Kind
  // dropdown is narrowed to, instead of silently showing portfolio-wide
  // totals that disagree with the filtered table below.
  let openCountQuery = supabase
    .from("obligations")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  let doneCountQuery = supabase
    .from("obligations")
    .select("id", { count: "exact", head: true })
    .eq("status", "done");
  let overdueCountQuery = supabase
    .from("obligations")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .not("due_date", "is", null)
    .lt("due_date", today);

  if (kindFilter !== "all") {
    openCountQuery = openCountQuery.eq("kind", kindFilter);
    doneCountQuery = doneCountQuery.eq("kind", kindFilter);
    overdueCountQuery = overdueCountQuery.eq("kind", kindFilter);
  }

  const [{ data: items, error: itemsError }, openRes, doneRes, overdueRes] = await Promise.all([
    query,
    openCountQuery,
    doneCountQuery,
    overdueCountQuery,
  ]);

  const counts = {
    open: openRes.count ?? 0,
    done: doneRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  };

  if (itemsError) {
    return { items: [], meetingsById: new Map(), counts, atLimit: false, error: itemsError.message };
  }

  const itemList = (items ?? []) as ObligationRow[];
  const meetingIds = Array.from(new Set(itemList.map((item) => item.meeting_id)));
  const meetingsById = new Map<string, MeetingSummary>();

  if (meetingIds.length > 0) {
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, company_name, meeting_type")
      .in("id", meetingIds);

    if (!meetingsError && meetings) {
      for (const meeting of meetings as MeetingSummary[]) {
        meetingsById.set(meeting.id, meeting);
      }
    }
  }

  return {
    items: itemList,
    meetingsById,
    counts,
    atLimit: itemList.length === PAGE_LIMIT,
    error: null,
  };
}

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const dueFilter = parseDueFilter(params.due);
  const statusFilter = parseStatusFilter(params.status);
  const kindFilter = parseKindFilter(params.kind);

  const { items, meetingsById, counts, atLimit, error } = await getObligationsWithMeetings(
    statusFilter,
    dueFilter,
    kindFilter,
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Couldn&apos;t load obligations right now. Please refresh the page or try again shortly.
      </div>
    );
  }

  const { open: openCount, done: doneCount, overdue: overdueCount } = counts;
  const rows = items;
  const today = todayIso();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Obligations Register</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Statutory duties created by board decisions — filings, renewals, payments, and
            follow-ups tied back to the meeting that created them.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="indigo">{openCount} open</Badge>
            <Badge variant="red">{overdueCount} overdue</Badge>
            <Badge variant="green">{doneCount} done</Badge>
          </div>
          {kindFilter !== "all" ? (
            <p className="text-[11px] text-neutral-400">Counts reflect the {KIND_LABEL[kindFilter]} filter</p>
          ) : null}
        </div>
      </div>

      {atLimit ? (
        <p className="text-xs text-neutral-500">
          Showing the first {PAGE_LIMIT} obligations by due date — narrow with the filters below.
        </p>
      ) : null}

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="status" className="text-xs font-medium text-neutral-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-base text-neutral-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-auto sm:text-sm"
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="waived">Waived</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="due" className="text-xs font-medium text-neutral-600">
            Due
          </label>
          <select
            id="due"
            name="due"
            defaultValue={dueFilter}
            className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-base text-neutral-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-auto sm:text-sm"
          >
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="week">Next 7 days</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="kind" className="text-xs font-medium text-neutral-600">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={kindFilter}
            className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-base text-neutral-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-auto sm:text-sm"
          >
            <option value="all">All</option>
            {KIND_FILTERS.filter((k): k is ObligationKind => k !== "all").map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className={`flex-1 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Apply
          </button>
          <Link
            href="/obligations"
            className={`flex-1 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Clear
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No obligations match"
          message="Try widening your filters, or clear them to see everything. Obligations are created automatically when minutes are generated."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] divide-y divide-neutral-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Meeting</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((item) => {
                const meeting = meetingsById.get(item.meeting_id);
                const isOverdue = item.status === "open" && item.due_date !== null && item.due_date < today;

                return (
                  <tr key={item.id} className="align-top">
                    <td className="max-w-md px-4 py-3">
                      <div className="text-neutral-800">{item.title}</div>
                      {item.detail ? (
                        <div className="mt-0.5 text-xs text-neutral-500">{item.detail}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={KIND_VARIANT[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={isOverdue ? "font-medium text-red-600" : "text-neutral-700"}>
                        {formatDate(item.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {meeting ? (
                        <Link
                          href={`/meetings/${meeting.id}/draft`}
                          className={`rounded-sm text-indigo-600 hover:text-indigo-700 ${FOCUS_RING}`}
                        >
                          {meeting.company_name}
                          <span className="text-neutral-400"> · {meeting.meeting_type}</span>
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ObligationStatusToggle
                        obligationId={item.id}
                        meetingId={item.meeting_id}
                        initialStatus={item.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
