import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { createHash } from "node:crypto";
import { readMedia } from "./media";
import { HttpError } from "./http-error";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const cache = new Map<string, Buffer>();
let processing = 0;
export async function shareCard(post: {
  id: number;
  version: number;
  title: string;
  tags: string[];
  coverImage: string | null;
  language: string;
}) {
  const key = createHash("sha256").update(JSON.stringify(post)).digest("hex");
  const old = cache.get(key);
  if (old) return { bytes: old, etag: `"${key}"` };
  if (processing >= 2)
    throw new HttpError(503, "Share cards are busy. Try again shortly.");
  processing++;
  try {
    const background = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#101827"/><path d="M0 600H1200" stroke="#34d399" stroke-width="10"/><circle cx="1140" cy="0" r="340" fill="#162f36"/></svg>',
    );
    const fontfile = process.env.SHARE_CARD_FONT_FILE;
    const text = async (
      value: string,
      size: number,
      width: number,
      height: number,
      color: string,
    ) =>
      sharp({
        text: {
          text: `<span foreground="${color}">${escape(value)}</span>`,
          font: `Arial, Noto Sans CJK SC, sans-serif ${size}`,
          width,
          rgba: true,
          wrap: "word-char",
          ...(fontfile ? { fontfile } : {}),
        },
      })
        .resize({ width, height, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    const composites: OverlayOptions[] = [];
    const cover = post.coverImage?.match(/^\/media\/([0-9a-f-]{36})\.webp$/);
    if (cover) {
      const data = await readMedia(cover[1]);
      if (data)
        composites.push({
          input: await sharp(data)
            .resize(260, 180, { fit: "cover" })
            .toBuffer(),
          left: 868,
          top: 48,
        });
    }
    composites.push({
      input: await text("HOWIELOG / ENGINEERING NOTES", 24, 760, 40, "#6ee7b7"),
      left: 64,
      top: 58,
    });
    composites.push({
      input: await text(post.title, 64, 1056, 270, "#f8fafc"),
      left: 64,
      top: 250,
    });
    composites.push({
      input: await text(
        post.tags
          .slice(0, 4)
          .map((tag) => "#" + tag)
          .join("  ") || post.language,
        24,
        1056,
        40,
        "#a5b4c7",
      ),
      left: 64,
      top: 540,
    });
    const output = await sharp(background)
      .composite(composites)
      .png()
      .toBuffer();
    // Bound retained bytes and render concurrency; never fetch arbitrary cover URLs.
    let retained = [...cache.values()].reduce(
      (sum, value) => sum + value.length,
      0,
    );
    while (
      cache.size &&
      (cache.size >= 16 || retained + output.length > 16 * 1024 * 1024)
    ) {
      const id = cache.keys().next().value!;
      retained -= cache.get(id)!.length;
      cache.delete(id);
    }
    cache.set(key, output);
    return { bytes: output, etag: `"${key}"` };
  } finally {
    processing--;
  }
}
