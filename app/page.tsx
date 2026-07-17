import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Meeting, MinutesDraft } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";
import { getMyWorkspaces, type WorkspaceSummary } from "@/lib/workspace";

type MeetingRow = Meeting & { user_id: string | null; workspace_id: string | null };

async function getMeetingsWithLatestDrafts(): Promise<{
  meetings: MeetingRow[];
  latestDraftByMeeting: Map<string, MinutesDraft>;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: meetings, error: meetingsError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at, user_id, workspace_id",
    )
    .order("meeting_date", { ascending: false });

  if (meetingsError) {
    return { meetings: [], latestDraftByMeeting: new Map(), error: meetingsError.message };
  }

  const meetingList = (meetings ?? []) as MeetingRow[];
  const meetingIds = meetingList.map((m) => m.id);

  const latestDraftByMeeting = new Map<string, MinutesDraft>();

  if (meetingIds.length > 0) {
    const { data: drafts, error: draftsError } = await supabase
      .from("minutes_drafts")
      .select(
        "id, meeting_id, transcript_id, body_html, body_html_source, body_html_confidence, body_html_review_status, status, version, created_at",
      )
      .in("meeting_id", meetingIds)
      .order("version", { ascending: false });

    if (!draftsError && drafts) {
      for (const draft of drafts as MinutesDraft[]) {
        if (!latestDraftByMeeting.has(draft.meeting_id)) {
          latestDraftByMeeting.set(draft.meeting_id, draft);
        }
      }
    }
  }

  return { meetings: meetingList, latestDraftByMeeting, error: null };
}

function MeetingCard({ meeting, draft }: { meeting: MeetingRow; draft?: MinutesDraft }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium text-neutral-900">
              {meeting.company_name}
            </h2>
            <StatusBadge status={meeting.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {meeting.meeting_type} &middot; {formatDate(meeting.meeting_date)}
            {meeting.venue ? <> &middot; {meeting.venue}</> : null}
          </p>
        </div>
        <div className="shrink-0">
          {draft ? (
            <Link
              href={`/meetings/${meeting.id}/draft`}
              className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
            >
              Minutes v{draft.version}
            </Link>
          ) : (
            <Link
              href={`/meetings/${meeting.id}/transcript`}
              className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
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
  emptyHint,
}: {
  title: string;
  meetings: MeetingRow[];
  latestDraftByMeeting: Map<string, MinutesDraft>;
  emptyHint?: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
      </h2>
      {meetings.length === 0 && emptyHint ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              draft={latestDraftByMeeting.get(meeting.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Home() {
  const [{ meetings, latestDraftByMeeting, error }, sessionUser] = await Promise.all([
    getMeetingsWithLatestDrafts(),
    getSessionUser(),
  ]);
  const workspaces: WorkspaceSummary[] = sessionUser ? await getMyWorkspaces() : [];

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Couldn&apos;t load meetings right now. Please refresh the page or try again shortly.
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">No meetings yet</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Create your first meeting to start drafting statutory minutes.
        </p>
        <Link
          href="/meetings/new"
          className="mt-5 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
          <h1 className="text-lg font-semibold text-neutral-900">Meetings</h1>
        </div>
        <ul className="space-y-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              draft={latestDraftByMeeting.get(meeting.id)}
            />
          ))}
        </ul>
      </div>
    );
  }

  const byWorkspace = new Map<string, MeetingRow[]>();
  const personal: MeetingRow[] = [];
  const demo: MeetingRow[] = [];
  for (const meeting of meetings) {
    if (meeting.workspace_id) {
      const arr = byWorkspace.get(meeting.workspace_id) ?? [];
      arr.push(meeting);
      byWorkspace.set(meeting.workspace_id, arr);
    } else if (meeting.user_id) {
      personal.push(meeting);
    } else {
      demo.push(meeting);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Meetings</h1>
      </div>

      {workspaces.map((ws) => (
        <MeetingGroup
          key={ws.id}
          title={ws.name}
          meetings={byWorkspace.get(ws.id) ?? []}
          latestDraftByMeeting={latestDraftByMeeting}
          emptyHint={
            <>
              No meetings in this workspace yet.{" "}
              <Link href={`/meetings/new?workspace=${ws.id}`} className="text-indigo-600 hover:underline">
                Add one
              </Link>
              .
            </>
          }
        />
      ))}

      {personal.length > 0 ? (
        <MeetingGroup title="Personal" meetings={personal} latestDraftByMeeting={latestDraftByMeeting} />
      ) : null}

      {demo.length > 0 ? (
        <MeetingGroup title="Demo library" meetings={demo} latestDraftByMeeting={latestDraftByMeeting} />
      ) : null}
    </div>
  );
}
