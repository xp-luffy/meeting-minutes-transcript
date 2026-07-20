/**
 * Builds the download filename, stripping characters that are illegal in
 * filenames on common filesystems.
 *
 * Non-final exports are prefixed `DRAFT-`. The filename is very often the ONLY
 * thing visible in an email attachment list, a shared-drive listing or a
 * printed cover sheet — the banner inside the document does not help anyone
 * who has not opened it yet, and "Minutes - Nusantara - 2026-03-12.docx"
 * reads as a finished instrument whether or not it is one.
 *
 * VISUAL_SYSTEM_V4 §5.9 rule 4.
 */
export function buildExportFilename(
  companyName: string,
  meetingDate: string,
  ext: "docx" | "pdf",
  /** Draft workflow status. Anything other than `final` gets the prefix. */
  draftStatus?: string | null,
): string {
  const safeCompany = companyName.replace(/[\\/:*?"<>|]/g, "").trim();
  const dateOnly = meetingDate.slice(0, 10);
  // Default to prefixing. If the caller does not tell us the status, we do not
  // know that it is final, and an unmarked draft is the failure mode that
  // matters — an over-marked final is merely annoying.
  const prefix = draftStatus === "final" ? "" : "DRAFT-";
  return `${prefix}Minutes - ${safeCompany} - ${dateOnly}.${ext}`;
}

/** Builds a Content-Disposition header value that's safe for non-ASCII filenames. */
export function contentDispositionHeader(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encoded}`;
}
