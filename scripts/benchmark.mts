import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { migrate } from "./migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const { executeSearch } = await import("../src/lib/post-search");
const { relatedPosts, yearReview } = await import("../src/db/content");
const { feedPosts } = await import("../src/lib/subscriptions");
const total = 5000,
  content = "中文搜索，SQLite performance engineering notes. ".repeat(80);
const insert = sqlite.prepare(
  "INSERT INTO posts(title,slug,content,tags,draft,hidden,publishedAt,language,category,series) VALUES (?,?,?,?,?,?,?,?,?,?)",
);
sqlite.transaction(() => {
  for (let n = 0; n < total; n++)
    insert.run(
      `Article ${n}`,
      `article-${n}`,
      content,
      JSON.stringify(["topic-" + (n % 50), "systems"]),
      n % 10 === 0 ? 1 : 0,
      n % 17 === 0 ? 1 : 0,
      `2026-${String((n % 12) + 1).padStart(2, "0")}-01T00:00:00.000Z`,
      n % 2 ? "en" : "zh-CN",
      "Engineering",
      n % 20 === 0 ? "series" : null,
    );
})();
const measure = (name: string, fn: () => unknown) => {
  fn();
  const times: number[] = [];
  for (let n = 0; n < 25; n++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 3000, `${name} exceeded the 3-second regression budget`);
  return {
    name,
    p50Ms: +times[Math.floor(times.length * 0.5)].toFixed(2),
    p95Ms: +p95.toFixed(2),
  };
};
const results = [
  measure("FTS phrase search", () =>
    executeSearch(sqlite, { query: "performance", tag: "" }),
  ),
  measure("two-character Chinese search", () =>
    executeSearch(sqlite, { query: "搜索", tag: "", language: "zh-CN" }),
  ),
  measure("related articles", () => relatedPosts(2)),
  measure("annual summary", () => yearReview("2026")),
  measure("filtered RSS", () =>
    feedPosts({
      tag: "topic-1",
      language: "en",
      category: "Engineering",
      series: "",
    }),
  ),
];
const publicCount = (
  sqlite
    .prepare("SELECT count(*) n FROM posts WHERE draft=0 AND hidden=0")
    .get() as { n: number }
).n;
assert.equal(
  executeSearch(sqlite, { query: "performance", tag: "" }).total,
  publicCount,
);
assert.ok(
  feedPosts({ tag: "", language: "", category: "", series: "" }).length <= 200,
);
console.log(
  JSON.stringify(
    {
      fixturePosts: total,
      bodyCharacters: content.length,
      environment: { node: process.version, platform: process.platform },
      results,
    },
    null,
    2,
  ),
);
sqlite.close();
