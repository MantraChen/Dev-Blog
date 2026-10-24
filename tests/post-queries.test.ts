import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const queries = await import("../src/db/queries");
const insert = sqlite.prepare("INSERT INTO posts(title, slug, content, tags, draft, hidden, series, publishedAt) VALUES (?, ?, ?, ?, ?, ?, 'series', '2026-10-25T00:00:00.000Z')");
for (let i = 1; i <= 45; i++) insert.run(`Post ${i}`, `post-${i}`, "Shared content", JSON.stringify(i % 2 ? ["odd"] : ["even"]), 0, 0);
insert.run("Private", "draft", "Secret", "[]", 1, 0);
insert.run("Hidden", "hidden", "Secret", "[]", 0, 1);
insert.run("100% literal", "literal", "100%", "[]", 0, 0);

test("public queries paginate with stable ordering, filter tags and treat LIKE wildcards literally", async () => {
  const first = await queries.getPublicPostPage();
  const second = await queries.getPublicPostPage({ page: 2 });
  assert.equal(first.total, 46);
  assert.equal(first.posts.length, 20);
  assert.equal(new Set([...first.posts, ...second.posts].map(p => p.id)).size, 40);
  const filtered = await queries.getPublicPostPage({ query: "Shared", tag: "odd", page: 2 });
  assert.equal(filtered.total, 23);
  assert.equal(filtered.posts.length, 3);
  assert.equal((await queries.getPublicPostPage({ query: "%" })).total, 1);
  assert.equal((await queries.getPublicPostPage({ query: "Secret" })).total, 0);
  assert.equal((await queries.getPublishedPosts(3)).length, 3);
  assert.equal("content" in (await queries.getPublishedPostMetadata())[0], false);
});

test("adjacent and series links exclude hidden/draft posts and handle equal publication dates", async () => {
  assert.deepEqual(await queries.getAdjacentPosts("hidden"), { prev: null, next: null });
  const adjacent = await queries.getAdjacentPosts("post-30");
  assert.equal(adjacent.prev?.slug, "post-31");
  assert.equal(adjacent.next?.slug, "post-29");
  assert.equal((await queries.getPostsBySeries("series")).some(p => ["draft", "hidden"].includes(p.slug)), false);
});
