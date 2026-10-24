import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "../scripts/migrate.mjs";
const directory = mkdtempSync(join(tmpdir(), "devblog-content-test-"));
process.env.DATABASE_PATH = ":memory:";
process.env.MEDIA_DIR = directory;
const { sqlite } = await import("../src/db");
migrate(sqlite);
const q = await import("../src/db/queries");
const c = await import("../src/db/content");
const e = await import("../src/db/editor");
const m = await import("../src/lib/media");
const { resolveAlias } = await import("../src/db/aliases");
const { executeSearch } = await import("../src/lib/post-search");
const { HttpError } = await import("../src/lib/http-error");
after(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});
const row = (id: number) =>
  sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as any;
const status = (expected: number) => (error: unknown) =>
  error instanceof HttpError && error.status === expected;
const newDraft = (slug: string) => {
  const draft = e.openDraft(crypto.randomUUID());
  return e.saveDraft(draft.id, draft.version, {
    ...draft.data,
    title: slug,
    slug,
    content: "Scheduled text",
  });
};

test("trash hides every public query, retains working copies and history, restores privately, and expires after 30 days", async () => {
  const [post] = q.createPost({
    title: "Trash isolation",
    slug: "trash-isolation",
    content: "Unique trash needle",
    draft: false,
    series: "test",
  });
  const draft = e.openDraft(crypto.randomUUID(), post.id);
  await q.deletePost(post.id);
  assert.equal(await q.getPostBySlug(post.slug), null);
  assert.equal(await q.getPublicPostIdentity(post.slug), undefined);
  assert.ok(!(await q.getPublishedPosts()).some((p) => p.id === post.id));
  assert.ok(
    !(await q.getPublishedPostMetadata()).some((p) => p.id === post.id),
  );
  assert.equal(
    executeSearch(sqlite, { query: "Unique trash needle", tag: "" }).total,
    0,
  );
  assert.ok(!e.listDrafts().some((d) => d.id === draft.id));
  assert.equal(e.listRevisions(post.id).length, 1);
  assert.throws(() => e.openDraft(crypto.randomUUID(), post.id), status(409));
  assert.throws(() => e.publishDraft(draft.id, draft.version), status(409));
  c.restoreTrash(post.id);
  assert.equal(row(post.id).draft, 1);
  assert.equal(e.getDraft(draft.id).id, draft.id);
  await q.deletePost(post.id);
  sqlite
    .prepare("UPDATE posts SET deletedAt=? WHERE id=?")
    .run(new Date(Date.now() - 31 * 86400_000).toISOString(), post.id);
  assert.equal(c.cleanTrash().changes, 1);
  assert.equal(row(post.id), undefined);
  assert.equal(e.listRevisions(post.id).length, 0);
  assert.throws(() => e.getDraft(draft.id), status(404));
});

test("renames reserve old slugs and preserve backlinks without exposing private sources or destinations", async () => {
  const [target] = q.createPost({
    title: "Target",
    slug: "original-address",
    draft: false,
    tags: ["sqlite"],
  });
  const [source] = q.createPost({
    title: "Source",
    slug: "link-source",
    draft: false,
    content: "[Target](/howielog/blog/original-address#part)",
    tags: ["sqlite"],
  });
  q.createPost({
    title: "Private source",
    slug: "private-source",
    draft: true,
    content: "[Target](/blog/original-address)",
    tags: ["sqlite"],
  });
  q.updatePost(target.id, { slug: "new-address" });
  assert.equal(resolveAlias("original-address")?.slug, "new-address");
  assert.throws(
    () => q.createPost({ title: "Steal", slug: "original-address" }),
    status(409),
  );
  assert.deepEqual(
    c.backlinks(target.id, "new-address").map((p) => p.slug),
    [source.slug],
  );
  assert.deepEqual(
    c.relatedPosts(target.id).map((p) => p.slug),
    [source.slug],
  );
  q.updatePost(target.id, { draft: true });
  assert.equal(resolveAlias("original-address"), undefined);
  assert.ok(
    c.brokenLinks().some((link: any) => link.targetSlug === "original-address"),
  );
  q.updatePost(target.id, { slug: "original-address", draft: false });
  assert.equal(resolveAlias("new-address")?.slug, "original-address");
  await q.deletePost(target.id);
  assert.equal(resolveAlias("new-address"), undefined);
});

test("series ordering checks membership and public visibility, search combines year and series filters", async () => {
  c.saveSeries({
    slug: "database",
    title: "Database path",
    description: "Start here",
  });
  const [a] = q.createPost({
    title: "Chapter A",
    slug: "chapter-a",
    series: "database",
    draft: false,
    publishedAt: "2025-02-01T00:00:00.000Z",
  });
  const [b] = q.createPost({
    title: "Chapter B",
    slug: "chapter-b",
    series: "database",
    draft: false,
    publishedAt: "2026-02-01T00:00:00.000Z",
  });
  const [privatePost] = q.createPost({
    title: "Private chapter",
    slug: "chapter-private",
    series: "database",
    hidden: true,
    draft: false,
  });
  c.reorderSeries("database", [b.id, privatePost.id, a.id]);
  assert.deepEqual(
    c.seriesChapters("database").map((p) => p.id),
    [b.id, a.id],
  );
  assert.throws(() => c.reorderSeries("database", [a.id, b.id]), status(409));
  assert.equal(c.seriesList().find((s) => s.slug === "database")?.count, 2);
  assert.deepEqual(
    executeSearch(sqlite, {
      query: "Chapter",
      tag: "",
      year: "2025",
      series: "database",
    }).ids,
    [a.id],
  );
  assert.deepEqual(
    (await q.getPublicPostPage({ year: "2026", series: "database" })).posts.map(
      (p) => p.id,
    ),
    [b.id],
  );
});

test("schedules publish only the saved version, cancel after edits and preserve failed drafts", () => {
  const future = new Date(Date.now() + 60_000).toISOString(),
    later = new Date(Date.now() + 120_000).toISOString();
  const draft = newDraft("scheduled-good");
  assert.throws(
    () => c.scheduleDraft(draft.id, draft.version + 1, future),
    status(409),
  );
  c.scheduleDraft(draft.id, draft.version, future);
  assert.equal(c.publishDue(), 0);
  assert.equal(c.publishDue(later), 1);
  assert.equal(
    (
      sqlite
        .prepare("SELECT publishedAt FROM posts WHERE slug='scheduled-good'")
        .get() as any
    ).publishedAt,
    future,
  );
  assert.equal(
    (
      sqlite
        .prepare("SELECT draft FROM posts WHERE slug='scheduled-good'")
        .get() as any
    ).draft,
    0,
  );
  const edited = newDraft("scheduled-edited");
  c.scheduleDraft(edited.id, edited.version, future);
  e.saveDraft(edited.id, edited.version, {
    ...edited.data,
    content: "Changed after scheduling",
  });
  assert.equal(
    (c.listSchedules().find((s: any) => s.draftId === edited.id) as any).status,
    "cancelled",
  );
  const duplicate = newDraft("scheduled-good");
  c.scheduleDraft(duplicate.id, duplicate.version, future);
  c.publishDue(later);
  assert.equal(
    (c.listSchedules().find((s: any) => s.draftId === duplicate.id) as any)
      .status,
    "failed",
  );
  assert.equal(e.getDraft(duplicate.id).data.slug, "scheduled-good");
  const cancelled = newDraft("scheduled-cancel");
  c.scheduleDraft(cancelled.id, cancelled.version, future);
  c.cancelSchedule(cancelled.id);
  c.publishDue(later);
  assert.equal(e.getDraft(cancelled.id).id, cancelled.id);
});

test("media deletion respects trash, history, drafts, project and Now references", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const asset = await m.uploadImage(
    new Request("https://example.com", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-File-Name": "Test%20image.png",
      },
      body: new Uint8Array(png),
    }),
  );
  const [post] = q.createPost({
    title: "Image article",
    slug: "image-article",
    content: `![image](${asset.url})`,
    draft: false,
  });
  assert.equal(m.mediaIsPublic(asset.id), true);
  await q.deletePost(post.id);
  assert.equal(m.mediaIsPublic(asset.id), false);
  await assert.rejects(c.deleteMedia(asset.id), status(409));
  c.restoreTrash(post.id);
  q.updatePost(post.id, { content: "" });
  assert.ok(c.mediaReferences(asset.id).some((ref) => ref.kind === "history"));
  await q.deletePost(post.id);
  c.purgeTrash(post.id);
  const draft = newDraft("image-draft");
  e.saveDraft(draft.id, draft.version, {
    ...draft.data,
    coverImage: asset.url,
  });
  await assert.rejects(c.deleteMedia(asset.id), status(409));
  e.discardDraft(draft.id, draft.version + 1);
  const [project] = await q.createProject({
    name: "Image project",
    description: "Project notes",
    techStack: [],
    content: `![image](${asset.url})`,
  });
  assert.equal(m.mediaIsPublic(asset.id), true);
  await assert.rejects(c.deleteMedia(asset.id), status(409));
  await q.deleteProject(project.id);
  c.saveNow(`![image](${asset.url})`);
  assert.equal(m.mediaIsPublic(asset.id), true);
  await assert.rejects(c.deleteMedia(asset.id), status(409));
  c.saveNow("Learning SQLite");
  assert.equal(m.mediaIsPublic(asset.id), false);
  assert.equal(c.mediaLibrary("Test", 1.5).items.length, 1);
  await c.deleteMedia(asset.id);
  assert.equal(await m.readMedia(asset.id), null);
});

test("annual reviews include only public content and completed projects", async () => {
  q.createPost({
    title: "Year public",
    slug: "year-public",
    draft: false,
    tags: ["2024-topic"],
    publishedAt: "2024-01-01T00:00:00.000Z",
  });
  q.createPost({
    title: "Year private",
    slug: "year-private",
    draft: true,
    tags: ["secret"],
    publishedAt: "2024-01-01T00:00:00.000Z",
  });
  const [project] = await q.createProject({
    name: "Retrospective",
    description: "Notes",
    techStack: [],
    content: "## Architecture",
    completedAt: "2024-12-01",
  });
  assert.equal(c.yearReview("2024").articles.length, 1);
  assert.deepEqual(c.yearReview("2024").topics, [["2024-topic", 1]]);
  assert.equal(c.yearReview("2024").projects[0].slug, project.slug);
  assert.equal(
    (await q.getProjectList()).find((p) => p.id === project.id)?.content,
    "",
  );
  assert.equal(
    (await q.getProjectBySlug(project.slug!))?.content,
    "## Architecture",
  );
});
