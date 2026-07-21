"use client";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Subtle inline save-state indicator shared by the body editor, resolution
 * cards, and action item rows. Renders nothing when idle.
 */
export function SaveIndicator({
  status,
  errorMessage,
}: {
  status: SaveStatus;
  errorMessage?: string | null;
}) {
  if (status === "idle") return null;

  if (status === "saving") {
    return <span className="text-caption text-paper-600">Saving…</span>;
  }

  if (status === "error") {
    return (
      <span className="text-caption font-medium text-status-failed-600">
        {errorMessage || "Save failed — your changes were not stored"}
      </span>
    );
  }

  return <span className="text-caption text-status-verified-600">Saved</span>;
}
