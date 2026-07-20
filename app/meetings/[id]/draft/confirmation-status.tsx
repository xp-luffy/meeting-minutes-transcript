import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { StatusBanner } from "@/components/status";

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
      <StatusBanner state="verified" title="Confirmed">
        {names.join(", ")} · {formatDate(latestConfirmedAt)}
      </StatusBanner>
    );
  }

  if (draftStatus === "final") {
    // Final, but nobody in the room ever confirmed it. That is an absence, not
    // an achievement, and it may not render as a neutral aside.
    return (
      <StatusBanner state="unknown" title="Finalised without recorded confirmations">
        No attendee has confirmed these minutes as a correct record.
      </StatusBanner>
    );
  }

  const daysUnconfirmed = Math.max(
    0,
    Math.floor((Date.now() - new Date(meetingDate).getTime()) / MS_PER_DAY),
  );
  const isMemoryRisk = daysUnconfirmed > 14;
  const shareCount = activeShareCount ?? 0;

  /*
   * These two used to differ by COLOUR ALONE — red-50 vs amber-50, same shape,
   * same glyph (none), same title. For a deuteranopic reader, and in any
   * greyscale print, "memory risk" and "ordinary unconfirmed" were the same
   * banner. They are now two different STATES: a different glyph, a different
   * border weight, and a different title word each.
   */
  return (
    <StatusBanner
      state={isMemoryRisk ? "failed" : "risk"}
      title={
        isMemoryRisk
          ? `Unconfirmed — memory risk (${daysUnconfirmed} days)`
          : `Awaiting confirmation (${daysUnconfirmed} ${daysUnconfirmed === 1 ? "day" : "days"})`
      }
    >
      {isMemoryRisk
        ? "More than 14 days have passed since the meeting. Recollection of what was decided degrades, and an unconfirmed record is materially harder to defend."
        : null}
      {isMemoryRisk ? <br /> : null}
      {shareCount > 0
        ? `${shareCount} review link${shareCount === 1 ? "" : "s"} active — awaiting confirmation`
        : "Circulate for confirmation with the button above"}
    </StatusBanner>
  );
}
