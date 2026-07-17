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

export interface Block {
  type: BlockType;
  runs: TextRun[];
}

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
 * Converts a fragment of our limited draft HTML into a flat list of blocks,
 * each with a list of styled text runs. Whitespace-only blocks (e.g. stray
 * newlines between tags) are dropped.
 */
export function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;
  let boldDepth = 0;
  let italicDepth = 0;

  const ensureBlock = (): Block => {
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
