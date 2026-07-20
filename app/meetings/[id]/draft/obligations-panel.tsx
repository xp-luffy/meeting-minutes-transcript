import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ObligationKind, ObligationRow } from "@/lib/obligations";

/**
 * Server component: loads this meeting's obligations (the downstream
 * statutory duties this meeting's decisions created) and renders a compact,
 * muted, read-only card. Status is edited from the cross-portfolio register
 * at /obligations, not here — this panel is a summary, not an editor.
 * Renders a compact empty note (not null) when the meeting has none yet.
 */

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

const STATUS_VARIANT: Record<ObligationRow["status"], "indigo" | "green" | "neutral"> = {
  open: "indigo",
  done: "green",
  waived: "neutral",
};

export async function ObligationsPanel({ meetingId }: { meetingId: string }) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("obligations")
    .select("id, meeting_id, resolution_id, kind, title, detail, due_date, status, source, created_at")
    .eq("meeting_id", meetingId)
    .order("due_date", { ascending: true, nullsFirst: false });

  const obligations = (data ?? []) as ObligationRow[];

  return (
    <div className="rounded-surface border border-paper-200 bg-white p-5 shadow-raised">
      <h2 className="text-caption font-semibold tracking-wide text-paper-500 uppercase">
        Obligations created by this meeting
      </h2>

      {obligations.length === 0 ? (
        <p className="mt-3 text-body text-paper-500">
          No downstream obligations were derived from this meeting.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {obligations.map((obligation) => {
            const isOverdue =
              obligation.status === "open" &&
              obligation.due_date !== null &&
              obligation.due_date < new Date().toISOString().slice(0, 10);

            return (
              <li
                key={obligation.id}
                className="rounded-surface border border-paper-200 px-3 py-2 text-caption text-paper-600"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <span className="min-w-0 font-medium break-words text-paper-700">{obligation.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={KIND_VARIANT[obligation.kind]}>{KIND_LABEL[obligation.kind]}</Badge>
                    <Badge variant={STATUS_VARIANT[obligation.status]} className="capitalize">
                      {obligation.status}
                    </Badge>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={isOverdue ? "font-medium text-status-failed-600" : "text-paper-500"}>
                    Due {formatDate(obligation.due_date)}
                  </span>
                  {obligation.detail ? (
                    <span className="text-paper-500">&middot; {obligation.detail}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
