import { Marked, Renderer } from "marked";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";
import sanitizeHtml from "sanitize-html";
import { createHash } from "node:crypto";
import { contentUrl } from "./site-path";

// Generate slug from heading text
function slugify(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function createMarkdownParser() {
  const marked = new Marked();
  const headingIds = new Set<string>([
    "reading-progress",
    "giscus-container",
    "toc-drawer",
    "toc-title",
    "toc-close-btn",
    "mobile-toc-btn",
    "scroll-top",
    "mobile-menu-btn",
    "mobile-menu-panel",
    "menu-icon-open",
    "menu-icon-close",
    "dynamic-favicon",
  ]);
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

  // Only an explicitly named grammar is highlighted; large blocks remain plain text.
  renderer.code = ({ text, lang = "" }) => {
    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const language = lang.split(/\s+/)[0].replace(/[^a-zA-Z0-9_-]/g, "");
    if (language === "mermaid")
      return `<pre><code class="language-mermaid">${escape(text)}</code></pre>`;
    const filename = lang.match(
      /(?:^|\s)title=(?:"([^"]{1,120})"|([^\s]{1,120}))/,
    );
    const ranges = (lang.match(/\{([\d,\s-]{1,100})\}/)?.[1] || "")
      .split(",")
      .map((range) => range.trim().split("-").map(Number));
    const html =
      text.length <= 20_000 && language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : escape(text);
    const stack: string[] = [];
    const lines = html
      .split("\n")
      .map((line, index) => {
        const start = stack.join("");
        for (const tag of line.matchAll(/<span\b[^>]*>|<\/span>/g)) {
          if (tag[0] === "</span>") stack.pop();
          else stack.push(tag[0]);
        }
        const active = ranges.some(
          ([from, to = from]) =>
            from > 0 && index + 1 >= from && index + 1 <= to,
        );
        return `<span class="code-line${active ? " code-line-highlight" : ""}">${start}${line}${"</span>".repeat(stack.length)}</span>`;
      })
      .join("\n");
    const block = `<pre><code class="hljs language-${language || "text"}">${lines}\n</code></pre>`;
    return filename
      ? `<figure class="code-block"><figcaption>${escape(filename[1] || filename[2])}</figcaption>${block}</figure>`
      : block;
  };

  // KaTeX math rendering
  marked.use(
    markedKatex({
      throwOnError: false,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
    }),
  );

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
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "input",
      "span",
      "math",
      "semantics",
      "annotation",
      "mrow",
      "mi",
      "mo",
      "mn",
      "ms",
      "mtext",
      "mspace",
      "mfrac",
      "msqrt",
      "mroot",
      "msup",
      "msub",
      "msubsup",
      "mover",
      "munder",
      "munderover",
      "mtable",
      "mtr",
      "mtd",
      "mstyle",
      "mpadded",
      "mphantom",
      "menclose",
      "mglyph",
      "svg",
      "path",
      "line",
    ],
    allowedAttributes: {
      "*": ["class", "id", "aria-hidden"],
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      input: ["type", "checked", "disabled"],
      span: ["class", "style", "aria-hidden"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
      mo: [
        "stretchy",
        "fence",
        "separator",
        "lspace",
        "rspace",
        "minsize",
        "maxsize",
      ],
      mspace: ["width", "height", "depth"],
      mstyle: ["mathvariant", "displaystyle", "scriptlevel"],
      mi: ["mathvariant"],
      mtable: ["rowspacing", "columnalign", "columnspacing"],
      mtd: ["columnalign"],
      mpadded: ["width", "height", "depth", "lspace", "voffset"],
      svg: [
        "xmlns",
        "width",
        "height",
        "viewBox",
        "preserveAspectRatio",
        "style",
      ],
      path: ["d"],
      line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        height: [dimension],
        width: [dimension],
        "min-width": [dimension],
        top: [dimension],
        left: [dimension],
        bottom: [dimension],
        right: [dimension],
        "margin-left": [dimension],
        "margin-right": [dimension],
        "margin-top": [dimension],
        "padding-left": [dimension],
        "padding-right": [dimension],
        "vertical-align": [dimension],
        "border-bottom-width": [dimension],
        "border-top-width": [dimension],
        position: [/^(?:relative|absolute)$/],
        color: [/^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i],
      },
    },
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    transformTags: {
      input: (_tag, attributes) => ({
        tagName: "input",
        attribs: { ...attributes, type: "checkbox", disabled: "" },
      }),
      a: (_tag, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          ...(attributes.href ? { href: contentUrl(attributes.href) } : {}),
        },
      }),
      img: (_tag, attributes) => ({
        tagName: "img",
        attribs: {
          ...attributes,
          ...(attributes.src ? { src: contentUrl(attributes.src) } : {}),
          loading: "lazy",
          decoding: "async",
        },
      }),
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
