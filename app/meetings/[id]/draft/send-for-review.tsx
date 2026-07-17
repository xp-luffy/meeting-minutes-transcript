"use client";

import { useState, useTransition } from "react";
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
        className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating link…" : "Circulate for confirmation"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {url && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-medium text-neutral-800">
            Confirmation &amp; review link
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">
            Recipients can read AND formally confirm the minutes from this link.
          </p>
          <p className="mt-2 break-all rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">
            {url}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              className="text-xs text-indigo-600 hover:underline"
              href={`mailto:?subject=${encodeURIComponent("Draft minutes for your review")}&body=${encodeURIComponent(`Please review the draft minutes:\n\n${url}\n\nThis link is read-only${expiresAt ? ` and expires on ${new Date(expiresAt).toLocaleDateString("en-MY")}` : ""}.`)}`}
            >
              Email it
            </a>
          </div>
          {expiresAt && (
            <p className="mt-2 text-[11px] text-neutral-400">
              Expires {new Date(expiresAt).toLocaleDateString("en-MY")} · anyone
              with the link can view this version
            </p>
          )}
          <button
            type="button"
            onClick={() => setUrl(null)}
            className="mt-2 text-[11px] text-neutral-400 hover:text-neutral-600"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
