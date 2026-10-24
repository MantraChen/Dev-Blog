import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const editor = await import("../src/db/editor");
const { createPost, updatePost, deletePost } = await import("../src/db/queries");
const { HttpError } = await import("../src/lib/http-error");
const rejects = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const row = (id: number) => sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as { title: string; content: string; version: number };

test("incomplete drafts autosave privately and publication validates without losing them", () => {
  const id = crypto.randomUUID();
  const draft = editor.openDraft(id);
  assert.equal(editor.openDraft(id).id, id, "Retrying creation does not duplicate drafts");
  const saved = editor.saveDraft(id, draft.version, { ...draft.data, content: "Unfinished private article" });
  assert.equal(saved.version, 2);
  assert.equal((sqlite.prepare("SELECT count(*) AS n FROM posts").get() as { n: number }).n, 0);
  assert.throws(() => editor.publishDraft(id, saved.version), rejects(400));
  assert.equal(editor.getDraft(id).data.content, "Unfinished private article");
  const complete = editor.saveDraft(id, saved.version, { ...saved.data, title: "First", slug: "first" });
  const post = editor.publishDraft(id, complete.version);
  assert.equal(post.draft, false);
  assert.equal(post.content, "Unfinished private article");
  assert.equal(editor.listRevisions(post.id).length, 1);
  assert.throws(() => editor.getDraft(id), rejects(404));
});

test("autosaving and restoring a revision never changes the live article", () => {
  const [post] = createPost({ title: "Original", slug: "history", content: "Version one", draft: false });
  let draft = editor.openDraft(crypto.randomUUID(), post.id);
  assert.equal(editor.openDraft(crypto.randomUUID(), post.id).id, draft.id);
  draft = editor.saveDraft(draft.id, draft.version, { ...draft.data, title: "Revised", content: "Version two" });
  assert.equal(row(post.id).content, "Version one");
  editor.publishDraft(draft.id, draft.version);
  const history = editor.listRevisions(post.id);
  assert.equal(history.length, 2);
  draft = editor.openDraft(crypto.randomUUID(), post.id);
  draft = editor.restoreRevision(draft.id, draft.version, history[1].id);
  assert.equal(draft.data.content, "Version one");
  assert.equal(row(post.id).content, "Version two");
  editor.publishDraft(draft.id, draft.version);
  assert.equal(row(post.id).content, "Version one");
  assert.equal(row(post.id).version, 3);
});

test("stale tabs cannot overwrite, delete or publish another tab's draft", () => {
  const draft = editor.openDraft(crypto.randomUUID());
  const saved = editor.saveDraft(draft.id, draft.version, { ...draft.data, title: "Newer edit" });
  assert.throws(() => editor.saveDraft(draft.id, draft.version, draft.data), rejects(409));
  assert.throws(() => editor.discardDraft(draft.id, draft.version), rejects(409));
  assert.throws(() => editor.publishDraft(draft.id, draft.version), rejects(409));
  assert.equal(editor.getDraft(draft.id).data.title, "Newer edit");
  editor.discardDraft(draft.id, saved.version);
});

test("publication detects live changes made after a working draft was opened", () => {
  const [post] = createPost({ title: "Initial", slug: "conflict", content: "Initial", draft: false });
  const draft = editor.openDraft(crypto.randomUUID(), post.id);
  updatePost(post.id, { content: "Changed by another editor" });
  assert.throws(() => editor.publishDraft(draft.id, draft.version), rejects(409));
  assert.equal(row(post.id).content, "Changed by another editor");
  assert.equal(editor.getDraft(draft.id).data.content, "Initial");
});

test("duplicate slugs roll publication back and preserve the working draft", () => {
  const [post] = createPost({ title: "Before", slug: "duplicate-source", draft: false });
  const draft = editor.openDraft(crypto.randomUUID(), post.id);
  const saved = editor.saveDraft(draft.id, draft.version, { ...draft.data, slug: "first", title: "After" });
  assert.throws(() => editor.publishDraft(draft.id, saved.version), /UNIQUE/);
  assert.equal(row(post.id).title, "Before");
  assert.equal(editor.getDraft(draft.id).data.title, "After");
  assert.equal(editor.listRevisions(post.id).length, 1);
});

test("history is bounded and cannot restore a revision belonging to another article", () => {
  const [post] = createPost({ title: "History", slug: "bounded-history" });
  for (let i = 0; i < 35; i++) updatePost(post.id, { content: `Revision ${i}` });
  const history = editor.listRevisions(post.id);
  assert.equal(history.length, 30);
  assert.equal(history[0].version, 36);
  const other = editor.openDraft(crypto.randomUUID(), 1);
  assert.throws(() => editor.restoreRevision(other.id, other.version, history[0].id), rejects(404));
});

test("deleting an article cascades its drafts and revision history", async () => {
  const [post] = createPost({ title: "Delete", slug: "delete-history" });
  const draft = editor.openDraft(crypto.randomUUID(), post.id);
  await deletePost(post.id);
  assert.equal(editor.listRevisions(post.id).length, 0);
  assert.throws(() => editor.getDraft(draft.id), rejects(404));
});
