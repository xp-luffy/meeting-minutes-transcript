import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Compact confirmation-exposure strip for the draft page: shows who has
 * confirmed the minutes, or — while unconfirmed — how many days of exposure
 * have accrued since the meeting. Self-contained; not mounted anywhere yet
 * (the orchestrator wires it into draft/page.tsx once all V2 pillars land).
 */
export async function ConfirmationStatus({
  meetingId,
  draftId,
  meetingDate,
  draftStatus,
}: {
  meetingId: string;
  draftId: string;
  meetingDate: string;
  draftStatus: string;
}) {
  const supabase = await createClient();

  const [{ data: confirmations }, { count: activeShareCount }] = await Promise.all([
    supabase
      .from("confirmations")
      .select("confirmed_name, confirmed_at")
      .eq("draft_id", draftId)
      .order("confirmed_at", { ascending: true }),
    supabase
      .from("review_shares")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", meetingId)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const confirmedRows = (confirmations ?? []) as { confirmed_name: string; confirmed_at: string }[];

  if (confirmedRows.length > 0) {
    const names = confirmedRows.map((row) => row.confirmed_name);
    const latestConfirmedAt = confirmedRows[confirmedRows.length - 1].confirmed_at;
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        Confirmed by {names.join(", ")} · {formatDate(latestConfirmedAt)}
      </div>
    );
  }

  if (draftStatus === "final") {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
        Finalised without recorded confirmations
      </div>
    );
  }

  const daysUnconfirmed = Math.max(
    0,
    Math.floor((Date.now() - new Date(meetingDate).getTime()) / MS_PER_DAY),
  );
  const isMemoryRisk = daysUnconfirmed > 14;
  const shareCount = activeShareCount ?? 0;

  return (
    <div
      className={`rounded-md border px-4 py-2 text-sm ${
        isMemoryRisk
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <p className="font-medium">
        Unconfirmed for {daysUnconfirmed} {daysUnconfirmed === 1 ? "day" : "days"}
        {isMemoryRisk ? " — memory risk" : ""}
      </p>
      <p className="mt-0.5 text-xs opacity-80">
        {shareCount > 0
          ? `${shareCount} review link${shareCount === 1 ? "" : "s"} active — awaiting confirmation`
          : "Circulate for confirmation with the button above"}
      </p>
    </div>
  );
}
