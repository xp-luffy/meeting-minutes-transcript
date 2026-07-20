"use client";

import { useState, useTransition } from "react";
import { Badge, FOCUS_RING } from "@/components/ui";
import type { ObligationStatus } from "@/lib/obligations";
import { setObligationStatus } from "./actions";

const STATUS_LABEL: Record<ObligationStatus, string> = {
  open: "Open",
  done: "Done",
  waived: "Waived",
};

const STATUS_VARIANT: Record<ObligationStatus, "indigo" | "green" | "neutral"> = {
  open: "indigo",
  done: "green",
  waived: "neutral",
};

/** open -> done -> waived -> open */
const NEXT_STATUS: Record<ObligationStatus, ObligationStatus> = {
  open: "done",
  done: "waived",
  waived: "open",
};

/**
 * Status pill + cycle button for a single obligation row in the cross-
 * portfolio register (Open -> Done -> Waived -> Open). Optimistic update via
 * useTransition, rolled back on server error — same pattern as
 * app/action-items/status-toggle.tsx.
 */
export function ObligationStatusToggle({
  obligationId,
  meetingId,
  initialStatus,
}: {
  obligationId: string;
  meetingId: string;
  initialStatus: ObligationStatus;
}) {
  const [status, setStatus] = useState<ObligationStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdvance() {
    const next = NEXT_STATUS[status];
    const previous = status;
    setError(null);
    setStatus(next); // optimistic
    startTransition(async () => {
      const result = await setObligationStatus(obligationId, meetingId, next);
      if (result.error) {
        setStatus(previous); // roll back
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[status]} className="capitalize">
          {STATUS_LABEL[status]}
        </Badge>
        <button
          type="button"
          onClick={handleAdvance}
          disabled={isPending}
          className={`min-h-11 rounded-surface border border-paper-450 bg-white px-2.5 py-1 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          {isPending ? "Saving…" : `Mark ${STATUS_LABEL[NEXT_STATUS[status]].toLowerCase()}`}
        </button>
      </div>
      {error ? <span className="text-caption text-status-failed-600">{error}</span> : null}
    </div>
  );
}
