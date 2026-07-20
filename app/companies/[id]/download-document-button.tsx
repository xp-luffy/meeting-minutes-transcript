"use client";

import { useState, useTransition } from "react";
import { FOCUS_RING } from "@/components/ui";
import { getDocumentDownloadUrl } from "./documents-actions";

/**
 * Fetches a short-lived SIGNED url for a document and opens it.
 *
 * The bucket is private, so there is no public url to link to — and that is the
 * point: a company's constitution must not be readable by anyone who ever saw
 * a path. The signed url is minted per click, server-side, after ownership is
 * re-verified.
 *
 * Pending and failure states are both surfaced. A download that silently does
 * nothing reads as a broken app (docs/PILOT_PLAYBOOK.md #17, pattern B).
 */
export function DownloadDocumentButton({
  documentId,
  companyId,
  label = "Download",
  title,
}: {
  documentId: string;
  companyId: string;
  label?: string;
  /** Used only for the accessible name — rendered as text, never as HTML. */
  title: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(documentId, companyId);
      if (result.error || !result.url) {
        setError(result.error ?? "Could not prepare the download.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        aria-label={`${label} ${title}`}
        className={`inline-flex min-h-11 items-center justify-center rounded-surface border border-paper-450 bg-white px-2.5 py-1 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${FOCUS_RING}`}
      >
        {isPending ? "Preparing…" : label}
      </button>
      {error ? (
        <span className="text-caption text-status-failed-600" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
