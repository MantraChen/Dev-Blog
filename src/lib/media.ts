import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sqlite } from "../db";
import { HttpError } from "./http-error";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const mediaDirectory = () =>
  resolve(
    process.env.MEDIA_DIR ||
      join(dirname(process.env.DATABASE_PATH || "data.db"), "media"),
  );
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let processing = 0;
export interface MediaItem {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  url: string;
}

async function readImageBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES)
    throw new HttpError(413, "Images must be at most 8 MiB");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Image body required");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_IMAGE_BYTES) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, "Images must be at most 8 MiB");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Body size limit exceeded:")
    )
      throw new HttpError(413, "Images must be at most 8 MiB");
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function uploadImage(request: Request): Promise<MediaItem> {
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const format = formats[request.headers.get("content-type") || ""];
  if (!format) throw new HttpError(415, "Upload a JPEG, PNG or WebP image");
  if (processing >= 2)
    throw new HttpError(
      429,
      "Two images are already processing. Please retry shortly.",
    );
  processing++;
  try {
    const input = await readImageBody(request);
    let result;
    try {
      const image = sharp(input, {
        limitInputPixels: 16_777_216,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      if (metadata.format !== format || (metadata.pages || 1) !== 1)
        throw new Error("Unsupported image");
      // Decode and re-encode: no SVG, animation, original payload or EXIF survives.
      result = await image
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .timeout({ seconds: 10 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new HttpError(
        400,
        "Invalid image. Use a still JPEG, PNG or WebP of at most 16 megapixels.",
      );
    }
    let name = "image";
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") || "image")
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 200);
    } catch {}
    const id = randomUUID();
    const directory = mediaDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = join(directory, `${id}.webp`);
    await writeFile(filename, result.data, { flag: "wx", mode: 0o600 });
    const item = {
      id,
      name,
      width: result.info.width,
      height: result.info.height,
      bytes: result.data.length,
      createdAt: new Date().toISOString(),
      url: `/media/${id}.webp`,
    };
    try {
      sqlite
        .prepare(
          "INSERT INTO media(id, name, width, height, bytes, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(id, name, item.width, item.height, item.bytes, item.createdAt);
    } catch (error) {
      await unlink(filename);
      throw error;
    }
    return item;
  } finally {
    processing--;
  }
}

export function listMedia(before?: string): MediaItem[] {
  const rows = sqlite
    .prepare(
      "SELECT * FROM media WHERE createdAt < ? ORDER BY createdAt DESC, id DESC LIMIT 50",
    )
    .all(before || "9999") as Omit<MediaItem, "url">[];
  return rows.map((row) => ({ ...row, url: `/media/${row.id}.webp` }));
}

export function mediaIsPublic(id: string) {
  if (!uuid.test(id)) return false;
  const needle = `%/media/${id}.webp%`;
  return (
    !!sqlite
      .prepare(
        "SELECT 1 FROM post_media m JOIN posts p ON p.id=m.postId WHERE m.mediaId=? AND p.draft=0 AND p.deletedAt IS NULL LIMIT 1",
      )
      .get(id) ||
    !!sqlite
      .prepare("SELECT 1 FROM projects WHERE content LIKE ? LIMIT 1")
      .get(needle) ||
    !!sqlite
      .prepare(
        "SELECT 1 FROM site_content WHERE key='now' AND content LIKE ? LIMIT 1",
      )
      .get(needle)
  );
}

export async function readMedia(id: string) {
  if (
    !uuid.test(id) ||
    !sqlite.prepare("SELECT 1 FROM media WHERE id=?").get(id)
  )
    return null;
  try {
    return await readFile(join(mediaDirectory(), `${id}.webp`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
