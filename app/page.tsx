import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Meeting, MinutesDraft } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

async function getMeetingsWithLatestDrafts(): Promise<{
  meetings: Meeting[];
  latestDraftByMeeting: Map<string, MinutesDraft>;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: meetings, error: meetingsError } = await supabase
    .from("meetings")
    .select(
      "id, company_name, meeting_type, meeting_date, venue, chairperson, attendees, quorum_met, status, created_at",
    )
    .order("meeting_date", { ascending: false });

  if (meetingsError) {
    return { meetings: [], latestDraftByMeeting: new Map(), error: meetingsError.message };
  }

  const meetingList = (meetings ?? []) as Meeting[];
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

export default async function Home() {
  const { meetings, latestDraftByMeeting, error } = await getMeetingsWithLatestDrafts();

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Meetings</h1>
      </div>
      <ul className="space-y-3">
        {meetings.map((meeting) => {
          const draft = latestDraftByMeeting.get(meeting.id);
          return (
            <li
              key={meeting.id}
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
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
        })}
      </ul>
    </div>
  );
}
