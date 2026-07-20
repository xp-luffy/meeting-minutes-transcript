import { formatDateTime } from "@/lib/format";

export interface AuditLogEntry {
  id: string;
  meeting_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Turns a raw audit_logs row into a human-readable one-line description. */
function describeEntry(entry: AuditLogEntry): string {
  const payload = entry.payload ?? {};

  switch (entry.action) {
    case "generate_minutes_draft": {
      const version = typeof payload.version === "number" ? payload.version : "?";
      const source = typeof payload.source === "string" ? payload.source : "unknown";
      return `Minutes draft generated (v${version}, ${source})`;
    }
    case "status_change": {
      const from = typeof payload.from === "string" ? payload.from : "?";
      const to = typeof payload.to === "string" ? payload.to : "?";
      return `Status changed ${from} → ${to}`;
    }
    case "edit_draft_body":
      return "Draft body edited";
    case "edit_resolution":
      return "Resolution edited";
    case "edit_action_item":
      return "Action item edited";
    case "toggle_action_item":
      return "Action item status toggled";
    case "approve_field":
      return "Low-confidence field accepted";
    case "edit_attendance":
      return "Attendance updated";
    case "export_docx":
      return "Exported DOCX";
    case "export_pdf":
      return "Exported PDF";
    default:
      return entry.action;
  }
}

/**
 * Read-only "Activity" timeline showing the last 20 audit_logs rows for the
 * meeting, newest first, with a humanised description per action.
 */
export function ActivityFeed({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <div className="rounded-surface border border-paper-200 bg-white p-6 shadow-raised">
      <h2 className="text-subhead font-medium text-paper-700">Activity</h2>

      {entries.length === 0 ? (
        <p className="mt-3 text-body text-paper-500">No activity recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-paper-300" />
              <div className="min-w-0">
                <p className="text-caption text-paper-600">{describeEntry(entry)}</p>
                <p className="text-caption text-paper-500">{formatDateTime(entry.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
