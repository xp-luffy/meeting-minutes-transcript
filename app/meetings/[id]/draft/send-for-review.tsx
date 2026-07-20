"use client";

import { useState, useTransition } from "react";
import { FOCUS_RING } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createReviewShare } from "./share-actions";

export function SendForReview({
  meetingId,
  draftId,
  disabled,
}: {
  meetingId: string;
  draftId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleShare() {
    setError(null);
    startTransition(async () => {
      const result = await createReviewShare(meetingId, draftId);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        setUrl(result.url);
        setExpiresAt(result.expiresAt ?? null);
      }
    });
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShare}
        disabled={disabled || pending}
        title={disabled ? "Draft is empty" : undefined}
        className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 ${FOCUS_RING}`}
      >
        {pending ? "Creating link…" : "Circulate for confirmation"}
      </button>
      {error && <p className="mt-1 text-caption text-status-failed-600">{error}</p>}
      {url && (
        <div className="absolute right-0 z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-surface border border-paper-200 bg-white p-3 shadow-float">
          <p className="text-caption font-medium text-paper-800">
            Confirmation &amp; review link
          </p>
          <p className="mt-1 text-[11px] text-paper-500">
            Recipients can read AND formally confirm the minutes from this link.
          </p>
          <p className="mt-2 break-all rounded bg-paper-50 p-2 text-[11px] text-paper-600">
            {url}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex min-h-11 items-center justify-center rounded-surface bg-ink-600 px-2.5 py-1 text-caption font-medium text-white hover:bg-ink-500 sm:min-h-0 ${FOCUS_RING}`}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              className={`rounded-control text-caption text-ink-600 hover:underline ${FOCUS_RING}`}
              href={`mailto:?subject=${encodeURIComponent("Draft minutes for your review")}&body=${encodeURIComponent(`Please review the draft minutes:\n\n${url}\n\nThis link is read-only${expiresAt ? ` and expires on ${formatDate(expiresAt)}` : ""}.`)}`}
            >
              Email it
            </a>
          </div>
          {expiresAt && (
            <p className="mt-2 text-[11px] text-paper-500">
              Expires {formatDate(expiresAt)} · anyone
              with the link can view this version
            </p>
          )}
          <button
            type="button"
            onClick={() => setUrl(null)}
            className={`mt-2 rounded-control text-[11px] text-paper-500 hover:text-paper-600 ${FOCUS_RING}`}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
