const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Formats an ISO date (or date-only) string in en-MY style, e.g. "15 May 2025".
 * Returns a dash for null/undefined/unparseable input.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/** Formats a confidence value (0-1) as a whole-number percentage, e.g. "91%". */
export function formatConfidencePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
