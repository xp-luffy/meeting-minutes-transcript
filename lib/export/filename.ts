/**
 * Builds the download filename `Minutes - <company> - <yyyy-mm-dd>.<ext>`,
 * stripping characters that are illegal in filenames on common filesystems.
 */
export function buildExportFilename(
  companyName: string,
  meetingDate: string,
  ext: "docx" | "pdf",
): string {
  const safeCompany = companyName.replace(/[\\/:*?"<>|]/g, "").trim();
  const dateOnly = meetingDate.slice(0, 10);
  return `Minutes - ${safeCompany} - ${dateOnly}.${ext}`;
}

/** Builds a Content-Disposition header value that's safe for non-ASCII filenames. */
export function contentDispositionHeader(filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encoded}`;
}
