/**
 * Sentinel value for the "— New company —" option on /meetings/new.
 *
 * MUST live in a shared (non-"use client") module: when a server action
 * imports a value from a "use client" file, Next.js swaps the export for a
 * client-reference proxy rather than the literal — so `id === SENTINEL`
 * silently evaluated false on the server and every new-company submission
 * took the existing-company branch and failed with "company could not be found".
 */
export const NEW_COMPANY_VALUE = "__new__";

export const MEETING_TYPES = [
  "Board Meeting",
  "Annual General Meeting",
  "Extraordinary General Meeting",
  "Audit Committee Meeting",
  "Other Committee",
] as const;
