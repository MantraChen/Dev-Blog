import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { migrate } from "../scripts/migrate.mjs";
const directory = mkdtempSync(join(tmpdir(), "devblog-transfer-test-"));
process.env.DATABASE_PATH = ":memory:";
process.env.MEDIA_DIR = directory;
const { sqlite } = await import("../src/db");
migrate(sqlite);
const t = await import("../src/lib/transfer");
const e = await import("../src/db/editor");
const m = await import("../src/lib/media");
after(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Markdown and local images round-trip through a private import and portable ZIP export", async () => {
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const source =
    "---\ntitle: Import test\nslug: import-test\ntags: [SQLite, 中文]\nseries: databases\nseriesOrder: 3\ncoverImage: images/a.png\n---\n\n## Content\n\n![diagram](images/a.png)";
  const archive = zipSync({
    "article.md": strToU8(source),
    "images/a.png": png,
  });
  const draft = await t.importArticle(Buffer.from(archive), "application/zip");
  assert.equal(draft.data.seriesOrder, 3);
  assert.equal(draft.data.tags, "SQLite, 中文");
  assert.match(draft.data.content, /\/media\/[a-f0-9-]+\.webp/);
  assert.equal(
    (sqlite.prepare("SELECT count(*) AS n FROM posts").get() as any).n,
    0,
  );
  const id = draft.data.coverImage.split("/").at(-1)!.slice(0, -5);
  assert.equal(m.mediaIsPublic(id), false);
  const post = e.publishDraft(draft.id, draft.version);
  const exported = await t.exportArticle(post.id),
    files = await t.readZip(Buffer.from(exported));
  assert.equal(files.size, 2);
  assert.match(files.get("article.md")!.toString(), /images\/.*\.webp/);
  const imported = await t.importArticle(
    Buffer.from(exported),
    "application/zip",
  );
  assert.equal(imported.data.title, post.title);
  assert.notEqual(imported.data.coverImage, draft.data.coverImage);
  assert.equal(
    (sqlite.prepare("SELECT count(*) AS n FROM posts").get() as any).n,
    1,
  );
});

test("unsafe, oversized and invalid imports fail without publishing or leaking temporary assets", async () => {
  await assert.rejects(
    t.readZip(Buffer.from(zipSync({ "../escape.md": strToU8("# Unsafe") }))),
  );
  await assert.rejects(
    t.readZip(
      Buffer.from(zipSync({ "huge.txt": new Uint8Array(9 * 1024 * 1024) })),
    ),
  );
  await assert.rejects(
    t.importArticle(
      Buffer.from(zipSync({ "a.md": strToU8("# A"), "b.md": strToU8("# B") })),
      "application/zip",
    ),
  );
  assert.throws(
    () => t.parseMarkdown("---\ntitle: &a test\ndescription: *a\n---\ntext"),
    /Invalid YAML/,
  );
  assert.throws(
    () => t.parseMarkdown("---\n- wrong\n- shape\n---\ntext"),
    /Invalid YAML/,
  );
  await assert.rejects(
    t.importArticle(Buffer.from([0xff]), "text/markdown"),
    /UTF-8/,
  );
  const before = readdirSync(directory);
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    t.importArticle(
      Buffer.from(
        zipSync({
          "article.md": strToU8("# Cleanup\n![good](a.png)\n![missing](b.png)"),
          "a.png": png,
        }),
      ),
      "application/zip",
    ),
    /Missing image/,
  );
  assert.deepEqual(readdirSync(directory), before);
  await assert.rejects(
    t.importArticle(
      Buffer.from("# Bad\n![bad](../../secret.png)"),
      "text/markdown",
    ),
    /inside the ZIP/,
  );
});

test("reference images and filenames with spaces import while code examples stay literal", async () => {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const source =
    '# Reference images\n\n![diagram][figure]\n\n[figure]: <images/my image.png> "Diagram"\n\n```md\n![example](missing.png)\n```';
  const result = await t.importArticle(
    Buffer.from(
      zipSync({ "article.md": strToU8(source), "images/my image.png": png }),
    ),
    "application/zip",
  );
  assert.match(
    result.data.content,
    /\[figure\]: \/media\/[\da-f-]+\.webp "Diagram"/,
  );
  assert.match(result.data.content, /!\[example\]\(missing.png\)/);
});
