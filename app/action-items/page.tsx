import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActionItem, Meeting } from "@/lib/types";
import { Badge, ConfidenceTag, EmptyState, FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { OwnerCell } from "@/components/owner-picker";
import { OWNER_FILTERS, OWNER_FILTER_LABELS, parseOwnerFilter, type OwnerFilter } from "@/lib/owners";
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

function parseOwnerSearch(value: string | string[] | undefined): string {
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

/**
 * Applies the owner-state filter IN THE QUERY. It must never be a JS filter
 * over a LIMITed page: "needs an owner" is a worklist, and an item past the
 * slice would silently drop out of the very queue built to stop items
 * vanishing (docs/PILOT_PLAYBOOK.md pattern D).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function applyOwnerFilter(query: any, filter: OwnerFilter): any {
  switch (filter) {
    case "needs":
      // BOTH unassigned and text-only — a free-text owner is not chaseable.
      return query.is("owner_entity_id", null);
    // Migration 0017 normalises blank owner_name to NULL and the write path
    // keeps it that way, so `owner_name IS NULL` is a sound test for
    // "unassigned" — no JS post-filter needed, and none allowed.
    case "text_only":
      return query.is("owner_entity_id", null).not("owner_name", "is", null);
    case "unassigned":
      return query.is("owner_entity_id", null).is("owner_name", null);
    case "linked":
      return query.not("owner_entity_id", "is", null);
    default:
      return query;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface OwnerRow extends ActionItem {
  owner_entity_id: string | null;
}

async function getActionItemsWithMeetings(
  statusFilter: StatusFilter,
  dueFilter: DueFilter,
  ownerSearch: string,
  ownerFilter: OwnerFilter,
): Promise<{
  items: OwnerRow[];
  meetingsById: Map<string, Meeting>;
  personNameById: Map<string, string>;
  counts: { open: number; done: number; overdue: number; needsOwner: number };
  countsError: boolean;
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
      "id, meeting_id, description, description_confidence, description_review_status, owner_name, owner_entity_id, due_date, item_status, created_at",
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
  if (ownerSearch) {
    // ilike with escaped wildcards — substring, case-insensitive
    const needle = ownerSearch.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike("owner_name", `%${needle}%`);
  }
  query = applyOwnerFilter(query, ownerFilter);

  // Count chips are owner-scoped (match the visible owner filter) but span all
  // statuses/due windows. Build each with its own owner-filtered count query.
  const ownerNeedle = ownerSearch ? `%${ownerSearch.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;
  const openCountQuery = supabase.from("action_items").select("id", { count: "exact", head: true }).eq("item_status", "open");
  const doneCountQuery = supabase.from("action_items").select("id", { count: "exact", head: true }).eq("item_status", "done");
  const overdueCountQuery = supabase
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("item_status", "open")
    .lt("due_date", today);
  // "Needs an owner" is deliberately counted over OPEN items only and is NOT
  // narrowed by the owner-state filter — it is the size of the gap, and it has
  // to stay true while the user is looking at a filtered slice of it.
  const needsOwnerCountQuery = supabase
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("item_status", "open")
    .is("owner_entity_id", null);
  if (ownerNeedle) {
    openCountQuery.ilike("owner_name", ownerNeedle);
    doneCountQuery.ilike("owner_name", ownerNeedle);
    overdueCountQuery.ilike("owner_name", ownerNeedle);
    needsOwnerCountQuery.ilike("owner_name", ownerNeedle);
  }

  const [{ data: items, error: itemsError }, openRes, doneRes, overdueRes, needsRes] = await Promise.all([
    query,
    openCountQuery,
    doneCountQuery,
    overdueCountQuery,
    needsOwnerCountQuery,
  ]);

  const counts = {
    open: openRes.count ?? 0,
    done: doneRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
    needsOwner: needsRes.count ?? 0,
  };
  // A failed count must not render as a confident "0" — that would understate
  // the gap the user is liable for.
  const countsError = Boolean(openRes.error || doneRes.error || overdueRes.error || needsRes.error);

  if (itemsError) {
    return {
      items: [],
      meetingsById: new Map(),
      personNameById: new Map(),
      counts,
      countsError,
      atLimit: false,
      error: itemsError.message,
    };
  }

  const itemList = (items ?? []) as OwnerRow[];
  const meetingIds = Array.from(new Set(itemList.map((item) => item.meeting_id)));
  const meetingsById = new Map<string, Meeting>();
  const personNameById = new Map<string, string>();

  const ownerIds = Array.from(
    new Set(itemList.map((i) => i.owner_entity_id).filter((v): v is string => Boolean(v))),
  );

  const [meetingsResult, peopleResult] = await Promise.all([
    meetingIds.length > 0
      ? supabase.from("meetings").select("id, company_name, meeting_type, meeting_date, status").in("id", meetingIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? supabase.from("entities").select("id, canonical_name").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!meetingsResult.error && meetingsResult.data) {
    for (const meeting of meetingsResult.data as Meeting[]) {
      meetingsById.set(meeting.id, meeting);
    }
  }
  // Ids missing from this result are people RLS hides from the caller. They
  // render as "Owner not visible to you", never as a blank cell.
  if (!peopleResult.error && peopleResult.data) {
    for (const person of peopleResult.data as { id: string; canonical_name: string }[]) {
      personNameById.set(person.id, person.canonical_name);
    }
  }

  return {
    items: itemList,
    meetingsById,
    personNameById,
    counts,
    countsError,
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
  const ownerSearch = parseOwnerSearch(params.owner);
  const ownerFilter = parseOwnerFilter(params.owner_state);
  const dueFilter = parseDueFilter(params.due);
  const statusFilter = parseStatusFilter(params.status);

  const { items, meetingsById, personNameById, counts, countsError, atLimit, error } =
    await getActionItemsWithMeetings(statusFilter, dueFilter, ownerSearch, ownerFilter);

  if (error) {
    return (
      <div className="rounded-surface border border-status-failed-200 bg-status-failed-50 p-6 text-body text-status-failed-700">
        Couldn&apos;t load action items right now. Please refresh the page or try again shortly.
      </div>
    );
  }

  // All filters (status, due window, owner text, owner state) are applied
  // in-query before the LIMIT, so the returned items ARE the rows to render.
  const { open: openCount, done: doneCount, overdue: overdueCount, needsOwner } = counts;
  const rows = items;
  const today = todayIso();

  function ownerCellFor(item: OwnerRow) {
    const meeting = meetingsById.get(item.meeting_id);
    return (
      <OwnerCell
        itemId={item.id}
        meetingId={item.meeting_id}
        ownerName={item.owner_name}
        ownerEntityId={item.owner_entity_id}
        ownerDisplayName={item.owner_entity_id ? (personNameById.get(item.owner_entity_id) ?? null) : null}
        // A hint only — the server action re-checks the draft status and is
        // the authority on whether the recorded text is locked.
        isFinal={meeting?.status === "final"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page font-semibold text-paper-900">Action Items</h1>
        <div className="flex flex-wrap items-center gap-2 text-caption">
          {countsError ? (
            <span className="text-paper-500">Counts unavailable</span>
          ) : (
            <>
              <Badge variant="indigo">{openCount} open</Badge>
              <Badge variant="red">{overdueCount} overdue</Badge>
              {needsOwner > 0 ? <Badge variant="amber">{needsOwner} need an owner</Badge> : null}
              <Badge variant="green">{doneCount} done</Badge>
            </>
          )}
        </div>
      </div>

      {atLimit ? (
        <p className="text-caption text-paper-500">
          Showing the first {PAGE_LIMIT} items by due date — narrow with the filters below.
        </p>
      ) : null}

      <form
        method="get"
        className="flex flex-col gap-3 rounded-surface border border-paper-200 bg-white p-4 shadow-raised sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="owner_state" className="text-caption font-medium text-paper-600">
            Owner
          </label>
          <select
            id="owner_state"
            name="owner_state"
            defaultValue={ownerFilter}
            className="w-full rounded-surface border border-paper-450 px-2.5 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:w-auto sm:text-body"
          >
            {OWNER_FILTERS.map((f) => (
              <option key={f} value={f}>
                {OWNER_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="owner" className="text-caption font-medium text-paper-600">
            Search owner text
          </label>
          <input
            id="owner"
            name="owner"
            type="text"
            defaultValue={ownerSearch}
            placeholder="e.g. Finance"
            className="w-full rounded-surface border border-paper-450 px-2.5 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:w-40 sm:text-body"
          />
        </div>
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="due" className="text-caption font-medium text-paper-600">
            Due
          </label>
          <select
            id="due"
            name="due"
            defaultValue={dueFilter}
            className="w-full rounded-surface border border-paper-450 px-2.5 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:w-auto sm:text-body"
          >
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="week">Next 7 days</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:w-auto">
          <label htmlFor="status" className="text-caption font-medium text-paper-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-surface border border-paper-450 px-2.5 py-1.5 text-base text-paper-800 focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-500 sm:w-auto sm:text-body"
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-surface bg-ink-600 px-3.5 py-2 text-body font-medium text-white transition-colors hover:bg-ink-700 sm:min-h-0 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Apply
          </button>
          <Link
            href="/action-items"
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-surface border border-paper-450 bg-white px-3.5 py-2 text-center text-body font-medium text-paper-700 hover:bg-paper-50 sm:min-h-0 sm:flex-none sm:py-1.5 ${FOCUS_RING}`}
          >
            Clear
          </Link>
        </div>
      </form>

      {ownerFilter !== "all" ? (
        <p className="text-body text-paper-600">
          {OWNER_FILTER_LABELS[ownerFilter]} — {rows.length}
          {atLimit ? "+" : ""} item{rows.length === 1 ? "" : "s"} shown.
          {ownerFilter === "needs" ? (
            <span className="text-paper-500">
              {" "}
              Includes items with no owner at all and items whose owner is recorded only as text.
            </span>
          ) : null}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No action items match"
          message="Try widening your filters, or clear them to see everything."
        />
      ) : (
        <>
          {/* Below sm: stacked cards. Scrolling a legal worklist sideways on a
              phone is how items get missed (DESIGN_SPEC_V4 §3.7). */}
          <ul className="space-y-3 sm:hidden">
            {rows.map((item) => {
              const meeting = meetingsById.get(item.meeting_id);
              const isOverdue =
                item.item_status === "open" && item.due_date !== null && item.due_date < today;
              return (
                <li key={item.id} className="rounded-surface border border-paper-200 bg-white p-4 shadow-raised">
                  <p className="text-body text-paper-800">{item.description}</p>
                  <ConfidenceTag confidence={item.description_confidence} label="Low confidence" />
                  <p className="mt-1 text-caption text-paper-500">
                    {meeting ? `${meeting.company_name} · ${meeting.meeting_type}` : "Meeting unavailable"}
                    {item.due_date ? (
                      <>
                        {" · "}
                        <span className={isOverdue ? "font-medium text-status-failed-600" : ""}>
                          {isOverdue ? "! overdue " : "due "}
                          {formatDate(item.due_date)}
                        </span>
                      </>
                    ) : (
                      " · no due date"
                    )}
                  </p>
                  <div className="mt-3">{ownerCellFor(item)}</div>
                  <div className="mt-3">
                    <StatusToggle
                      itemId={item.id}
                      meetingId={item.meeting_id}
                      initialStatus={item.item_status}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-surface border border-paper-200 bg-white shadow-raised sm:block">
            <table className="w-full min-w-[820px] divide-y divide-paper-200 text-body">
              <thead>
                <tr className="text-left text-caption font-medium uppercase tracking-wide text-paper-500">
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Meeting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {rows.map((item) => {
                  const meeting = meetingsById.get(item.meeting_id);
                  const isOverdue =
                    item.item_status === "open" &&
                    item.due_date !== null &&
                    item.due_date < today;

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="max-w-md px-4 py-3">
                        <div className="text-paper-800">{item.description}</div>
                        <ConfidenceTag confidence={item.description_confidence} label="Low confidence" />
                      </td>
                      <td className="px-4 py-3">{ownerCellFor(item)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={isOverdue ? "font-medium text-status-failed-600" : "text-paper-700"}>
                          {isOverdue ? "! overdue " : ""}
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
                            className={`rounded-control text-ink-600 hover:text-ink-700 ${FOCUS_RING}`}
                          >
                            {meeting.company_name}
                            <span className="text-paper-500"> · {meeting.meeting_type}</span>
                          </Link>
                        ) : (
                          <span className="text-paper-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
