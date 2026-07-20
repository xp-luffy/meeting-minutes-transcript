"use client";

import { useState } from "react";
import { FOCUS_RING } from "@/components/ui";

type ExportKind = "docx" | "pdf";

const LABELS: Record<ExportKind, string> = {
  docx: "Export DOCX",
  pdf: "Export PDF",
};

const DEFAULT_FILENAMES: Record<ExportKind, string> = {
  docx: "Minutes.docx",
  pdf: "Minutes.pdf",
};

/** Pulls the filename out of a `Content-Disposition: attachment; filename="..."` header, if present. */
function filenameFromContentDisposition(header: string | null, kind: ExportKind): string {
  if (!header) return DEFAULT_FILENAMES[kind];
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through to the plain filename match below
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  if (plainMatch) return plainMatch[1];
  return DEFAULT_FILENAMES[kind];
}

/**
 * Two secondary buttons that download the current draft as DOCX / PDF via
 * `/api/export/{docx,pdf}?meetingId=...`. When `disabled` (e.g. the draft is
 * empty) the buttons render disabled with a tooltip explaining why.
 *
 * Fetches the export so a non-2xx response (e.g. a cold-start 503) surfaces
 * an inline error instead of silently failing a hidden-link navigation.
 */
export function ExportButtons({
  meetingId,
  draftId,
  disabled,
}: {
  meetingId: string;
  draftId: string;
  disabled: boolean;
}) {
  const [preparing, setPreparing] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(kind: ExportKind) {
    if (disabled || preparing) return;
    setPreparing(kind);
    setError(null);
    try {
      const url = `/api/export/${kind}?meetingId=${encodeURIComponent(meetingId)}`;
      const response = await fetch(url);
      if (!response.ok) {
        setError("Export failed — please try again.");
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get("Content-Disposition"),
        kind,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Export failed — please try again.");
    } finally {
      setPreparing(null);
    }
  }

  return (
    <div className="flex flex-col gap-1" data-draft-id={draftId}>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LABELS) as ExportKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={disabled || preparing !== null}
            title={disabled ? "Draft is empty" : undefined}
            onClick={() => handleExport(kind)}
            className={`inline-flex min-h-11 items-center rounded-surface border border-paper-450 bg-white px-3 py-1.5 text-caption font-medium text-paper-700 hover:bg-paper-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white sm:min-h-0 ${FOCUS_RING}`}
          >
            {preparing === kind ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-paper-300 border-t-paper-500"
                />
                Preparing…
              </span>
            ) : (
              LABELS[kind]
            )}
          </button>
        ))}
      </div>
      {error ? <p className="text-caption font-medium text-status-failed-600">{error}</p> : null}
    </div>
  );
}
