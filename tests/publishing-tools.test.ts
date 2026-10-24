import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
import { mergeText, mergeEditorData } from "../src/lib/merge";
import { emptyEditorData } from "../src/lib/editor-data";
import {
  publicAddress,
  externalUrl,
  checkExternalLinks,
} from "../src/lib/external-links";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db");
migrate(sqlite);
const { openDraft, saveDraft, publishDraft } = await import("../src/db/editor");
const { createPost, updatePost, deletePost } =
  await import("../src/db/queries");
const {
  createShare,
  readShare,
  listShares,
  revokeShare,
  writingAssets,
  saveAsset,
  deleteAsset,
  translations,
} = await import("../src/db/publishing");
const { mediaReferences, relatedPosts, restoreTrash } =
  await import("../src/db/content");
const { preflight } = await import("../src/lib/preflight");
const { feedPosts } = await import("../src/lib/subscriptions");
const { executeSearch } = await import("../src/lib/post-search");
test("preview tokens are hashed, snapshot content is immutable, media stays referenced, and revoke/expiry/publication deny access", async () => {
  let draft = openDraft(crypto.randomUUID());
  const media = crypto.randomUUID();
  draft = saveDraft(draft.id, draft.version, {
    ...draft.data,
    title: "Private",
    slug: "private-preview",
    content: `![private](/media/${media}.webp)`,
  });
  const share = createShare(draft.id, draft.version, 1);
  assert.equal(readShare(share.token)?.data.content, draft.data.content);
  assert.ok(
    !JSON.stringify(
      sqlite.prepare("SELECT * FROM preview_shares").all(),
    ).includes(share.token),
  );
  assert.ok(!JSON.stringify(listShares(draft.id)).includes(share.token));
  draft = saveDraft(draft.id, draft.version, {
    ...draft.data,
    content: "Changed privately",
  });
  assert.match(readShare(share.token)!.data.content, /private/);
  assert.ok(mediaReferences(media).some((r) => r.kind === "shared preview"));
  assert.throws(() => createShare(draft.id, 1, 24), /changed/);
  revokeShare(share.id);
  assert.equal(readShare(share.token), null);
  const expired = createShare(draft.id, draft.version, 1);
  sqlite
    .prepare("UPDATE preview_shares SET expiresAt=? WHERE id=?")
    .run("2000-01-01", expired.id);
  assert.equal(readShare(expired.token), null);
  const published = createShare(draft.id, draft.version, 1);
  publishDraft(draft.id, draft.version);
  assert.equal(readShare(published.token), null);
  assert.equal(readShare("../secret"), null);
  const [article] = createPost({
    title: "Trash sharing fixture",
    slug: "trash-sharing",
    draft: false,
  });
  const trashedDraft = openDraft(crypto.randomUUID(), article.id);
  const trashedShare = createShare(trashedDraft.id, trashedDraft.version, 1);
  await deletePost(article.id);
  assert.equal(readShare(trashedShare.token), null);
  restoreTrash(article.id);
  assert.equal(
    readShare(trashedShare.token),
    null,
    "Restoring Trash must not revive a revoked preview",
  );
});
test("preflight identifies broken editorial data without publishing or fetching local services", async () => {
  let draft = openDraft(crypto.randomUUID());
  draft = saveDraft(draft.id, draft.version, {
    ...draft.data,
    title: "Check",
    slug: "private-preview",
    content:
      "![](/media/missing.webp)\n[Missing](/blog/no-such-post)\n[Local](http://127.0.0.1/)",
  });
  const report = await preflight(draft.id, draft.version, true);
  assert.ok(
    report.issues.some(
      (i) => i.severity === "error" && i.message.includes("slug"),
    ),
  );
  assert.ok(report.issues.some((i) => i.message.includes("alternative text")));
  assert.ok(report.issues.some((i) => i.message.includes("no-such-post")));
  assert.equal(report.links[0].status, "blocked");
  await assert.rejects(preflight(draft.id, 1), /changed/);
});
test("external URL validation denies loopback, metadata, private networks, mapped IPv6, URL credentials and non-web schemes", async () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "100.64.0.1",
    "224.0.0.1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "file:///etc/passwd",
    "http://user:secret@example.com",
    "http://localhost/",
    "http://example.com:8080/",
    "http://service.internal/",
  ])
    assert.throws(() => externalUrl(url));
  const checked = await checkExternalLinks([
    "http://169.254.169.254/latest/meta-data",
  ]);
  assert.equal(checked[0].status, "blocked");
});
test("three-way merge combines disjoint edits and refuses overlapping or pathological diffs", () => {
  assert.equal(
    mergeText("a\nb\nc\nd\n", "A\nb\nc\nd\n", "a\nb\nc\nD\n"),
    "A\nb\nc\nD\n",
  );
  assert.equal(mergeText("a\nb\n", "a\nleft\n", "a\nright\n"), null);
  assert.equal(mergeText("a\n", "a\nx\n", "a\ny\n"), null);
  assert.equal(mergeText("same", "same", "changed"), "changed");
  const base = emptyEditorData(),
    local = { ...base, title: "Mine", description: "local" },
    remote = { ...base, title: "Server", tags: "remote" };
  const result = mergeEditorData(base, local, remote);
  assert.deepEqual(result.conflicts, ["title"]);
  assert.equal(result.data.description, "local");
  assert.equal(result.data.tags, "remote");
});
test("custom assets and translation groups persist; feeds/search exclude private content and combine scope filters", async () => {
  const asset = saveAsset({
    kind: "snippet",
    name: "Example",
    content: "```ts\nexport {}\n```",
  });
  assert.ok(writingAssets().some((a) => a.id === asset.id));
  deleteAsset(asset.id);
  assert.ok(!writingAssets().some((a) => a.id === asset.id));
  const inserted = sqlite.prepare(
    "INSERT INTO writing_assets VALUES (?,?,?,?,?)",
  );
  const fixtureIds = Array.from({ length: 200 }, () => crypto.randomUUID());
  for (const id of fixtureIds)
    inserted.run(id, "snippet", "Limit fixture", "", new Date().toISOString());
  assert.throws(
    () =>
      saveAsset({
        id: crypto.randomUUID(),
        kind: "snippet",
        name: "Overflow",
        content: "",
      }),
    /at most 200/,
  );
  saveAsset({
    id: fixtureIds[0],
    kind: "snippet",
    name: "Existing asset",
    content: "Updated at capacity",
  });
  for (const id of fixtureIds) deleteAsset(id);
  const [zh] = createPost({
    title: "中文翻译",
    slug: "translation-zh",
    language: "zh-CN",
    translationKey: "language-test",
    category: "Engineering",
    tags: ["systems"],
    content: "搜索 example",
    draft: false,
  });
  const [en] = createPost({
    title: "English translation",
    slug: "translation-en",
    language: "en",
    translationKey: "language-test",
    category: "Engineering",
    tags: ["systems"],
    content: "搜索 example",
    draft: false,
  });
  const [secret] = createPost({
    title: "Hidden translation",
    slug: "translation-hidden",
    language: "ja",
    translationKey: "language-test",
    tags: ["systems"],
    content: "搜索 example",
    draft: true,
  });
  assert.equal(translations("language-test").length, 2);
  assert.throws(
    () =>
      createPost({
        title: "Duplicate",
        slug: "duplicate-language",
        translationKey: "language-test",
        language: "en",
      }),
    /UNIQUE/,
  );
  assert.deepEqual(
    feedPosts({
      language: "en",
      category: "Engineering",
      tag: "systems",
      series: "",
    }).map((p) => p.slug),
    ["translation-en"],
  );
  assert.deepEqual(
    executeSearch(sqlite, {
      query: "example",
      tag: "systems",
      language: "en",
      category: "Engineering",
    }).ids,
    [en.id],
  );
  assert.deepEqual(
    executeSearch(sqlite, { query: "搜索", tag: "systems", language: "zh-CN" })
      .ids,
    [zh.id],
  );
  assert.ok(relatedPosts(zh.id).some((p) => p.slug === en.slug));
  assert.ok(!relatedPosts(zh.id).some((p) => p.slug === secret.slug));
  updatePost(en.id, { tags: ["changed"] });
  assert.equal(
    (
      sqlite
        .prepare("SELECT count(*) n FROM post_topics WHERE postId=? AND tag=?")
        .get(en.id, "systems") as { n: number }
    ).n,
    0,
  );
  await deletePost(en.id);
  assert.equal(translations("language-test").length, 1);
});
