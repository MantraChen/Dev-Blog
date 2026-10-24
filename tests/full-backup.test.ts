import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import Database from "better-sqlite3";
import { migrate } from "../scripts/migrate.mjs";
import {
  backupPaths,
  createFullBackup,
  inspectFullBackup,
  restoreFullBackup,
  listFullBackups,
} from "../scripts/full-backup.mjs";
const directory = mkdtempSync(join(tmpdir(), "devblog-full-backup-test-"));
process.env.DATABASE_PATH = join(directory, "live.db");
process.env.MEDIA_DIR = join(directory, "media");
const { sqlite } = await import("../src/db");
migrate(sqlite);
const q = await import("../src/db/queries"),
  m = await import("../src/lib/media"),
  e = await import("../src/db/editor"),
  c = await import("../src/db/content");
const paths = backupPaths(sqlite.name);
after(async () => {
  await (await import("../src/lib/post-search")).closeSearchWorker();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

test("full backup restores database, images, search and revisions atomically while preserving a safety snapshot", async () => {
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const asset = await m.uploadImage(
    new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(png),
    }),
  );
  const [post] = q.createPost({
    title: "Snapshot original",
    slug: "snapshot-original",
    content: `![image](${asset.url})`,
    draft: false,
  });
  const draft = e.openDraft(crypto.randomUUID());
  await q.recordPostView(post.id, post.slug, "backup-viewer", 1);
  await q.addReaction(post.id, post.slug, "👍", "backup-viewer");
  const saved = e.saveDraft(draft.id, draft.version, {
    ...draft.data,
    title: "Future",
    slug: "future",
  });
  c.scheduleDraft(
    saved.id,
    saved.version,
    new Date(Date.now() + 120_000).toISOString(),
  );
  sqlite
    .prepare("INSERT INTO admin_sessions(id,expiresAt) VALUES (?,?)")
    .run(crypto.randomUUID(), new Date(Date.now() + 60_000).toISOString());
  sqlite
    .prepare("INSERT INTO admin_passkeys VALUES (?,?,?,?,?,?,NULL)")
    .run(
      "old-key",
      Buffer.from("old"),
      1,
      "[]",
      "Revoked later",
      new Date().toISOString(),
    );
  const { createShare, readShare } = await import("../src/db/publishing");
  const shared = createShare(saved.id, saved.version, 1);
  const backup = await createFullBackup(sqlite, paths);
  sqlite.prepare("DELETE FROM admin_passkeys").run();
  sqlite
    .prepare("INSERT INTO admin_passkeys VALUES (?,?,?,?,?,?,NULL)")
    .run(
      "current-key",
      Buffer.from("current"),
      7,
      "[]",
      "Current key",
      new Date().toISOString(),
    );
  q.updatePost(post.id, { title: "Later content", slug: "snapshot-renamed" });
  c.saveNow("Later Now page");
  const preview = await inspectFullBackup(sqlite, paths, backup.id);
  assert.equal(preview.counts.images, 1);
  const result = await restoreFullBackup(
    sqlite,
    paths,
    backup.id,
    preview.databaseSha256,
  );
  assert.equal(result.signInRequired, true);
  assert.equal((await q.getPostBySlug(post.slug))?.title, "Snapshot original");
  assert.equal(
    (await q.getPublicPostPage({ query: "Snapshot original" })).total,
    1,
  );
  assert.equal(
    (await q.getPublicPostPage({ query: "Later content" })).total,
    0,
  );
  assert.equal(e.listRevisions(post.id).length, 1);
  assert.equal(await q.getPostViewCount(post.slug), 1);
  assert.deepEqual(await q.getReactionCounts(post.slug), { "👍": 1 });
  await q.recordPostView(post.id, post.slug, "later-viewer", 2);
  assert.equal(
    await q.getPostViewCount(post.slug),
    2,
    "Insert triggers are restored after recovery",
  );
  assert.equal(c.getNow().content, "");
  assert.equal((c.listSchedules()[0] as any).status, "cancelled");
  assert.equal(sqlite.prepare("SELECT * FROM admin_sessions").all().length, 0);
  assert.deepEqual(
    sqlite.prepare("SELECT id,counter FROM admin_passkeys").all(),
    [{ id: "current-key", counter: 7 }],
  );
  assert.equal(
    readShare(shared.token),
    null,
    "Restore must not resurrect revoked preview links",
  );
  assert.equal((await m.readMedia(asset.id))!.length, asset.bytes);
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
  assert.equal((await listFullBackups(paths)).length, 2);
  const safety = new Database(
    join(paths.root, result.safetyBackup, "data.db"),
    { readonly: true },
  );
  assert.equal(
    (safety.prepare("SELECT title FROM posts WHERE id=?").get(post.id) as any)
      .title,
    "Later content",
  );
  safety.close();
});

test("corrupt or incomplete backups are rejected before changing current content and failed snapshots leave no partial directory", async () => {
  const backup = await createFullBackup(sqlite, paths);
  const file = join(paths.root, backup.id, "media", backup.files[0].name),
    bytes = readFileSync(file);
  writeFileSync(file, "corrupt");
  await assert.rejects(
    restoreFullBackup(sqlite, paths, backup.id, backup.databaseSha256),
    /checksum/,
  );
  assert.equal(
    (await q.getPostBySlug("snapshot-original"))?.title,
    "Snapshot original",
  );
  writeFileSync(file, bytes);
  const manifest = join(paths.root, backup.id, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ ...backup, files: [] }));
  await assert.rejects(
    inspectFullBackup(sqlite, paths, backup.id),
    /inventory/,
  );
  writeFileSync(manifest, JSON.stringify(backup));
  await assert.rejects(
    restoreFullBackup(sqlite, paths, backup.id, "0".repeat(64)),
    /Preview expired/,
  );
  writeFileSync(manifest, JSON.stringify({ ...backup, schema: "wrong" }));
  await assert.rejects(inspectFullBackup(sqlite, paths, backup.id), /schema/);
  const live = join(paths.media, backup.files[0].name);
  unlinkSync(live);
  await assert.rejects(createFullBackup(sqlite, paths));
  assert.ok(
    readdirSync(paths.root).every((name) => !name.startsWith(".partial-")),
  );
  writeFileSync(live, bytes);
});

test("restoration recovers a missing current image before creating its safety snapshot", async () => {
  const backup = await createFullBackup(sqlite, paths);
  const live = join(paths.media, backup.files[0].name),
    bytes = readFileSync(live);
  unlinkSync(live);
  const restored = await restoreFullBackup(
    sqlite,
    paths,
    backup.id,
    backup.databaseSha256,
  );
  assert.deepEqual(readFileSync(live), bytes);
  assert.equal(
    (await inspectFullBackup(sqlite, paths, restored.safetyBackup)).counts
      .images,
    1,
  );
});

test("a failure during table replacement rolls back content, indexes and trigger definitions", async () => {
  const backup = await createFullBackup(sqlite, paths);
  const post = await q.getPostBySlug("snapshot-original");
  q.updatePost(post!.id, { title: "Current content must survive" });
  const execute = sqlite.exec.bind(sqlite);
  sqlite.exec = (sql: string) => {
    if (sql.startsWith('INSERT INTO main."posts"'))
      throw new Error("Injected write failure");
    return execute(sql);
  };
  try {
    await assert.rejects(
      restoreFullBackup(sqlite, paths, backup.id, backup.databaseSha256),
      /Injected write failure/,
    );
  } finally {
    sqlite.exec = execute;
  }
  assert.equal(
    (await q.getPostBySlug("snapshot-original"))?.title,
    "Current content must survive",
  );
  const before = await q.getPostViewCount("snapshot-original");
  await q.recordPostView(post!.id, post!.slug, "after-rollback", 3);
  assert.equal(await q.getPostViewCount("snapshot-original"), before + 1);
  assert.equal(
    (await q.getPublicPostPage({ query: "Current content must survive" }))
      .total,
    1,
  );
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
});
