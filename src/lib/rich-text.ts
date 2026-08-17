/**
 * Rich text handling for Flow.
 *
 * Messages are stored twice: `content_html` holds the formatted document that
 * the editor produces, `content` holds a plain-text rendition used for search
 * and any later processing. Both directions run on the server (no DOM), so
 * everything here is string based and deliberately conservative: only the node
 * set the editor can produce survives sanitizing.
 */

const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  del: [],
  h1: [],
  h2: [],
  h3: [],
  ul: ["data-type"],
  ol: ["start"],
  li: ["data-checked"],
  blockquote: [],
  pre: [],
  code: [],
  a: ["href", "target", "rel"],
  label: [],
  div: [],
  span: [],
  input: ["type", "checked", "disabled"],
};

const VOID_TAGS = new Set(["br", "input"]);
const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "li", "blockquote", "pre", "div"]);

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // javascript:, data:, ...
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return `https://${trimmed}`;
}

function escapeText(value: string): string {
  return value.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, "&amp;").replace(/</g, "&lt;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function parseAttributes(raw: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  const pattern = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    attrs.push([match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]);
  }
  return attrs;
}

/** Strips everything Flow's editor cannot produce, keeping inner text. */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // Drop entire dangerous subtrees before tag-level filtering.
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|svg|math)\b[^>]*>/gi, "");

  const open: string[] = [];
  let out = "";
  let index = 0;

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(stripped))) {
    out += escapeText(stripped.slice(index, match.index));
    index = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    const allowedAttrs = ALLOWED[tag];
    if (!allowedAttrs) continue; // unknown tag: keep its text, drop the tag

    if (closing) {
      const position = open.lastIndexOf(tag);
      if (position === -1) continue;
      // Close anything left open inside it, keeping the markup balanced.
      for (let i = open.length - 1; i >= position; i--) out += `</${open[i]}>`;
      open.length = position;
      continue;
    }

    let attrText = "";
    for (const [name, value] of parseAttributes(match[2] ?? "")) {
      if (!allowedAttrs.includes(name)) continue;
      if (name === "href") {
        const href = safeHref(value);
        if (!href) continue;
        attrText += ` href="${escapeAttr(href)}"`;
        continue;
      }
      attrText += value ? ` ${name}="${escapeAttr(value)}"` : ` ${name}`;
    }

    if (VOID_TAGS.has(tag)) {
      out += `<${tag}${attrText} />`;
      continue;
    }

    if (tag === "a") attrText += ' target="_blank" rel="noopener noreferrer nofollow"';
    out += `<${tag}${attrText}>`;
    open.push(tag);
  }

  out += escapeText(stripped.slice(index));
  for (let i = open.length - 1; i >= 0; i--) out += `</${open[i]}>`;
  return out.trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const key = code.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return whole;
  });
}

/** Plain-text rendition used for search and future processing. */
export function htmlToText(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(new RegExp(`</(${[...BLOCK_TAGS].join("|")})\\s*>`, "gi"), "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Wraps plain text as a minimal document (used for legacy rows). */
export function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split("\n").join("<br />")}</p>`)
    .join("");
}

export function isEmptyDocument(html: string): boolean {
  return htmlToText(html).replace(/[•\s]/g, "").length === 0;
}
