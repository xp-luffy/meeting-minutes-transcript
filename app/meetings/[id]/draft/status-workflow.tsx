"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MeetingStatus } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { FOCUS_RING } from "@/components/ui";
import { markDraftFinal, markDraftReviewed } from "./actions";

const CONFIRM_WINDOW_MS = 4000;

/**
 * Header controls for the draft status workflow: draft → reviewed → final.
 * "Mark Final" requires a second click within a short window to confirm,
 * since it locks all editing once applied.
 */
export function StatusWorkflow({
  draftId,
  meetingId,
  status,
  finalisedAt,
}: {
  draftId: string;
  meetingId: string;
  status: MeetingStatus;
  finalisedAt: string | null;
}) {
  const router = useRouter();
  const [confirmingFinal, setConfirmingFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  function handleMarkReviewed() {
    setError(null);
    startTransition(async () => {
      const result = await markDraftReviewed(draftId, meetingId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMarkFinalClick() {
    setError(null);
    if (!confirmingFinal) {
      setConfirmingFinal(true);
      confirmTimer.current = setTimeout(() => setConfirmingFinal(false), CONFIRM_WINDOW_MS);
      return;
    }

    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingFinal(false);
    startTransition(async () => {
      const result = await markDraftFinal(draftId, meetingId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (status === "final") {
    return (
      <div className="rounded-surface border border-paper-200 bg-paper-50 px-3 py-1.5 text-caption font-medium text-paper-600">
        Finalised on {formatDate(finalisedAt)} — editing locked
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-caption font-medium text-status-failed-600">{error}</span> : null}
      {status === "draft" ? (
        <button
          type="button"
          onClick={handleMarkReviewed}
          disabled={isPending}
          className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
        >
          {isPending ? "Saving…" : "Mark Reviewed"}
        </button>
      ) : null}
      {status === "reviewed" ? (
        <button
          type="button"
          onClick={handleMarkFinalClick}
          disabled={isPending}
          className={`inline-flex min-h-11 items-center rounded-surface px-3 py-1.5 text-caption font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING} ${
            confirmingFinal
              ? "bg-status-failed-600 text-white hover:bg-status-failed-700"
              : "border border-paper-450 bg-white text-paper-700 hover:bg-paper-50"
          }`}
        >
          {isPending ? "Saving…" : confirmingFinal ? "Confirm Mark Final?" : "Mark Final"}
        </button>
      ) : null}
    </div>
  );
}
