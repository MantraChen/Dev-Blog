import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const { POST: view } = await import("../src/pages/api/posts/views");
const { POST: react } = await import("../src/pages/api/reactions");
const queries = await import("../src/db/queries");
const insert = sqlite.prepare("INSERT INTO posts(title, slug, draft) VALUES (?, ?, ?)");
insert.run("Public", "public", 0);
insert.run("Draft", "draft", 1);
const context = (slug: string, cookie = "") => ({
  clientAddress: "192.0.2.10",
  request: new Request("https://example.com/api/posts/views", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ slug, emoji: "👍" }) }),
}) as Parameters<typeof view>[0];

test("unpublished and nonexistent posts cannot accumulate views or reactions", async () => {
  for (const slug of ["missing", "draft"]) {
    assert.equal((await view(context(slug))).status, 404);
    assert.equal((await react(context(slug))).status, 404);
  }
  assert.equal(await queries.getTotalViews(), 0);
});

test("repeat visits are deduplicated and statistics survive slug changes", async () => {
  const first = await view(context("public"));
  assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie")!.split(";")[0];
  assert.match(first.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(first.headers.get("set-cookie")!, /Secure/);
  assert.equal((await view(context("public", cookie))).status, 200);
  assert.equal((await view(context("public"))).status, 200);
  assert.equal(await queries.getPostViewCount("public"), 1);
  assert.equal((await react(context("public"))).status, 201);
  assert.equal((await react(context("public"))).status, 201);
  const post = await queries.getPublicPostIdentity("public");
  queries.updatePost(post!.id, { slug: "renamed" });
  assert.equal(await queries.getPostViewCount("renamed"), 1);
  assert.deepEqual(await queries.getReactionCounts("renamed"), { "👍": 1 });
  assert.equal((await queries.getTopPosts())[0].slug, "renamed");
  await queries.deletePost(post!.id);
  assert.equal(await queries.getTotalViews(), 0);
  assert.equal(sqlite.prepare("SELECT * FROM reactions").all().length, 0);
});
