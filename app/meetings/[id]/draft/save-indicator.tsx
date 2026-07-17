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
    return <span className="text-xs text-neutral-400">Saving…</span>;
  }

  if (status === "error") {
    return (
      <span className="text-xs font-medium text-red-600">
        {errorMessage || "Save failed — your changes were not stored"}
      </span>
    );
  }

  return <span className="text-xs text-emerald-600">Saved</span>;
}
