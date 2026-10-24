import yauzl from "yauzl";
import { zipSync, strToU8 } from "fflate";
import { parse, stringify } from "yaml";
import { marked } from "marked";
import { posix } from "node:path";
import { sqlite } from "../db";
import { openDraft, saveDraft } from "../db/editor";
import { emptyEditorData, editorDataSchema, toEditorData } from "./editor-data";
import { slugifyPostTitle } from "./post-slug";
import { uploadImage, readMedia } from "./media";
import { deleteMedia } from "../db/content";
import { HttpError } from "./http-error";
import type { Post } from "../db/types";
const LIMIT = 32 * 1024 * 1024;
const UPLOAD_LIMIT = 32 * 1024 * 1024;
let transferActive = false;
export async function withTransferSlot<T>(operation: () => Promise<T>) {
  if (transferActive)
    throw new HttpError(
      429,
      "Another import or export is running. Retry shortly.",
    );
  transferActive = true;
  try {
    return await operation();
  } finally {
    transferActive = false;
  }
}
export async function readUpload(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "File required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > UPLOAD_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, "Import files must be at most 32 MiB");
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Body size limit exceeded:")
    )
      throw new HttpError(413, "Import files must be at most 32 MiB");
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function readZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new HttpError(400, "Invalid ZIP archive"));
        const files = new Map<string, Buffer>();
        let total = 0,
          entries = 0,
          failed = false;
        const fail = (message: string) => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(new HttpError(400, message));
        };
        zip.on("error", () => fail("Invalid ZIP archive"));
        zip.on("end", () => {
          if (!failed) resolve(files);
        });
        zip.on("entry", (entry) => {
          if (
            ++entries > 100 ||
            entry.fileName.startsWith("/") ||
            entry.fileName.includes("\\") ||
            entry.fileName.split("/").includes("..") ||
            entry.fileName.includes(":") ||
            entry.generalPurposeBitFlag & 1 ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          )
            return fail("Unsafe or oversized ZIP archive");
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          if (
            files.has(entry.fileName) ||
            entry.uncompressedSize > 8 * 1024 * 1024 ||
            total + entry.uncompressedSize > LIMIT
          )
            return fail("ZIP expands beyond the import limit");
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) return fail("Unable to read ZIP entry");
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              total += chunk.length;
              if (total > LIMIT || bytes > 8 * 1024 * 1024) {
                stream.destroy();
                fail("ZIP expands beyond the import limit");
              } else chunks.push(chunk);
            });
            stream.on("error", () => fail("Invalid compressed data"));
            stream.on("end", () => {
              if (!failed) {
                files.set(entry.fileName, Buffer.concat(chunks));
                zip.readEntry();
              }
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
}
export function parseMarkdown(source: string, name = "article.md") {
  let metadata: Record<string, unknown> = {},
    content = source.replace(/^\uFEFF/, "");
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (front) {
    if (front[1].length > 16_384)
      throw new HttpError(400, "YAML front matter exceeds 16 KiB");
    try {
      metadata = parse(front[1], { maxAliasCount: 0 }) || {};
      if (typeof metadata !== "object" || Array.isArray(metadata))
        throw new Error("Expected metadata mapping");
    } catch {
      throw new HttpError(400, "Invalid YAML front matter");
    }
    content = content.slice(front[0].length);
  }
  const title = String(
    metadata.title ||
      content.match(/^#\s+(.+)$/m)?.[1] ||
      posix.basename(name, ".md"),
  );
  const fallback = `post-${crypto.randomUUID()}`;
  const data = editorDataSchema.safeParse({
    ...emptyEditorData(),
    title,
    slug: metadata.slug || slugifyPostTitle(title, fallback),
    content,
    description: metadata.description || "",
    language: metadata.language || "zh-CN",
    translationKey: metadata.translationKey || "",
    category: metadata.category || "",
    tags: Array.isArray(metadata.tags)
      ? metadata.tags.join(", ")
      : String(metadata.tags || ""),
    coverImage: metadata.coverImage || "",
    series: metadata.series || "",
    seriesOrder: metadata.seriesOrder || 0,
    publishedAt:
      typeof metadata.date === "string"
        ? metadata.date
        : typeof metadata.publishedAt === "string"
          ? metadata.publishedAt
          : new Date().toISOString(),
  });
  if (!data.success)
    throw new HttpError(
      400,
      "Markdown metadata or content exceeds the supported limits",
    );
  return data.data;
}
export async function importArticle(buffer: Buffer, type: string) {
  const files =
    type === "application/zip"
      ? await readZip(buffer)
      : new Map([["article.md", buffer]]);
  const markdown = [...files.keys()].filter((name) => /\.md$/i.test(name));
  if (markdown.length !== 1)
    throw new HttpError(
      400,
      "Import exactly one Markdown file, optionally bundled with images in a ZIP",
    );
  const name = markdown[0];
  if (files.get(name)!.length > 2 * 1024 * 1024)
    throw new HttpError(413, "Markdown exceeds 2 MiB");
  let sourceText: string;
  try {
    sourceText = new TextDecoder("utf-8", { fatal: true }).decode(
      files.get(name)!,
    );
  } catch {
    throw new HttpError(400, "Markdown must use UTF-8 encoding");
  }
  const data = parseMarkdown(sourceText, name);
  const uploaded: string[] = [];
  let draftId: string | undefined;
  try {
    const paths = new Set<string>();
    marked.walkTokens(marked.lexer(data.content), (token) => {
      if (token.type === "image") paths.add(token.href);
    });
    if (data.coverImage) paths.add(data.coverImage);
    const replacements = new Map<string, string>();
    for (const source of paths) {
      if (/^(?:https?:|\/media\/)/.test(source)) continue;
      if (/^\/howielog\/media\//.test(source)) {
        replacements.set(source, source.slice("/howielog".length));
        continue;
      }
      let decoded;
      try {
        decoded = decodeURIComponent(source);
      } catch {
        throw new HttpError(400, "Invalid image path");
      }
      if (
        decoded.startsWith("/") ||
        decoded.includes("\\") ||
        decoded.includes(":") ||
        decoded.split("/").includes("..")
      )
        throw new HttpError(400, "Image paths must stay inside the ZIP");
      const file = files.get(posix.join(posix.dirname(name), decoded));
      if (!file)
        throw new HttpError(
          400,
          `Missing image: ${source.slice(0, 120)}. Include it in the ZIP.`,
        );
      if (uploaded.length >= 99)
        throw new HttpError(400, "Import at most 99 images per article");
      const type = /\.png$/i.test(source)
        ? "image/png"
        : /\.jpe?g$/i.test(source)
          ? "image/jpeg"
          : /\.webp$/i.test(source)
            ? "image/webp"
            : "";
      const image = await uploadImage(
        new Request("https://import.invalid/api/media", {
          method: "POST",
          headers: {
            "Content-Type": type,
            "X-File-Name": encodeURIComponent(posix.basename(source)),
          },
          body: new Uint8Array(file),
        }),
      );
      uploaded.push(image.id);
      replacements.set(source, image.url);
    }
    const rewrite = (text: string) =>
      text
        .replace(
          /(!\[[^\]]*\]\()(?:<([^>]+)>|([^\s)]+))([^)]*\))/g,
          (raw, before, angle, bare, after) =>
            replacements.has(angle || bare)
              ? before + replacements.get(angle || bare) + after
              : raw,
        )
        .replace(
          /^(\s{0,3}\[[^\]]+\]:\s*)(?:<([^>]+)>|([^\s]+))([^\n]*)$/gm,
          (raw, before, angle, bare, after) =>
            replacements.has(angle || bare)
              ? before + replacements.get(angle || bare) + after
              : raw,
        );
    // Top-level fenced code remains byte-for-byte intact, even if it demonstrates image syntax.
    let cursor = 0;
    const pieces: string[] = [];
    for (const token of marked.lexer(data.content)) {
      const position = data.content.indexOf(token.raw, cursor);
      if (position < 0)
        throw new HttpError(400, "Unable to preserve this Markdown layout");
      pieces.push(
        rewrite(data.content.slice(cursor, position)),
        token.type === "code" ? token.raw : rewrite(token.raw),
      );
      cursor = position + token.raw.length;
    }
    pieces.push(rewrite(data.content.slice(cursor)));
    data.content = pieces.join("");
    data.coverImage = replacements.get(data.coverImage) || data.coverImage;
    const draft = openDraft(crypto.randomUUID());
    draftId = draft.id;
    return saveDraft(draft.id, draft.version, data);
  } catch (error) {
    if (draftId)
      sqlite.prepare("DELETE FROM post_drafts WHERE id=?").run(draftId);
    for (const id of uploaded) await deleteMedia(id).catch(() => {});
    throw error;
  }
}
export async function exportArticle(id: number) {
  const row = sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as
    | (Omit<Post, "tags" | "draft" | "hidden" | "featured"> & {
        tags: string;
        draft: number;
        hidden: number;
        featured: number;
      })
    | undefined;
  if (!row) throw new HttpError(404, "Article not found");
  const data = toEditorData({
    ...row,
    tags: JSON.parse(row.tags),
    draft: !!row.draft,
    hidden: !!row.hidden,
    featured: !!row.featured,
  } as Post);
  const ids = new Set(
    [
      ...`${data.coverImage}\n${data.content}`.matchAll(
        /\/media\/([0-9a-f-]{36})\.webp/g,
      ),
    ].map((match) => match[1]),
  );
  const files: Record<string, Uint8Array> = Object.create(null);
  let size = Buffer.byteLength(data.content);
  for (const id of ids) {
    const image = await readMedia(id);
    if (!image)
      throw new HttpError(
        409,
        "An article image is missing. Repair it before exporting.",
      );
    size += image.length;
    if (size > LIMIT) throw new HttpError(413, "Article export exceeds 32 MiB");
    files[`images/${id}.webp`] = image;
  }
  const local = (text: string) =>
    text.replace(
      /(?:https?:\/\/(?:howielog\.com|dyyjs\.com))?(?:\/howielog)?\/media\/([0-9a-f-]{36})\.webp/g,
      "images/$1.webp",
    );
  files["article.md"] = strToU8(
    "---\n" +
      stringify({
        title: data.title,
        slug: data.slug,
        description: data.description,
        tags: JSON.parse(row.tags),
        coverImage: local(data.coverImage),
        series: data.series,
        seriesOrder: data.seriesOrder,
        language: data.language,
        translationKey: data.translationKey,
        category: data.category,
        publishedAt: data.publishedAt,
      }) +
      "---\n\n" +
      local(data.content),
  );
  if (
    Object.values(files).reduce((sum, file) => sum + file.byteLength, 0) >
      LIMIT ||
    Object.keys(files).length > 100
  )
    throw new HttpError(
      413,
      "Article exceeds ZIP import limits. Use a full backup for this content.",
    );
  const archive = zipSync(files, { level: 6 });
  if (archive.length > UPLOAD_LIMIT)
    throw new HttpError(413, "Article export exceeds the 32 MiB import limit");
  return archive;
}
