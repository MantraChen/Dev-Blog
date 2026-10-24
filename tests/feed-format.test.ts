import test from "node:test";
import assert from "node:assert/strict";
import { escapeXml, feedDate } from "../src/lib/feed-format";
test("feeds escape XML and omit invalid legacy dates instead of failing", () => {
  assert.equal(escapeXml('<tag attr="x">&\''), '&lt;tag attr=&quot;x&quot;&gt;&amp;&apos;');
  assert.equal(feedDate("2026-10-25"), "2026-10-25T00:00:00.000Z");
  assert.equal(feedDate("</lastmod><script>bad</script>"), undefined);
});
