import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem, Meeting } from "@/lib/types";
import { Badge, ConfidenceTag, EmptyState, FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { StatusToggle } from "./status-toggle";

type DueFilter = "overdue" | "week" | "all";
type StatusFilter = "open" | "done" | "all";

const DUE_FILTERS: DueFilter[] = ["overdue", "week", "all"];
const STATUS_FILTERS: StatusFilter[] = ["open", "done", "all"];

function parseDueFilter(value: string | string[] | undefined): DueFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return DUE_FILTERS.includes(v as DueFilter) ? (v as DueFilter) : "all";
}

function parseStatusFilter(value: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return STATUS_FILTERS.includes(v as StatusFilter) ? (v as StatusFilter) : "open";
}

function parseOwnerFilter(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim();
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

async function getActionItemsWithMeetings(
  statusFilter: StatusFilter,
  dueFilter: DueFilter,
  ownerFilter: string,
): Promise<{
  items: ActionItem[];
  meetingsById: Map<string, Meeting>;
  counts: { open: number; done: number; overdue: number };
  atLimit: boolean;
  error: string | null;
}> {
  const supabase = await createClient();

  // ALL filters pushed into the query BEFORE the LIMIT — otherwise a match past
  // row #200 (by due date) would be invisible after JS filtering (audit P2).
  // At portfolio scale fetching everything is also ~50x slower (SIM_REPORT.md).
  const today = todayIso();
  let query = supabase
    .from("action_items")
    .select(
      "id, meeting_id, description, description_confidence, description_review_status, owner_name, due_date, item_status, created_at",
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(PAGE_LIMIT);
  if (statusFilter !== "all") {
    query = query.eq("item_status", statusFilter);
  }
  if (dueFilter === "overdue") {
    query = query.not("due_date", "is", null).lt("due_date", today);
  } else if (dueFilter === "week") {
    query = query.not("due_date", "is", null).gte("due_date", today).lte("due_date", weekFromNowIso());
  }
  if (ownerFilter) {
    // ilike with escaped wildcards — substring, case-insensitive
    const needle = ownerFilter.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike("owner_name", `%${needle}%`);
  }

  // Count chips are owner-scoped (match the visible owner filter) but span all
  // statuses/due windows. Build each with its own owner-filtered count query.
  const ownerNeedle = ownerFilter ? `%${ownerFilter.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;
  const openCountQuery = supabase.from("action_items").select("id", { count: "exact", head: true }).eq("item_status", "open");
  const doneCountQuery = supabase.from("action_items").select("id", { count: "exact", head: true }).eq("item_status", "done");
  const overdueCountQuery = supabase
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("item_status", "open")
    .lt("due_date", today);
  if (ownerNeedle) {
    openCountQuery.ilike("owner_name", ownerNeedle);
    doneCountQuery.ilike("owner_name", ownerNeedle);
    overdueCountQuery.ilike("owner_name", ownerNeedle);
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

  const itemList = (items ?? []) as ActionItem[];
  const meetingIds = Array.from(new Set(itemList.map((item) => item.meeting_id)));
  const meetingsById = new Map<string, Meeting>();

  if (meetingIds.length > 0) {
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, company_name, meeting_type, meeting_date, status")
      .in("id", meetingIds);

    if (!meetingsError && meetings) {
      for (const meeting of meetings as Meeting[]) {
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

export default async function ActionItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ownerFilter = parseOwnerFilter(params.owner);
  const dueFilter = parseDueFilter(params.due);
  const statusFilter = parseStatusFilter(params.status);

  const { items, meetingsById, counts, atLimit, error } = await getActionItemsWithMeetings(
    statusFilter,
    dueFilter,
    ownerFilter,
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Couldn&apos;t load action items right now. Please refresh the page or try again shortly.
      </div>
    );
  }

  // All filters (status, due window, owner) are applied in-query before the
  // LIMIT, so the returned items ARE the rows to render.
  const { open: openCount, done: doneCount, overdue: overdueCount } = counts;
  const rows = items;
  const today = todayIso();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-neutral-900">Action Items</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="indigo">{openCount} open</Badge>
          <Badge variant="red">{overdueCount} overdue</Badge>
          <Badge variant="green">{doneCount} done</Badge>
        </div>
      </div>

      {atLimit ? (
        <p className="text-xs text-neutral-500">
          Showing the first {200} items by due date — narrow with the filters below.
        </p>
      ) : null}

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="owner" className="text-xs font-medium text-neutral-600">
            Owner
          </label>
          <input
            id="owner"
            name="owner"
            type="text"
            defaultValue={ownerFilter}
            placeholder="Search owner…"
            className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-base text-neutral-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-48 sm:text-sm"
          />
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
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:min-h-0 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Apply
          </button>
          <Link
            href="/action-items"
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:min-h-0 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Clear
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No action items match"
          message="Try widening your filters, or clear them to see everything."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] divide-y divide-neutral-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Meeting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((item) => {
                const meeting = meetingsById.get(item.meeting_id);
                const isOverdue =
                  item.item_status === "open" &&
                  item.due_date !== null &&
                  item.due_date < today;

                return (
                  <tr key={item.id} className="align-top">
                    <td className="max-w-md px-4 py-3">
                      <div className="text-neutral-800">{item.description}</div>
                      <ConfidenceTag confidence={item.description_confidence} label="Low confidence" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.owner_name ? (
                        <span className="text-neutral-700">{item.owner_name}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400">—</span>
                          <Badge variant="amber">No owner</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={isOverdue ? "font-medium text-red-600" : "text-neutral-700"}>
                        {formatDate(item.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggle
                        itemId={item.id}
                        meetingId={item.meeting_id}
                        initialStatus={item.item_status}
                      />
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
