import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Meeting, MinutesDraft } from "@/lib/types";
import { StatusBadge, Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";
import { getMyWorkspaces, type WorkspaceSummary } from "@/lib/workspace";

type MeetingRow = Meeting & { user_id: string | null; workspace_id: string | null };

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const HOMEPAGE_MEETING_LIMIT = 200;

async function getMeetingsWithLatestDrafts(): Promise<{
  meetings: MeetingRow[];
  latestDraftByMeeting: Map<string, MinutesDraft>;
  confirmationCountByMeeting: Map<string, number>;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: meetings, error: meetingsError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at, user_id, workspace_id",
    )
    .order("meeting_date", { ascending: false })
    // Bounded for scale (SIM_REPORT.md) but high enough that a multi-workspace
    // portfolio's older groups aren't starved by one busy group (audit P2).
    // Complete per-group views live at /companies and /workspaces.
    .limit(HOMEPAGE_MEETING_LIMIT);

  if (meetingsError) {
    return {
      meetings: [],
      latestDraftByMeeting: new Map(),
      confirmationCountByMeeting: new Map(),
      error: meetingsError.message,
    };
  }

  const meetingList = (meetings ?? []) as MeetingRow[];
  const meetingIds = meetingList.map((m) => m.id);

  const latestDraftByMeeting = new Map<string, MinutesDraft>();
  const confirmationCountByMeeting = new Map<string, number>();

  if (meetingIds.length > 0) {
    const [{ data: drafts, error: draftsError }, { data: confirmationRows }] = await Promise.all([
      supabase
        .from("minutes_drafts")
        .select(
          "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, created_at",
        )
        .in("meeting_id", meetingIds)
        .order("version", { ascending: false }),
      // Bulk confirmations lookup for the exposure chip below — one query
      // for the whole list, counted per meeting in JS (no N+1).
      supabase.from("confirmations").select("meeting_id").in("meeting_id", meetingIds),
    ]);

    if (!draftsError && drafts) {
      for (const draft of drafts as MinutesDraft[]) {
        if (!latestDraftByMeeting.has(draft.meeting_id)) {
          latestDraftByMeeting.set(draft.meeting_id, draft);
        }
      }
    }

    if (confirmationRows) {
      for (const row of confirmationRows as { meeting_id: string }[]) {
        confirmationCountByMeeting.set(
          row.meeting_id,
          (confirmationCountByMeeting.get(row.meeting_id) ?? 0) + 1,
        );
      }
    }
  }

  return { meetings: meetingList, latestDraftByMeeting, confirmationCountByMeeting, error: null };
}

function MeetingCard({
  meeting,
  draft,
  confirmationCount,
}: {
  meeting: MeetingRow;
  draft?: MinutesDraft;
  confirmationCount: number;
}) {
  const daysSinceMeeting = Math.floor(
    (Date.now() - new Date(meeting.meeting_date).getTime()) / MS_PER_DAY,
  );
  const showUnconfirmedChip =
    !!draft && draft.status !== "final" && confirmationCount === 0 && daysSinceMeeting > 7;

  return (
    <li className="relative rounded-surface border border-paper-200 bg-white p-4 shadow-raised transition-shadow hover:border-paper-450 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              title={meeting.company_name}
              className="min-w-0 max-w-full truncate text-base font-medium text-paper-900"
            >
              {meeting.company_name}
            </h2>
            <StatusBadge status={meeting.status} />
            {showUnconfirmedChip ? (
              <Badge variant="amber">Unconfirmed · {daysSinceMeeting}d</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-body text-paper-500">
            {meeting.meeting_type} &middot; {formatDate(meeting.meeting_date)}
            {meeting.venue ? <> &middot; {meeting.venue}</> : null}
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          {draft ? (
            <Link
              href={`/meetings/${meeting.id}/draft`}
              className="focus-ring relative inline-flex items-center rounded-full bg-ink-50 px-3 py-1 text-caption font-medium text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-100 after:absolute after:inset-0 after:content-['']"
            >
              Minutes v{draft.version}
            </Link>
          ) : (
            <Link
              href={`/meetings/${meeting.id}/transcript`}
              className="focus-ring relative inline-flex items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 after:absolute after:inset-0 after:content-['']"
            >
              Add transcript
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function MeetingGroup({
  title,
  meetings,
  latestDraftByMeeting,
  confirmationCountByMeeting,
  emptyHint,
}: {
  title: string;
  meetings: MeetingRow[];
  latestDraftByMeeting: Map<string, MinutesDraft>;
  confirmationCountByMeeting: Map<string, number>;
  emptyHint?: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 truncate text-caption font-semibold tracking-wide text-paper-500 uppercase">
        {title}
      </h2>
      {meetings.length === 0 && emptyHint ? (
        <div className="rounded-surface border border-dashed border-paper-300 bg-white p-4 text-body text-paper-500">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              draft={latestDraftByMeeting.get(meeting.id)}
              confirmationCount={confirmationCountByMeeting.get(meeting.id) ?? 0}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Home() {
  const [{ meetings, latestDraftByMeeting, confirmationCountByMeeting, error }, sessionUser] =
    await Promise.all([getMeetingsWithLatestDrafts(), getSessionUser()]);
  const workspaces: WorkspaceSummary[] = sessionUser ? await getMyWorkspaces() : [];

  if (error) {
    return (
      <div className="rounded-surface border border-status-failed-200 bg-status-failed-50 p-6 text-body text-status-failed-700 sm:p-8">
        Couldn&apos;t load meetings right now. Please refresh the page or try again shortly.
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="rounded-surface border border-dashed border-paper-300 bg-white p-8 text-center sm:p-10">
        <h1 className="text-page font-semibold text-paper-900">No meetings yet</h1>
        <p className="mt-2 text-body text-paper-500">
          Create your first meeting to start drafting statutory minutes.
        </p>
        <Link
          href="/meetings/new"
          className="focus-ring mt-5 inline-flex w-full items-center justify-center rounded-surface bg-ink-600 px-4 py-2 text-body font-medium text-white hover:bg-ink-700 sm:w-auto"
        >
          New Meeting
        </Link>
      </div>
    );
  }

  // Logged out, or logged in with no workspaces yet: keep the original flat list.
  if (!sessionUser || workspaces.length === 0) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-page font-semibold text-paper-900">
            Meetings{" "}
            <span className="font-normal text-paper-500">({meetings.length})</span>
          </h1>
        </div>
        <ul className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              draft={latestDraftByMeeting.get(meeting.id)}
              confirmationCount={confirmationCountByMeeting.get(meeting.id) ?? 0}
            />
          ))}
        </ul>
      </div>
    );
  }

  const byWorkspace = new Map<string, MeetingRow[]>();
  const personal: MeetingRow[] = [];
  for (const meeting of meetings) {
    if (meeting.workspace_id) {
      const arr = byWorkspace.get(meeting.workspace_id) ?? [];
      arr.push(meeting);
      byWorkspace.set(meeting.workspace_id, arr);
    } else {
      personal.push(meeting);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-page font-semibold text-paper-900">
          Meetings <span className="font-normal text-paper-500">({meetings.length})</span>
        </h1>
      </div>

      {workspaces.map((ws) => (
        <MeetingGroup
          key={ws.id}
          title={ws.name}
          meetings={byWorkspace.get(ws.id) ?? []}
          latestDraftByMeeting={latestDraftByMeeting}
          confirmationCountByMeeting={confirmationCountByMeeting}
          emptyHint={
            <>
              No meetings in this workspace yet.{" "}
              <Link
                href={`/meetings/new?workspace=${ws.id}`}
                className="focus-ring rounded text-ink-600 hover:underline"
              >
                Add one
              </Link>
              .
            </>
          }
        />
      ))}

      {personal.length > 0 ? (
        <MeetingGroup
          title="Personal"
          meetings={personal}
          latestDraftByMeeting={latestDraftByMeeting}
          confirmationCountByMeeting={confirmationCountByMeeting}
        />
      ) : null}

    </div>
  );
}
