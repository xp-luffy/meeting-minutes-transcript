"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FOCUS_RING } from "@/components/ui";

/**
 * "Regenerate" secondary button shown in the draft header. Opens an inline
 * confirm popover (no browser confirm()) warning that a fresh AI extraction
 * will overwrite the current draft body and replace non-manual resolutions /
 * action items. Confirming POSTs to the existing /api/generate-minutes route,
 * which creates a new draft version from the latest transcript.
 */
export function RegenerateButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setConfirming(false);
      }
    }
    if (confirming) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [confirming]);

  function handleRegenerateClick() {
    setError(null);
    setConfirming(true);
  }

  async function handleConfirm() {
    setError(null);
    setIsRegenerating(true);
    try {
      const response = await fetch("/api/generate-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Regeneration failed. Try again.");
        setIsRegenerating(false);
        return;
      }
      setConfirming(false);
      setIsRegenerating(false);
      router.refresh();
    } catch {
      setError("Regeneration failed. Try again.");
      setIsRegenerating(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleRegenerateClick}
        disabled={isRegenerating}
        className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
      >
        {isRegenerating ? "Regenerating…" : "Regenerate"}
      </button>

      {confirming ? (
        <div className="absolute right-0 top-full z-10 mt-2 max-h-[calc(100vh-2rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-surface border border-paper-200 bg-white p-4 text-left shadow-float">
          <p className="text-caption text-paper-600">
            This will overwrite the current draft body with a fresh AI extraction and create
            version N+1. Manual body edits will be lost. Resolutions and action items will be
            re-extracted.
          </p>
          {error ? <p className="mt-2 text-caption font-medium text-status-failed-600">{error}</p> : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isRegenerating}
              className={`inline-flex min-h-11 items-center justify-center rounded-surface px-2.5 py-1 text-caption font-medium text-paper-600 hover:bg-paper-50 disabled:cursor-not-allowed sm:min-h-0 ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isRegenerating}
              className={`inline-flex min-h-11 items-center justify-center rounded-surface bg-status-failed-600 px-2.5 py-1 text-caption font-medium text-white hover:bg-status-failed-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
            >
              {isRegenerating ? "Regenerating…" : "Confirm regenerate"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
