import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";

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
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
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
marked.use(markedKatex({ throwOnError: false }));

marked.use({
  renderer,
  gfm: true,
  breaks: false,
});

export { marked };
