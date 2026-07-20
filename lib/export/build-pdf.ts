import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { parseHtmlToBlocks, type Block, type TableBlock, type TextRun } from "./html-parse";
import type { ExportData } from "./types";
import { formatDate } from "@/lib/format";
import { sanitizeForPdf } from "./sanitize";
import { assuranceSummaryLine } from "./assurance-line";
import { columnWidthPercents } from "./table-layout";

const PAGE_MARGIN = 56;
const BODY_SIZE = 11;
const HEADING1_SIZE = 15;
const HEADING2_SIZE = 13;
const TITLE_SIZE = 17;
const SUBTITLE_SIZE = 13;
const LINE_HEIGHT_FACTOR = 1.32;

// Table layout constants (points).
const CELL_PADDING_X = 6;
const CELL_PADDING_Y = 5;
const CELL_PARA_GAP = 3;
const MIN_ROW_HEIGHT = BODY_SIZE * LINE_HEIGHT_FACTOR + CELL_PADDING_Y * 2;
const TABLE_GAP_AFTER = 10;
const TABLE_BORDER_COLOR = rgb(0.55, 0.55, 0.55);
const TABLE_HEADER_FILL = rgb(0.85, 0.85, 0.85);

const OUTCOME_LABEL: Record<string, string> = {
  carried: "Carried",
  deferred: "Deferred",
  lapsed: "Lapsed",
};

interface Word {
  text: string;
  bold: boolean;
}

const BREAK = Symbol("line-break");
type Token = Word | typeof BREAK;

/** One word-wrapped paragraph inside a table cell, ready to draw. */
interface CellParagraph {
  lines: Word[][];
  size: number;
}

/** A fully laid-out table cell: its wrapped paragraphs and total rendered height. */
interface CellLayout {
  paragraphs: CellParagraph[];
  height: number;
}

/** Splits styled text runs into word/break tokens, sanitising each word for WinAnsi. */
function tokenizeRuns(runs: TextRun[]): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    const clean = sanitizeForPdf(run.text);
    const segments = clean.split("\n");
    segments.forEach((segment, i) => {
      if (i > 0) tokens.push(BREAK);
      const words = segment.split(/\s+/).filter((w) => w.length > 0);
      for (const word of words) tokens.push({ text: word, bold: run.bold });
    });
  }
  return tokens;
}

/** Greedily wraps tokens into lines that fit maxWidth at the given font size. */
function wrapTokens(
  tokens: Token[],
  size: number,
  maxWidth: number,
  font: PDFFont,
  boldFont: PDFFont,
): Word[][] {
  const lines: Word[][] = [];
  let current: Word[] = [];
  let currentWidth = 0;
  const spaceWidth = font.widthOfTextAtSize(" ", size);

  const pushLine = () => {
    lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const tok of tokens) {
    if (tok === BREAK) {
      pushLine();
      continue;
    }
    const f = tok.bold ? boldFont : font;
    const w = f.widthOfTextAtSize(tok.text, size);
    const extra = current.length > 0 ? spaceWidth + w : w;
    if (currentWidth + extra > maxWidth && current.length > 0) {
      pushLine();
      currentWidth = w;
      current.push(tok);
    } else {
      currentWidth += extra;
      current.push(tok);
    }
  }
  if (current.length > 0 || lines.length === 0) lines.push(current);
  return lines;
}

class PdfWriter {
  private doc: PDFDocument;
  private font: PDFFont;
  private boldFont: PDFFont;
  private page!: PDFPage;
  private width = 0;
  private height = 0;
  private y = 0;

  private constructor(doc: PDFDocument, font: PDFFont, boldFont: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.boldFont = boldFont;
  }

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await doc.embedFont(StandardFonts.TimesRomanBold);
    const writer = new PdfWriter(doc, font, boldFont);
    writer.addPage();
    return writer;
  }

  private addPage() {
    const [w, h] = PageSizes.A4;
    this.page = this.doc.addPage([w, h]);
    this.width = w;
    this.height = h;
    this.y = h - PAGE_MARGIN;
  }

  private get maxWidth(): number {
    return this.width - PAGE_MARGIN * 2;
  }

  private ensureSpace(lineHeight: number) {
    if (this.y - lineHeight < PAGE_MARGIN) {
      this.addPage();
    }
  }

  /** Draws a centered, single-style line (used for the title block). */
  drawCentered(text: string, size: number, bold: boolean, gapAfter: number) {
    const clean = sanitizeForPdf(text);
    const font = bold ? this.boldFont : this.font;
    const lineHeight = size * LINE_HEIGHT_FACTOR;
    this.ensureSpace(lineHeight);
    const textWidth = font.widthOfTextAtSize(clean, size);
    const x = PAGE_MARGIN + Math.max(0, (this.maxWidth - textWidth) / 2);
    this.page.drawText(clean, { x, y: this.y, size, font, color: rgb(0, 0, 0) });
    this.y -= lineHeight + gapAfter;
  }

  /** Draws mixed bold/plain runs word-wrapped to the page width, at a left indent. */
  drawRuns(runs: TextRun[], size: number, indent = 0, gapAfter = 6) {
    const tokens = tokenizeRuns(runs);
    const lineHeight = size * LINE_HEIGHT_FACTOR;
    const lines = wrapTokens(tokens, size, this.maxWidth - indent, this.font, this.boldFont);
    const spaceWidth = this.font.widthOfTextAtSize(" ", size);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      let x = PAGE_MARGIN + indent;
      for (const word of line) {
        const font = word.bold ? this.boldFont : this.font;
        this.page.drawText(word.text, { x, y: this.y, size, font, color: rgb(0, 0, 0) });
        x += font.widthOfTextAtSize(word.text, size) + spaceWidth;
      }
      this.y -= lineHeight;
    }
    this.y -= gapAfter;
  }

  drawPlain(text: string, size: number, bold = false, indent = 0, gapAfter = 6) {
    this.drawRuns([{ text, bold, italic: false }], size, indent, gapAfter);
  }

  /**
   * A horizontal rule. RULE WEIGHT IS THE PRIMARY SIGNAL on the export surface
   * (VISUAL_SYSTEM_V4 §5.9 rule 1) — assume every export is printed monochrome,
   * where the double rule on an unreviewed draft is the load-bearing difference
   * and the colour is not.
   */
  drawRule(thickness: number, gapAfter: number, double = false, colour = rgb(0, 0, 0)) {
    const gap = 2;
    const needed = thickness + (double ? gap + thickness : 0) + gapAfter;
    this.ensureSpace(needed);
    const draw = (y: number) =>
      this.page.drawRectangle({
        x: PAGE_MARGIN,
        y,
        width: this.maxWidth,
        height: thickness,
        color: colour,
      });
    draw(this.y);
    if (double) draw(this.y - gap - thickness);
    this.y -= needed;
  }

  /**
   * Stamps one line into the top margin of EVERY page. A stapled bundle gets
   * separated; page 4 on its own must still say what it is.
   */
  stampRunningHeader(text: string, colour = rgb(0, 0, 0)) {
    const clean = sanitizeForPdf(text);
    const size = 8;
    for (const page of this.doc.getPages()) {
      const { width, height } = page.getSize();
      const textWidth = this.boldFont.widthOfTextAtSize(clean, size);
      page.drawText(clean, {
        x: Math.max(PAGE_MARGIN, (width - textWidth) / 2),
        y: height - PAGE_MARGIN / 2 - size,
        size,
        font: this.boldFont,
        color: colour,
      });
    }
  }

  /** Word-wraps one cell's blocks (paragraphs) within a column width and measures its total height. */
  private layoutCell(cellBlocks: Block[], colWidth: number, forceBold: boolean): CellLayout {
    const innerWidth = Math.max(10, colWidth - CELL_PADDING_X * 2);
    const paragraphs: CellParagraph[] = cellBlocks.map((cellBlock) => {
      if (cellBlock.type === "table") {
        // Nested tables inside a cell aren't part of the supported shapes;
        // render nothing for them rather than crashing.
        return { lines: [], size: BODY_SIZE };
      }
      const size =
        cellBlock.type === "heading1"
          ? HEADING1_SIZE
          : cellBlock.type === "heading2"
            ? HEADING2_SIZE
            : BODY_SIZE;
      const bold = forceBold || cellBlock.type === "heading1" || cellBlock.type === "heading2";
      const runs: TextRun[] =
        cellBlock.type === "listItem"
          ? [{ text: "- ", bold, italic: false }, ...cellBlock.runs]
          : cellBlock.runs;
      const styledRuns = bold ? runs.map((r) => ({ ...r, bold: true })) : runs;
      const tokens = tokenizeRuns(styledRuns);
      const lines = wrapTokens(tokens, size, innerWidth, this.font, this.boldFont);
      return { lines, size };
    });

    const height =
      CELL_PADDING_Y * 2 +
      paragraphs.reduce(
        (sum, p) => sum + p.lines.length * p.size * LINE_HEIGHT_FACTOR + CELL_PARA_GAP,
        0,
      );

    return { paragraphs, height: Math.max(height, MIN_ROW_HEIGHT) };
  }

  /** Draws one cell's already-wrapped paragraphs, top-aligned within the cell. */
  private drawCellText(x: number, topY: number, cell: CellLayout) {
    const spaceWidth = this.font.widthOfTextAtSize(" ", BODY_SIZE);
    let y = topY - CELL_PADDING_Y;
    for (const para of cell.paragraphs) {
      const lineHeight = para.size * LINE_HEIGHT_FACTOR;
      for (const line of para.lines) {
        let lx = x + CELL_PADDING_X;
        for (const word of line) {
          const font = word.bold ? this.boldFont : this.font;
          this.page.drawText(word.text, { x: lx, y, size: para.size, font, color: rgb(0, 0, 0) });
          lx += font.widthOfTextAtSize(word.text, para.size) + spaceWidth;
        }
        y -= lineHeight;
      }
      y -= CELL_PARA_GAP;
    }
  }

  /**
   * Draws a table block as a simple grid: column widths from the shared
   * ratio rule, word-wrapped cells, row height = tallest cell, thin border
   * rectangles per cell. A row that doesn't fit on the current page starts
   * on the next page; a row taller than a whole page is drawn anyway
   * (clipped by later content) rather than looping forever.
   */
  drawTable(block: TableBlock) {
    const colCount = block.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
    if (colCount === 0) return;
    const widths = columnWidthPercents(colCount).map((pct) => (pct / 100) * this.maxWidth);

    for (const row of block.rows) {
      const cells = row.cells.map((cellBlocks, i) =>
        this.layoutCell(cellBlocks, widths[i] ?? this.maxWidth / colCount, row.header),
      );
      const rowHeight = Math.max(MIN_ROW_HEIGHT, ...cells.map((c) => c.height));
      this.ensureSpace(rowHeight);

      const top = this.y;
      let x = PAGE_MARGIN;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] ?? this.maxWidth / colCount;
        this.page.drawRectangle({
          x,
          y: top - rowHeight,
          width: w,
          height: rowHeight,
          borderWidth: 0.75,
          borderColor: TABLE_BORDER_COLOR,
          color: row.header ? TABLE_HEADER_FILL : undefined,
        });
        const cell = cells[i];
        if (cell) this.drawCellText(x, top, cell);
        x += w;
      }
      this.y = top - rowHeight;
    }
    this.y -= TABLE_GAP_AFTER;
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function drawBlock(writer: PdfWriter, block: Block) {
  switch (block.type) {
    case "table":
      writer.drawTable(block);
      return;
    case "heading1": {
      const text = block.runs.map((r) => r.text).join("");
      writer.drawPlain(text, HEADING1_SIZE, true, 0, 8);
      return;
    }
    case "heading2": {
      const text = block.runs.map((r) => r.text).join("");
      writer.drawPlain(text, HEADING2_SIZE, true, 0, 6);
      return;
    }
    case "listItem": {
      const runs: TextRun[] = [{ text: "-", bold: false, italic: false }, ...block.runs];
      writer.drawRuns(runs, BODY_SIZE, 12, 4);
      return;
    }
    case "para":
    default:
      writer.drawRuns(block.runs, BODY_SIZE, 0, 8);
  }
}

/**
 * Builds a statutory minutes A4 PDF as bytes from already-fetched
 * meeting/draft/resolutions/action-items data. Pure function — no
 * Supabase, no framework imports — so it's directly unit-testable.
 */
export async function buildMinutesPdf(data: ExportData): Promise<Uint8Array> {
  const { meeting, draft, resolutions, actionItems } = data;
  const bodyBlocks = parseHtmlToBlocks(draft.body_html ?? "");

  const writer = await PdfWriter.create();

  // Same reason as the DOCX status block: an exported file carries no app
  // context, so an unreviewed draft must not look like approved minutes once
  // printed. Every state prints a block, INCLUDING final — which previously
  // printed nothing at all, so "no banner" was ambiguous between "approved"
  // and "this export predates the banner".
  const isDraft = draft.status !== "final";
  const statusLabel = isDraft
    ? draft.status === "reviewed"
      ? "DRAFT — REVIEWED, NOT YET FINAL"
      : "DRAFT — NOT REVIEWED OR APPROVED"
    : `FINAL — APPROVED ${formatDate(draft.finalised_at ?? draft.created_at)}`;
  // failed-800 #7A2119 / risk-800 #6B4805 / paper-900 #1C1B18 — all chosen to
  // survive greyscale photocopying.
  const statusColour = isDraft
    ? draft.status === "reviewed"
      ? rgb(0x6b / 255, 0x48 / 255, 0x05 / 255)
      : rgb(0x7a / 255, 0x21 / 255, 0x19 / 255)
    : rgb(0x1c / 255, 0x1b / 255, 0x18 / 255);

  if (draft.status === "draft") {
    writer.drawRule(1.5, 4, true, statusColour);
  } else if (draft.status === "reviewed") {
    writer.drawRule(1, 4, false, statusColour);
  }

  writer.drawCentered(statusLabel, SUBTITLE_SIZE, true, isDraft ? 2 : 4);

  if (draft.status === "draft") {
    writer.drawRule(1.5, 6, true, statusColour);
  } else if (draft.status === "reviewed") {
    writer.drawRule(1, 6, false, statusColour);
  } else {
    writer.drawRule(0.5, 8, false, statusColour);
  }

  // The assurance summary, on EVERY export including final — see build-docx.ts
  // for why. A final document carrying "APPROVED" and no statement of what was
  // checked is the proof living only inside the app, which is the same as no
  // proof to the auditor holding the printout.
  {
    writer.drawCentered(assuranceSummaryLine(data.assurance ?? null), BODY_SIZE - 1, false, 10);
  }

  writer.drawCentered(`MINUTES OF ${meeting.meeting_type.toUpperCase()}`, TITLE_SIZE, true, 6);
  writer.drawCentered(meeting.company_name, SUBTITLE_SIZE, true, 12);

  writer.drawRuns(
    [
      { text: "Date: ", bold: true, italic: false },
      { text: formatDate(meeting.meeting_date), bold: false, italic: false },
    ],
    BODY_SIZE,
    0,
    4,
  );
  writer.drawRuns(
    [
      { text: "Venue: ", bold: true, italic: false },
      { text: meeting.venue ?? "Not specified", bold: false, italic: false },
    ],
    BODY_SIZE,
    0,
    4,
  );
  writer.drawRuns(
    [
      { text: "Chairperson: ", bold: true, italic: false },
      { text: meeting.chairperson ?? "Not specified", bold: false, italic: false },
    ],
    BODY_SIZE,
    0,
    4,
  );

  const attendeeLines = (meeting.attendees ?? [])
    .map((a) => `${a.name}${a.role ? ` (${a.role})` : ""}`)
    .join("; ");
  if (attendeeLines) {
    writer.drawRuns(
      [
        { text: "Attendees: ", bold: true, italic: false },
        { text: attendeeLines, bold: false, italic: false },
      ],
      BODY_SIZE,
      0,
      12,
    );
  }

  for (const block of bodyBlocks) {
    drawBlock(writer, block);
  }

  writer.drawPlain("RESOLUTIONS", HEADING1_SIZE, true, 0, 8);
  if (resolutions.length === 0) {
    writer.drawPlain("No resolutions recorded.", BODY_SIZE, false, 0, 8);
  } else {
    for (const resolution of resolutions) {
      writer.drawRuns(
        [
          { text: `${resolution.resolution_number ?? "-"} `, bold: true, italic: false },
          { text: resolution.resolution_text, bold: false, italic: false },
        ],
        BODY_SIZE,
        0,
        2,
      );
      writer.drawRuns(
        [
          { text: "Outcome: ", bold: true, italic: false },
          {
            text: OUTCOME_LABEL[resolution.outcome] ?? resolution.outcome,
            bold: false,
            italic: false,
          },
        ],
        BODY_SIZE,
        0,
        10,
      );
    }
  }

  writer.drawPlain("ACTION ITEMS", HEADING1_SIZE, true, 0, 8);
  if (actionItems.length === 0) {
    writer.drawPlain("No action items recorded.", BODY_SIZE, false, 0, 8);
  } else {
    for (const item of actionItems) {
      writer.drawPlain(item.description, BODY_SIZE, false, 0, 2);
      writer.drawRuns(
        [
          { text: "Owner: ", bold: true, italic: false },
          { text: item.owner_name ?? "Unassigned", bold: false, italic: false },
          { text: "   Due: ", bold: true, italic: false },
          { text: formatDate(item.due_date), bold: false, italic: false },
          { text: "   Status: ", bold: true, italic: false },
          { text: item.item_status === "done" ? "Done" : "Open", bold: false, italic: false },
        ],
        BODY_SIZE,
        0,
        10,
      );
    }
  }

  // Stamped last, so it lands on every page the body actually produced.
  if (isDraft) {
    writer.stampRunningHeader(statusLabel, statusColour);
  }

  return writer.save();
}
