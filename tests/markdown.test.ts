import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/lib/markdown";
import { slugifyPostTitle } from "../src/lib/post-slug";

test("article headings cannot shadow page controls", () => {
  const html = renderMarkdown("## toc-drawer\n\n## giscus-container\n\n## toc-drawer-1");
  assert.doesNotMatch(html, /id="(?:toc-drawer|giscus-container)"/);
  assert.match(html, /id="toc-drawer-1"/);
  assert.match(html, /id="toc-drawer-1-1"/);
});

test("unknown languages and oversized code remain escaped and readable", () => {
  for (const lang of ["unknown", "javascript"]) {
    const body = '<script>alert("test")</script>\n'.repeat(1000);
    const html = renderMarkdown(`\`\`\`${lang}\n${body}\`\`\``);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  }
});

test("Markdown cannot emit executable link or image protocols", () => {
  const cases = ["[x](javascript:alert%281%29)", "[x](jav&#x61;script:alert%281%29)",
    "[x](data:text/html,hello)", "![x](javascript:alert%281%29)", "[x](vbscript:msgbox%281%29)"];
  for (const content of cases) {
    assert.doesNotMatch(renderMarkdown(content), /(?:href|src)="(?:javascript|vbscript|data):/i);
  }
  assert.doesNotMatch(renderMarkdown('<img src=x onerror="alert(1)"><script>alert(1)</script>'), /<(?:img|script)\b/);
  assert.match(renderMarkdown("[safe](https://example.com)"), /href="https:\/\/example.com"/);
});

test("sanitizing preserves syntax highlighting, accessible math and SVG geometry", () => {
  const html = renderMarkdown("```js\nconst answer = 42;\n```\n\n$$\n\\sqrt{x^2+1} + \\frac{1}{2}\n$$");
  assert.match(html, /hljs-keyword/);
  assert.match(html, /class="katex"/);
  assert.match(html, /<math\b/);
  assert.match(html, /<mfrac>/);
  assert.match(html, /viewBox="/);
  assert.match(html, /<path d="/);
  assert.match(html, /style="[^"]*height:/);
});

test("untrusted KaTeX commands cannot create executable links", () => {
  assert.doesNotMatch(renderMarkdown("$\\href{javascript:alert(1)}{click}$"), /href="javascript:/i);
});

test("heading anchors support Chinese, repeated titles and colliding suffixes", () => {
  const html = renderMarkdown("## 中文标题\n\n## 中文标题\n\n## Hello\n\n## Hello\n\n## Hello-1\n\n## !!!");
  const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["中文标题", "中文标题-1", "hello", "hello-1", "hello-1-1", "section"]);
  assert.match(renderMarkdown("## Hello"), /id="hello"/);
  assert.match(renderMarkdown("## **Bold** and `code`"), /<strong>Bold<\/strong> and <code>code<\/code>/);
});

test("non-Latin post titles receive a stable valid fallback URL", () => {
  assert.equal(slugifyPostTitle("中文标题", "post-abc123"), "post-abc123");
  assert.equal(slugifyPostTitle("--- Hello world ---", "fallback"), "hello-world");
});
