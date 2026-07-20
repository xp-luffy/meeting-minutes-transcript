import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ITableCellBorders,
} from "docx";
import { parseHtmlToBlocks, type Block, type TableBlock, type TextBlock } from "./html-parse";
import { assuranceSummaryLine } from "./assurance-line";
import type { ExportData } from "./types";
import { formatDate } from "@/lib/format";
import { columnWidthPercents } from "./table-layout";

const OUTCOME_LABEL: Record<string, string> = {
  carried: "Carried",
  deferred: "Deferred",
  lapsed: "Lapsed",
};

/** Splits a run's text on literal "\n" (our <br> marker) into separate docx TextRuns joined by line breaks. */
function runToTextRuns(text: string, bold: boolean, italic: boolean): TextRun[] {
  const parts = text.split("\n");
  return parts.map(
    (part, index) =>
      new TextRun({
        text: part,
        bold,
        italics: italic,
        break: index > 0 ? 1 : undefined,
      }),
  );
}

function blockToParagraph(block: TextBlock, forceBold = false): Paragraph {
  const children = block.runs.flatMap((run) =>
    runToTextRuns(run.text, run.bold || forceBold, run.italic),
  );

  switch (block.type) {
    case "heading1":
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children,
      });
    case "heading2":
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
        children,
      });
    case "listItem":
      return new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 80 },
        children,
      });
    case "para":
    default:
      return new Paragraph({
        spacing: { after: 120 },
        children,
      });
  }
}

/** Converts a block to the docx node it renders as (Paragraph, or a nested Table). */
function blockToNode(block: Block, forceBold = false): Paragraph | Table {
  return block.type === "table" ? tableBlockToTable(block) : blockToParagraph(block, forceBold);
}

const CELL_BORDER: ITableCellBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
};

const CELL_MARGINS = { top: 80, bottom: 80, left: 80, right: 80 };
const HEADER_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };

/** Renders a parsed table block as a real docx Table with sized columns and bordered, margined cells. */
function tableBlockToTable(block: TableBlock): Table {
  const colCount = block.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const widths = columnWidthPercents(colCount);

  const rows = block.rows.map((row) => {
    const cells = row.cells.map((cellBlocks, colIndex) => {
      const nodes =
        cellBlocks.length > 0
          ? cellBlocks.map((b) => blockToNode(b, row.header))
          : [new Paragraph({ children: [] })];
      return new TableCell({
        width: { size: widths[colIndex] ?? 100 / colCount, type: WidthType.PERCENTAGE },
        margins: CELL_MARGINS,
        borders: CELL_BORDER,
        shading: row.header ? HEADER_SHADING : undefined,
        children: nodes,
      });
    });
    return new TableRow({ children: cells });
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Builds a statutory minutes Word document (.docx) as a Buffer from
 * already-fetched meeting/draft/resolutions/action-items data. Pure
 * function — no Supabase, no framework imports — so it's directly
 * unit-testable.
 */
export async function buildMinutesDocx(data: ExportData): Promise<Buffer> {
  const { meeting, draft, resolutions, actionItems } = data;

  const bodyBlocks = parseHtmlToBlocks(draft.body_html ?? "");

  const attendeeLines = (meeting.attendees ?? [])
    .map((a) => `${a.name}${a.role ? ` (${a.role})` : ""}`)
    .join("; ");

  const children: (Paragraph | Table)[] = [];

  // Status block. An exported file leaves the app and gets emailed, printed
  // and filed with nothing to say whether anyone approved it — an unreviewed
  // first pass looked identical to signed-off minutes.
  //
  // ASSUME EVERY EXPORT IS PRINTED MONOCHROME. Rule weight, not colour, is the
  // primary signal: `draft` gets a DOUBLE rule above and below, `reviewed` a
  // single rule, `final` a thin rule below only. The colours below are the
  // -800 steps (#7A2119 / #6B4805), which hold up in greyscale — the previous
  // B45309 was a mid-amber that photocopies to near-invisible.
  const isDraft = draft.status !== "final";
  const statusLabel = isDraft
    ? draft.status === "reviewed"
      ? "DRAFT — REVIEWED, NOT YET FINAL"
      : "DRAFT — NOT REVIEWED OR APPROVED"
    : `FINAL — APPROVED ${formatDate(draft.finalised_at ?? draft.created_at)}`;
  const statusColor = isDraft
    ? draft.status === "reviewed"
      ? "6B4805" // risk-800
      : "7A2119" // failed-800
    : "1C1B18"; // paper-900

  const statusRule =
    draft.status === "final"
      ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: "1C1B18", space: 4 } }
      : draft.status === "reviewed"
        ? {
            top: { style: BorderStyle.SINGLE, size: 8, color: statusColor, space: 4 },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: statusColor, space: 4 },
          }
        : {
            top: { style: BorderStyle.DOUBLE, size: 12, color: statusColor, space: 4 },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: statusColor, space: 4 },
          };

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: isDraft ? 60 : 160 },
      border: statusRule,
      children: [new TextRun({ text: statusLabel, bold: true, size: 22, color: statusColor })],
    }),
  );

  // The assurance summary, on EVERY export including final.
  //
  // It used to be draft-only. That is backwards: the final document is the one
  // that leaves the app, gets filed, and is read by an auditor three years
  // later, and it carried "FINAL — APPROVED" with no statement of what had
  // actually been checked. A draft finalised through the acknowledge-the-risk
  // path exported with no trace of the gaps that were accepted.
  //
  // "Nothing legally required is missing, and here is the proof" is not
  // satisfied by proof that only exists inside the app.
  {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: assuranceSummaryLine(data.assurance ?? null),
            bold: false,
            size: 18,
            color: "45443E",
          }),
        ],
      }),
    );
  }

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `MINUTES OF ${meeting.meeting_type.toUpperCase()}`,
          bold: true,
          size: 32,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: meeting.company_name, bold: true, size: 26 })],
    }),
  );

  // Date / venue / chairperson block
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: formatDate(meeting.meeting_date) }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Venue: ", bold: true }),
        new TextRun({ text: meeting.venue ?? "Not specified" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Chairperson: ", bold: true }),
        new TextRun({ text: meeting.chairperson ?? "Not specified" }),
      ],
    }),
  );

  if (attendeeLines) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: "Attendees: ", bold: true }),
          new TextRun({ text: attendeeLines }),
        ],
      }),
    );
  }

  // Body blocks
  for (const block of bodyBlocks) {
    children.push(blockToNode(block));
  }

  // Resolutions section
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
      children: [new TextRun({ text: "RESOLUTIONS", bold: true })],
    }),
  );

  if (resolutions.length === 0) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "No resolutions recorded.", italics: true })],
      }),
    );
  } else {
    for (const resolution of resolutions) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${resolution.resolution_number ?? "—"} `, bold: true }),
            new TextRun({ text: resolution.resolution_text }),
          ],
        }),
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({ text: "Outcome: ", bold: true }),
            new TextRun({ text: OUTCOME_LABEL[resolution.outcome] ?? resolution.outcome }),
          ],
        }),
      );
    }
  }

  // Action items section
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
      children: [new TextRun({ text: "ACTION ITEMS", bold: true })],
    }),
  );

  if (actionItems.length === 0) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "No action items recorded.", italics: true })],
      }),
    );
  } else {
    for (const item of actionItems) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: item.description })],
        }),
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({ text: "Owner: ", bold: true }),
            new TextRun({ text: item.owner_name ?? "Unassigned" }),
            new TextRun({ text: "   Due: ", bold: true }),
            new TextRun({ text: formatDate(item.due_date) }),
            new TextRun({ text: "   Status: ", bold: true }),
            new TextRun({ text: item.item_status === "done" ? "Done" : "Open" }),
          ],
        }),
      );
    }
  }

  // The word DRAFT appears on EVERY page, not only page one: a stapled bundle
  // gets separated, and page 4 on its own must still say what it is.
  const doc = new Document({
    sections: [
      {
        headers: isDraft
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: statusLabel, bold: true, size: 16, color: statusColor }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
