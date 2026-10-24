import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";
import sanitizeHtml from "sanitize-html";

// Generate slug from heading text
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

// Custom renderer to add IDs to headings (for TOC)
const renderer = new marked.Renderer();
renderer.heading = ({ tokens, depth }) => {
  const text = tokens.map((t) => ("text" in t ? t.text : t.raw)).join("");
  const id = slugify(text);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<h${depth} id="${id}">${escaped}</h${depth}>\n`;
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
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
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

const dimension = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|pt|%|rem)?$/;

/** Sanitize the complete generated document, including Markdown links and images. */
export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false });
  return sanitizeHtml(html, {
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
}
