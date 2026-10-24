import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "../scripts/migrate.mjs";
const directory = mkdtempSync(join(tmpdir(), "devblog-media-test-"));
process.env.DATABASE_PATH = ":memory:";
process.env.MEDIA_DIR = directory;
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const { uploadImage, readMedia, mediaIsPublic } = await import("../src/lib/media");
const { createPost, updatePost } = await import("../src/db/queries");
const { HttpError } = await import("../src/lib/http-error");
after(() => rmSync(directory, { recursive: true, force: true }));
const request = (buffer: Uint8Array, type: string) => new Request("https://example.com/api/media", {
  method: "POST", body: new Uint8Array(buffer), headers: { "Content-Type": type, "X-File-Name": encodeURIComponent("../私密截图.png") },
});

test("uploads decode, resize and re-encode; image privacy follows publication state", async () => {
  const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#aabbcc" } }).png().toBuffer();
  const image = await uploadImage(request(png, "image/png"));
  assert.equal(image.width, 2048);
  assert.equal(image.height, 1024);
  assert.match(image.url, /^\/media\/[0-9a-f-]{36}\.webp$/);
  assert.deepEqual(readdirSync(directory), [`${image.id}.webp`], "Original filenames never become filesystem paths");
  const bytes = await readMedia(image.id);
  const metadata = await sharp(bytes!).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(mediaIsPublic(image.id), false);
  const [post] = createPost({ title: "With image", slug: "with-image", content: `![Private](${image.url})`, draft: true });
  assert.equal(mediaIsPublic(image.id), false);
  updatePost(post.id, { draft: false });
  assert.equal(mediaIsPublic(image.id), true);
  updatePost(post.id, { draft: true });
  assert.equal(mediaIsPublic(image.id), false);
  updatePost(post.id, { draft: false, content: "Image removed" });
  assert.equal(mediaIsPublic(image.id), false);
  assert.ok(await readMedia(image.id), "Retain files used by revision history");
});

test("upload limits reject SVG, corrupt content, MIME spoofing and oversized streams", async () => {
  for (const [buffer, type, status] of [
    [Buffer.from('<svg onload="alert(1)"/>'), "image/svg+xml", 415],
    [Buffer.from("not an image"), "image/png", 400],
    [await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer(), "image/jpeg", 400],
    [await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "red" } }).png().toBuffer(), "image/png", 400],
  ] as const) {
    await assert.rejects(uploadImage(request(buffer, type)), error => error instanceof HttpError && error.status === status);
  }
  const stream = new ReadableStream({ start(controller) {
    for (let i = 0; i < 129; i++) controller.enqueue(new Uint8Array(65536)); controller.close();
  } });
  const oversized = new Request("https://example.com/api/media", { method: "POST", body: stream,
    headers: { "Content-Type": "image/png" }, duplex: "half" } as RequestInit);
  await assert.rejects(uploadImage(oversized), error => error instanceof HttpError && error.status === 413);
  assert.equal(await readMedia("../secret"), null);
});
