/**
 * Shared column-sizing rule for table blocks, used by both the DOCX and PDF
 * builders so their layouts stay in sync.
 *
 * - 2-column tables (e.g. the Meeting/Date/Time/Venue header): first column
 *   ~22% (labels), second column takes the remainder (~78%).
 * - 3-column tables (Attendees; the agenda table's Item/Discussion/Dept.):
 *   first column ~8%, last column ~12%, middle column takes the remainder
 *   (~80%) — sized for the agenda layout where the discussion cell needs
 *   the most room.
 * - Any other column count: equal widths.
 *
 * Returns percentages that sum to 100.
 */
export function columnWidthPercents(colCount: number): number[] {
  if (colCount <= 0) return [];
  if (colCount === 2) return [22, 78];
  if (colCount === 3) return [8, 80, 12];
  const each = 100 / colCount;
  return Array.from({ length: colCount }, () => each);
}
