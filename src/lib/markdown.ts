import { Marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";
import sanitizeHtml from "sanitize-html";
import { createHash } from "node:crypto";

// Generate slug from heading text
function slugify(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function createMarkdownParser() {
  const marked = new Marked();
  const headingIds = new Set<string>(["reading-progress", "giscus-container", "toc-drawer", "toc-title",
    "toc-close-btn", "mobile-toc-btn", "scroll-top", "mobile-menu-btn", "mobile-menu-panel",
    "menu-icon-open", "menu-icon-close", "dynamic-favicon"]);
  // Custom renderer to add IDs to headings (for TOC)
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = tokens.map((t) => ("text" in t ? t.text : t.raw)).join("");
    const base = slugify(text);
    let id = base;
    for (let suffix = 1; headingIds.has(id); suffix++) id = `${base}-${suffix}`;
    headingIds.add(id);
    return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
};

// Sanitize raw HTML blocks — prevent XSS via markdown injection
renderer.html = ({ text }) => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Code syntax highlighting
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (code.length <= 20_000 && lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      // Guessing among every grammar blocks the SSR event loop for long code blocks.
      // marked escapes unchanged code before inserting it into HTML.
      return code;
    },
  }),
);

// KaTeX math rendering
marked.use(markedKatex({ throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20 }));

marked.use({
  renderer,
  gfm: true,
  breaks: false,
});
return marked;
}

const dimension = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|pt|%|rem)?$/;
const cache = new Map<string, { html: string; bytes: number }>();
const maxCacheBytes = 8 * 1024 * 1024;
let cacheBytes = 0;

/** Sanitize the complete generated document, including Markdown links and images. */
export function renderMarkdown(content: string): string {
  const key = createHash("sha256").update(content).digest("hex");
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.html;
  }
  const html = createMarkdownParser().parse(content, { async: false });
  const sanitized = sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "input", "span",
      "math", "semantics", "annotation", "mrow", "mi", "mo", "mn", "ms", "mtext", "mspace",
      "mfrac", "msqrt", "mroot", "msup", "msub", "msubsup", "mover", "munder", "munderover",
      "mtable", "mtr", "mtd", "mstyle", "mpadded", "mphantom", "menclose", "mglyph",
      "svg", "path", "line"],
    allowedAttributes: {
      "*": ["class", "id", "aria-hidden"],
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      input: ["type", "checked", "disabled"],
      span: ["class", "style", "aria-hidden"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
      mo: ["stretchy", "fence", "separator", "lspace", "rspace", "minsize", "maxsize"],
      mspace: ["width", "height", "depth"],
      mstyle: ["mathvariant", "displaystyle", "scriptlevel"],
      mi: ["mathvariant"],
      mtable: ["rowspacing", "columnalign", "columnspacing"],
      mtd: ["columnalign"],
      mpadded: ["width", "height", "depth", "lspace", "voffset"],
      svg: ["xmlns", "width", "height", "viewBox", "preserveAspectRatio", "style"],
      path: ["d"],
      line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    allowedStyles: { "*": {
      height: [dimension], width: [dimension], "min-width": [dimension],
      top: [dimension], left: [dimension], bottom: [dimension], right: [dimension],
      "margin-left": [dimension], "margin-right": [dimension], "margin-top": [dimension],
      "padding-left": [dimension], "padding-right": [dimension], "vertical-align": [dimension],
      "border-bottom-width": [dimension], "border-top-width": [dimension],
      position: [/^(?:relative|absolute)$/],
      color: [/^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i],
    } },
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: {
      input: (_tag, attributes) => ({ tagName: "input", attribs: { ...attributes, type: "checkbox", disabled: "" } }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy", decoding: "async" }),
    },
  });
  const bytes = Buffer.byteLength(sanitized, "utf8");
  if (bytes <= maxCacheBytes) {
    while (cache.size >= 32 || cacheBytes + bytes > maxCacheBytes) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= cache.get(oldest)!.bytes;
      cache.delete(oldest);
    }
    cache.set(key, { html: sanitized, bytes });
    cacheBytes += bytes;
  }
  return sanitized;
}
