import { sqlite } from "./index";
import { toEditorData } from "../lib/editor-data";
import type { Post } from "./types";
import { extractPostLinks } from "../../scripts/content-links.mjs";

// Called inside the same transaction as publication. Keep a bounded history.
export function recordRevision(post: Post) {
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO post_revisions(postId, version, data, savedAt) VALUES (?, ?, ?, ?)",
    )
    .run(
      post.id,
      post.version,
      JSON.stringify(toEditorData(post)),
      new Date().toISOString(),
    );
  sqlite
    .prepare(
      "DELETE FROM post_revisions WHERE postId=? AND id NOT IN (SELECT id FROM post_revisions WHERE postId=? ORDER BY id DESC LIMIT 30)",
    )
    .run(post.id, post.id);
}

export function syncPostMedia(post: Post) {
  if (post.series)
    sqlite
      .prepare("INSERT OR IGNORE INTO series(slug,title) VALUES (?,?)")
      .run(post.series, post.series);
  sqlite.prepare("DELETE FROM post_links WHERE postId=?").run(post.id);
  const link = sqlite.prepare(
    "INSERT OR IGNORE INTO post_links(postId,targetSlug) VALUES (?,?)",
  );
  for (const slug of extractPostLinks(post.content)) link.run(post.id, slug);
  const ids = new Set(
    [
      ...`${post.coverImage || ""}\n${post.content}`.matchAll(
        /\/media\/([0-9a-f-]{36})\.webp/g,
      ),
    ].map((match) => match[1]),
  );
  sqlite.prepare("DELETE FROM post_media WHERE postId=?").run(post.id);
  const insert = sqlite.prepare(
    "INSERT INTO post_media(postId, mediaId) SELECT ?, id FROM media WHERE id=?",
  );
  for (const id of ids) insert.run(post.id, id);
}
