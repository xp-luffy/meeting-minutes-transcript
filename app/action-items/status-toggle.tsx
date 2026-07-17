"use client";

import { useState, useTransition } from "react";
import { FOCUS_RING, ItemStatusPill } from "@/components/ui";
import { toggleActionItem } from "./actions";

/**
 * Status pill + toggle button for a single action item row in the global
 * Action Items list. Optimistically flips the pill via useTransition, then
 * confirms (or rolls back) against the server action's result.
 */
export function StatusToggle({
  itemId,
  meetingId,
  initialStatus,
}: {
  itemId: string;
  meetingId: string;
  initialStatus: "open" | "done";
}) {
  const [status, setStatus] = useState<"open" | "done">(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = status === "open" ? "done" : "open";
    const previous = status;
    setError(null);
    setStatus(next); // optimistic
    startTransition(async () => {
      const result = await toggleActionItem(itemId, meetingId, next);
      if (result.error) {
        setStatus(previous); // roll back
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <ItemStatusPill status={status} />
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`min-h-11 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          {isPending ? "Saving…" : status === "open" ? "Mark done" : "Reopen"}
        </button>
      </div>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
