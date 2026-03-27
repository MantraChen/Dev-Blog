import { marked } from "marked";

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

marked.use({
  renderer,
  gfm: true,
  breaks: false,
});

export { marked };
