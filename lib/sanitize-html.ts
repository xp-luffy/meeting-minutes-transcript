/**
 * Dependency-free, strict-allowlist HTML sanitiser for our minutes body_html.
 *
 * The minutes body grammar is deliberately LIMITED and attribute-free: the only
 * tags the generator/editor ever emit are the structural/formatting tags listed
 * in {@link ALLOWED_TAGS}, and none of them carry attributes. That lets us apply
 * a very aggressive policy that is immune to the classic regex-sanitiser bypasses
 * (`<img src=x onerror=...>`, `<a href="javascript:...">`, `<iframe srcdoc>`,
 * `<svg><script>`, on*= with newline/tab tricks, etc.):
 *
 *   (a) DANGEROUS tags (script, style, iframe, ...) are dropped ENTIRELY —
 *       both the tag markup AND their inner content.
 *   (b) Any other tag NOT in the allowlist has its markup removed but its text
 *       content KEPT (e.g. `<a href=...>x</a>` -> `x`).
 *   (c) Allowlisted tags are re-emitted with ZERO attributes. Because our real
 *       content uses no attributes this is lossless, and it strips every
 *       on*=/href/src/style vector regardless of how it was obfuscated.
 *
 * Text and HTML entities are left intact.
 *
 * There is no DOM server-side, so we tokenise with a small scanner that respects
 * quoted attribute values (so a stray `>` inside an attribute can't smuggle
 * markup past us).
 */

/** Tags we KEEP (re-emitted with no attributes). */
const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
]);

/**
 * Tags dropped ENTIRELY (markup + inner content). These either execute script,
 * embed foreign content, or can carry active payloads. Split into "container"
 * drops (have a closing tag whose content we must skip) and "void" drops (no
 * closing tag — drop the single tag only, never enter skip mode, so we don't
 * over-consume the rest of the document).
 */
const DROP_CONTAINER_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "svg",
  "math",
  "form",
  "textarea",
  "noscript",
  "template",
]);

const DROP_VOID_TAGS = new Set(["link", "meta", "base", "input", "embed"]);

interface TextToken {
  type: "text";
  value: string;
}
interface TagToken {
  type: "tag";
  raw: string;
}
type Token = TextToken | TagToken;

/**
 * Splits the input into text runs and tag runs. A tag run starts at `<` and ends
 * at the matching `>`, skipping over any `>` that appears inside a quoted
 * attribute value. HTML comments (`<!-- ... -->`) are consumed and discarded.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      tokens.push({ type: "text", value: html.slice(i) });
      break;
    }
    if (lt > i) {
      tokens.push({ type: "text", value: html.slice(i, lt) });
    }

    // Comment: drop entirely.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }

    // Find the closing `>` for this tag, respecting quoted attribute values.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < n) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }

    if (j >= n) {
      // Unterminated `<...` with no closing `>`: drop the remainder. It is
      // never valid content and could be a truncated injection.
      break;
    }

    tokens.push({ type: "tag", raw: html.slice(lt, j + 1) });
    i = j + 1;
  }

  return tokens;
}

interface ParsedTag {
  name: string | null;
  closing: boolean;
  selfClosing: boolean;
}

/** Extracts the tag name, and whether it is a closing / self-closing tag. */
function parseTag(raw: string): ParsedTag {
  // Strip the surrounding `<` and `>`.
  const inner = raw.slice(1, raw.length - 1);
  let body = inner.trim();
  let closing = false;
  if (body.startsWith("/")) {
    closing = true;
    body = body.slice(1).trim();
  }
  const selfClosing = inner.trimEnd().endsWith("/");
  const match = body.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const name = match ? match[1].toLowerCase() : null;
  return { name, closing, selfClosing };
}

/**
 * Sanitises a minutes `body_html` string against the strict allowlist above.
 * Safe to run on both persist (server action) and render (defence in depth).
 */
export function sanitizeMinutesHtml(html: string): string {
  if (!html) return "";

  const tokens = tokenize(html);
  let out = "";

  // When inside a dropped container tag, we skip all tokens until the matching
  // close, tracking nesting depth of same-named opens.
  let dropName: string | null = null;
  let dropDepth = 0;

  for (const token of tokens) {
    if (dropName) {
      if (token.type === "tag") {
        const { name, closing, selfClosing } = parseTag(token.raw);
        if (name === dropName && !selfClosing) {
          if (closing) {
            dropDepth--;
            if (dropDepth === 0) dropName = null;
          } else {
            dropDepth++;
          }
        }
      }
      continue; // Drop everything (text + tags) until the container closes.
    }

    if (token.type === "text") {
      out += token.value;
      continue;
    }

    const { name, closing, selfClosing } = parseTag(token.raw);
    if (!name) {
      continue; // Doctype / bang / junk markup: drop markup, keep nothing.
    }

    if (DROP_VOID_TAGS.has(name)) {
      continue; // Drop the single void tag; no content to skip.
    }

    if (DROP_CONTAINER_TAGS.has(name)) {
      if (!closing && !selfClosing) {
        dropName = name;
        dropDepth = 1;
      }
      // Self-closing or stray-closing drop tags: just drop the markup.
      continue;
    }

    if (ALLOWED_TAGS.has(name)) {
      // Re-emit with ZERO attributes. Self-closing non-void tags emit as an
      // opening tag (matching browser parsing); the only real void tag in our
      // grammar is <br>.
      out += closing ? `</${name}>` : `<${name}>`;
      continue;
    }

    // Any other tag: strip the markup but keep surrounding text content.
  }

  return out;
}
