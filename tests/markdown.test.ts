import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/lib/markdown";

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
