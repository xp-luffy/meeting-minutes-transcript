"use client";

import { useState } from "react";

type ExportKind = "docx" | "pdf";

const LABELS: Record<ExportKind, string> = {
  docx: "Export DOCX",
  pdf: "Export PDF",
};

const PREPARE_DELAY_MS = 2000;

/**
 * Two secondary buttons that download the current draft as DOCX / PDF via
 * `/api/export/{docx,pdf}?meetingId=...`. When `disabled` (e.g. the draft is
 * empty) the buttons render disabled with a tooltip explaining why.
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

  function handleExport(kind: ExportKind) {
    if (disabled || preparing) return;
    setPreparing(kind);
    window.setTimeout(() => {
      const url = `/api/export/${kind}?meetingId=${encodeURIComponent(meetingId)}`;
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setPreparing(null);
    }, PREPARE_DELAY_MS);
  }

  return (
    <div className="flex items-center gap-2" data-draft-id={draftId}>
      {(Object.keys(LABELS) as ExportKind[]).map((kind) => (
        <button
          key={kind}
          type="button"
          disabled={disabled || preparing !== null}
          title={disabled ? "Draft is empty" : undefined}
          onClick={() => handleExport(kind)}
          className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          {preparing === kind ? "Preparing…" : LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
