/**
 * Sanitises text for rendering with pdf-lib's StandardFonts, which use
 * WinAnsi encoding and cannot encode arbitrary Unicode (e.g. some
 * typographic punctuation, or non-Latin scripts). Common typographic
 * characters are mapped to ASCII equivalents; anything else outside the
 * WinAnsi-safe range is stripped rather than left to throw at draw time.
 */

const TYPOGRAPHIC_REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"], // ' ' ‚ ‛
  [/[“”„‟]/g, '"'], // " " „ ‟
  [/[‒–]/g, "-"], // ‒ –
  [/—/g, "--"], // —
  [/…/g, "..."], // …
  [/ /g, " "], // &nbsp;
  [/[•‣]/g, "-"], // • ‣
];

/** Replaces typographic punctuation with ASCII, then strips anything else WinAnsi can't render. */
export function sanitizeForPdf(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Keep printable ASCII, Latin-1 supplement (covers accented Latin chars
  // like é, ñ — WinAnsi matches Unicode in this range), and newlines.
  // Strip everything else (emoji, CJK, exotic symbols) rather than throw.
  out = out.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
  return out;
}
