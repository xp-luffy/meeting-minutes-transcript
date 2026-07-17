/**
 * Tiny parser for the limited HTML our minutes drafts contain (the output of
 * the generation engine plus manual contentEditable edits): h2, h3, p,
 * ul/li, strong/b, i/em, br, div. No external HTML parsing dependency
 * (no jsdom/cheerio) — a small regex/state tokenizer.
 *
 * Unknown tags are stripped but their text content is preserved. HTML
 * entities are decoded. Framework-free so it can be unit-tested directly.
 */

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type BlockType = "heading1" | "heading2" | "para" | "listItem";

export interface TextBlock {
  type: BlockType;
  runs: TextRun[];
}

/** One row of a table block. `header` marks rows built from <th> cells. */
export interface TableRowBlock {
  header: boolean;
  cells: Block[][];
}

export interface TableBlock {
  type: "table";
  rows: TableRowBlock[];
}

/** A parsed document node: either a styled-text block or a table. */
export type Block = TextBlock | TableBlock;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the small set of HTML entities our drafts use (&amp; &lt; &gt; &quot; &#39; &nbsp; and numeric refs). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ent: string) => {
    if (ent[0] === "#") {
      const isHex = ent[1] === "x" || ent[1] === "X";
      const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const key = ent.toLowerCase();
    return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
  });
}

const BLOCK_TAGS: Record<string, BlockType> = {
  h2: "heading1",
  h3: "heading2",
  p: "para",
  div: "para",
  li: "listItem",
};

const BOLD_TAGS = new Set(["strong", "b"]);
const ITALIC_TAGS = new Set(["i", "em"]);
const IGNORED_CONTAINER_TAGS = new Set(["ul", "ol"]);

/**
 * Converts a fragment of our limited draft HTML into a flat list of blocks
 * (text blocks and tables), in document order. Whitespace-only text blocks
 * (e.g. stray newlines between tags) are dropped.
 *
 * Tables are located first (as top-level, non-nested <table>...</table>
 * spans) and parsed separately; everything else is routed through the
 * original flow tokenizer unchanged, so non-table inputs parse
 * byte-for-byte identically to before tables were supported.
 */
export function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const tableRe = /<table\b[^>]*>[\s\S]*?<\/table\s*>/gi;
  let lastIndex = 0;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const before = html.slice(lastIndex, tableMatch.index);
    if (before) blocks.push(...parseFlowToBlocks(before));
    blocks.push(parseTableBlock(tableMatch[0]));
    lastIndex = tableRe.lastIndex;
  }
  const rest = html.slice(lastIndex);
  if (rest) blocks.push(...parseFlowToBlocks(rest));
  return blocks;
}

/** Parses a <table>...</table> fragment into rows of cells, each cell a nested Block[]. */
function parseTableBlock(tableHtml: string): TableBlock {
  const rows: TableRowBlock[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
    const rowInner = rowMatch[1];
    const cells: Block[][] = [];
    let header = false;
    const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowInner)) !== null) {
      if (cellMatch[1].toLowerCase() === "th") header = true;
      cells.push(parseFlowToBlocks(cellMatch[2]));
    }
    rows.push({ header, cells });
  }
  return { type: "table", rows };
}

/**
 * The original block/run tokenizer, operating on a fragment of HTML that is
 * known not to contain a top-level <table>. Used both for the top-level
 * document flow and recursively for the contents of each table cell.
 */
function parseFlowToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let currentBlock: TextBlock | null = null;
  let boldDepth = 0;
  let italicDepth = 0;

  const ensureBlock = (): TextBlock => {
    if (!currentBlock) {
      currentBlock = { type: "para", runs: [] };
    }
    return currentBlock;
  };

  const pushText = (raw: string) => {
    const text = decodeEntities(raw);
    if (text.length === 0) return;
    const block = ensureBlock();
    const bold = boldDepth > 0;
    const italic = italicDepth > 0;
    const last = block.runs[block.runs.length - 1];
    if (last && last.bold === bold && last.italic === italic) {
      last.text += text;
    } else {
      block.runs.push({ text, bold, italic });
    }
  };

  const finalizeBlock = () => {
    if (currentBlock && currentBlock.runs.some((r) => r.text.trim().length > 0)) {
      blocks.push(currentBlock);
    }
    currentBlock = null;
  };

  const tokenRe = /<[^>]*>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html)) !== null) {
    const token = match[0];
    if (token[0] !== "<") {
      pushText(token);
      continue;
    }

    const tagMatch = /^<\/?([a-zA-Z0-9]+)/.exec(token);
    if (!tagMatch) continue; // e.g. comments, doctype

    const tagName = tagMatch[1].toLowerCase();
    const isClosing = token[1] === "/";

    if (tagName === "br") {
      pushText("\n");
      continue;
    }

    if (tagName in BLOCK_TAGS) {
      // Opening OR closing a block tag both flush whatever came before;
      // opening also starts a fresh block of the matching type.
      finalizeBlock();
      if (!isClosing) {
        currentBlock = { type: BLOCK_TAGS[tagName], runs: [] };
      }
      continue;
    }

    if (BOLD_TAGS.has(tagName)) {
      boldDepth = Math.max(0, boldDepth + (isClosing ? -1 : 1));
      continue;
    }

    if (ITALIC_TAGS.has(tagName)) {
      italicDepth = Math.max(0, italicDepth + (isClosing ? -1 : 1));
      continue;
    }

    if (IGNORED_CONTAINER_TAGS.has(tagName)) {
      continue; // container only — its li children carry their own blocks
    }

    // Unknown tag (e.g. span from a paste): strip the tag, keep its text —
    // nothing to do here since we simply don't emit anything for the tag.
  }

  finalizeBlock();
  return blocks;
}
