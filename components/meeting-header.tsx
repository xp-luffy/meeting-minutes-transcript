import type { Meeting } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/ui";

/** Shared small header block showing company, meeting type, date and status. */
export function MeetingHeader({ meeting }: { meeting: Meeting }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-300 pb-4">
      <div className="min-w-0">
        <h1 className="truncate text-page font-semibold text-paper-900">{meeting.company_name}</h1>
        <p className="mt-1 text-body text-paper-600">
          {meeting.meeting_type} &middot; {formatDate(meeting.meeting_date)}
          {meeting.venue ? <> &middot; {meeting.venue}</> : null}
        </p>
      </div>
      <StatusBadge status={meeting.status} />
    </div>
  );
}
