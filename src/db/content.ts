import { sqlite } from "./index";
import { getDraft, publishDraft } from "./editor";
import { updatePost } from "./queries";
import { HttpError } from "../lib/http-error";
import { mediaDirectory } from "../lib/media";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { createPostSchema } from "../lib/validation";

export function trashList() {
  return sqlite
    .prepare(
      "SELECT id,title,slug,deletedAt FROM posts WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC",
    )
    .all();
}
export function restoreTrash(id: number) {
  const result = sqlite
    .prepare(
      "UPDATE posts SET deletedAt=NULL,draft=1 WHERE id=? AND deletedAt IS NOT NULL",
    )
    .run(id);
  if (!result.changes) throw new HttpError(404, "Trashed article not found");
  return { ok: true };
}
export function purgeTrash(id: number) {
  const result = sqlite
    .prepare("DELETE FROM posts WHERE id=? AND deletedAt IS NOT NULL")
    .run(id);
  if (!result.changes) throw new HttpError(404, "Trashed article not found");
  return { ok: true };
}
export function cleanTrash() {
  return sqlite
    .prepare("DELETE FROM posts WHERE deletedAt < ?")
    .run(new Date(Date.now() - 30 * 86400_000).toISOString());
}
export interface Series {
  slug: string;
  title: string;
  description: string;
  count: number;
}
export function seriesList(): Series[] {
  return sqlite
    .prepare(
      "SELECT s.*,count(p.id) AS count FROM series s LEFT JOIN posts p ON p.series=s.slug AND p.draft=0 AND p.hidden=0 AND p.deletedAt IS NULL GROUP BY s.slug ORDER BY s.title",
    )
    .all() as Series[];
}
export function saveSeries(input: {
  slug: string;
  title: string;
  description: string;
}) {
  sqlite
    .prepare(
      "INSERT INTO series(slug,title,description) VALUES (@slug,@title,@description) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description",
    )
    .run(input);
  return input;
}
export function seriesChapters(slug: string, admin = false) {
  return sqlite
    .prepare(
      `SELECT id,slug,title,draft,hidden,seriesOrder FROM posts WHERE series=? AND deletedAt IS NULL ${admin ? "" : "AND draft=0 AND hidden=0"} ORDER BY seriesOrder,publishedAt,id`,
    )
    .all(slug) as {
    id: number;
    slug: string;
    title: string;
    draft: number;
    hidden: number;
    seriesOrder: number;
  }[];
}
export function reorderSeries(slug: string, ids: number[]) {
  return sqlite
    .transaction(() => {
      const current = seriesChapters(slug, true)
        .map((row) => row.id)
        .sort((a, b) => a - b);
      if (
        JSON.stringify(current) !==
          JSON.stringify([...new Set(ids)].sort((a, b) => a - b)) ||
        ids.length !== current.length
      )
        throw new HttpError(
          409,
          "Chapter list changed. Reload before reordering.",
        );
      ids.forEach((id, index) => updatePost(id, { seriesOrder: index }));
      return { ok: true };
    })
    .immediate();
}
export function relatedPosts(id: number) {
  return sqlite
    .prepare(
      `WITH source AS (SELECT id,series FROM posts WHERE id=?), candidates AS (
        SELECT t.postId AS id FROM post_topics t JOIN post_topics s ON t.tag=s.tag WHERE s.postId=(SELECT id FROM source)
        UNION SELECT id FROM posts WHERE series=(SELECT series FROM source)
      ) SELECT p.slug,p.title FROM posts p WHERE p.id IN (SELECT id FROM candidates) AND p.id!=(SELECT id FROM source)
      AND p.draft=0 AND p.hidden=0 AND p.deletedAt IS NULL
      ORDER BY CASE WHEN p.series=(SELECT series FROM source) THEN 0 ELSE 1 END,p.publishedAt DESC LIMIT 4`,
    )
    .all(id) as { slug: string; title: string }[];
}
export function backlinks(id: number, slug: string) {
  return sqlite
    .prepare(
      `SELECT DISTINCT p.slug,p.title FROM post_links l JOIN posts p ON p.id=l.postId WHERE p.id!=? AND p.draft=0 AND p.hidden=0 AND p.deletedAt IS NULL
    AND (l.targetSlug=? OR l.targetSlug IN(SELECT slug FROM post_aliases WHERE postId=?)) ORDER BY p.publishedAt DESC LIMIT 30`,
    )
    .all(id, slug, id) as { slug: string; title: string }[];
}
export function brokenLinks() {
  return sqlite
    .prepare(
      `SELECT p.id,p.title,l.targetSlug FROM post_links l JOIN posts p ON p.id=l.postId
    LEFT JOIN posts target ON target.slug=l.targetSlug LEFT JOIN post_aliases a ON a.slug=l.targetSlug LEFT JOIN posts redirected ON redirected.id=a.postId
    WHERE p.deletedAt IS NULL AND (COALESCE(target.id,redirected.id) IS NULL OR COALESCE(target.draft,redirected.draft)=1 OR COALESCE(target.deletedAt,redirected.deletedAt) IS NOT NULL) ORDER BY p.id LIMIT 200`,
    )
    .all();
}
export function getNow() {
  return sqlite
    .prepare("SELECT content,updatedAt FROM site_content WHERE key='now'")
    .get() as { content: string; updatedAt: string };
}
export function saveNow(content: string) {
  sqlite
    .prepare("UPDATE site_content SET content=?,updatedAt=? WHERE key='now'")
    .run(content, new Date().toISOString());
  return getNow();
}
export function listSchedules() {
  return sqlite
    .prepare(
      `SELECT s.*,json_extract(d.data,'$.title') AS title FROM post_schedules s JOIN post_drafts d ON d.id=s.draftId ORDER BY s.scheduledAt`,
    )
    .all();
}
export function scheduleDraft(id: string, version: number, date: string) {
  const at = new Date(date).toISOString();
  if (Date.parse(at) <= Date.now() + 5000)
    throw new HttpError(
      400,
      "Choose a future time at least 5 seconds from now.",
    );
  const draft = getDraft(id);
  if (draft.version !== version)
    throw new HttpError(409, "Draft changed. Reload before scheduling.");
  const check = createPostSchema.safeParse({
    ...draft.data,
    tags: draft.data.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    coverImage: draft.data.coverImage || null,
    series: draft.data.series || null,
  });
  if (!check.success)
    throw new HttpError(
      400,
      "Complete the title, slug and other article fields before scheduling.",
    );
  sqlite
    .prepare(
      "INSERT INTO post_schedules(draftId,version,scheduledAt,status,error) VALUES (?,?,?,'pending',NULL) ON CONFLICT(draftId) DO UPDATE SET version=excluded.version,scheduledAt=excluded.scheduledAt,status='pending',error=NULL",
    )
    .run(id, version, at);
  return { ok: true };
}
export function cancelSchedule(id: string) {
  sqlite
    .prepare(
      "UPDATE post_schedules SET status='cancelled',error=NULL WHERE draftId=?",
    )
    .run(id);
  return { ok: true };
}
export function publishDue(now = new Date().toISOString()) {
  const due = sqlite
    .prepare(
      "SELECT * FROM post_schedules WHERE status='pending' AND scheduledAt<=? ORDER BY scheduledAt LIMIT 10",
    )
    .all(now) as { draftId: string; version: number; scheduledAt: string }[];
  for (const job of due)
    sqlite
      .transaction(() => {
        if (
          !sqlite
            .prepare(
              "SELECT 1 FROM post_schedules WHERE draftId=? AND status='pending'",
            )
            .get(job.draftId)
        )
          return;
        try {
          publishDraft(job.draftId, job.version, job.scheduledAt);
        } catch (error) {
          sqlite
            .prepare(
              "UPDATE post_schedules SET status='failed',error=? WHERE draftId=?",
            )
            .run(
              error instanceof HttpError
                ? error.message
                : "Publication failed. Check the slug and server logs, then schedule again.",
              job.draftId,
            );
        }
      })
      .immediate();
  return due.length;
}
export function mediaReferences(id: string) {
  const needle = `%/media/${id}.webp%`;
  return [
    ...sqlite
      .prepare(
        "SELECT id,json_extract(data,'$.title') title,'shared preview' kind FROM preview_shares WHERE data LIKE ? AND expiresAt>?",
      )
      .all(needle, new Date().toISOString()),
    ...sqlite
      .prepare(
        "SELECT id,name title,kind FROM writing_assets WHERE content LIKE ?",
      )
      .all(needle),
    ...sqlite
      .prepare(
        "SELECT p.id,p.title,CASE WHEN p.deletedAt IS NOT NULL THEN 'trash' WHEN p.draft=1 THEN 'article draft' ELSE 'article' END AS kind FROM post_media m JOIN posts p ON p.id=m.postId WHERE m.mediaId=?",
      )
      .all(id),
    ...sqlite
      .prepare(
        "SELECT id,json_extract(data,'$.title') AS title,'working draft' AS kind FROM post_drafts WHERE data LIKE ?",
      )
      .all(needle),
    ...sqlite
      .prepare(
        "SELECT DISTINCT postId AS id,json_extract(data,'$.title') AS title,'history' AS kind FROM post_revisions WHERE data LIKE ?",
      )
      .all(needle),
    ...sqlite
      .prepare(
        "SELECT id,name AS title,'project' AS kind FROM projects WHERE content LIKE ?",
      )
      .all(needle),
    ...sqlite
      .prepare(
        "SELECT key AS id,key AS title,'page' AS kind FROM site_content WHERE content LIKE ?",
      )
      .all(needle),
  ] as { id: number | string; title: string; kind: string }[];
}
export function mediaLibrary(q = "", page = 1) {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const total = (
    sqlite
      .prepare("SELECT count(*) AS n FROM media WHERE name LIKE ? ESCAPE '\\'")
      .get(pattern) as { n: number }
  ).n;
  page = Math.max(
    1,
    Math.min(
      Number.isFinite(page) ? Math.floor(page) : 1,
      Math.max(1, Math.ceil(total / 20)),
    ),
  );
  const rows = sqlite
    .prepare(
      "SELECT * FROM media WHERE name LIKE ? ESCAPE '\\' ORDER BY createdAt DESC,id DESC LIMIT 20 OFFSET ?",
    )
    .all(pattern, (page - 1) * 20) as {
    id: string;
    name: string;
    bytes: number;
    width: number;
    height: number;
    createdAt: string;
  }[];
  return {
    total,
    page,
    bytes: (
      sqlite.prepare("SELECT COALESCE(sum(bytes),0) AS n FROM media").get() as {
        n: number;
      }
    ).n,
    items: rows.map((row) => ({
      ...row,
      url: `/media/${row.id}.webp`,
      references: mediaReferences(row.id),
    })),
  };
}
export async function deleteMedia(id: string) {
  if (mediaReferences(id).length)
    throw new HttpError(
      409,
      "This image is used by an article, draft, history or page. It cannot be deleted.",
    );
  const deleted = sqlite.prepare("DELETE FROM media WHERE id=?").run(id);
  if (!deleted.changes) throw new HttpError(404, "Image not found");
  try {
    await unlink(join(mediaDirectory(), `${id}.webp`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { ok: true };
}
export function yearReview(year: string) {
  const articles = sqlite
    .prepare(
      "SELECT id,slug,title,tags,publishedAt FROM posts WHERE deletedAt IS NULL AND draft=0 AND hidden=0 AND substr(publishedAt,1,4)=? ORDER BY publishedAt DESC",
    )
    .all(year) as {
    id: number;
    slug: string;
    title: string;
    tags: string;
    publishedAt: string;
  }[];
  const topics: Record<string, number> = Object.create(null);
  articles.forEach((post) =>
    JSON.parse(post.tags).forEach(
      (tag: string) => (topics[tag] = (topics[tag] || 0) + 1),
    ),
  );
  const projects = sqlite
    .prepare(
      "SELECT slug,name,completedAt FROM projects WHERE substr(completedAt,1,4)=? ORDER BY completedAt DESC",
    )
    .all(year) as { slug: string; name: string; completedAt: string }[];
  const views = (
    sqlite
      .prepare(
        "SELECT COALESCE(sum(v.views),0) AS n FROM post_view_daily v JOIN posts p ON p.id=v.postId WHERE p.draft=0 AND p.hidden=0 AND p.deletedAt IS NULL AND substr(v.day,1,4)=?",
      )
      .get(year) as { n: number }
  ).n;
  return {
    articles,
    projects,
    topics: Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    views,
  };
}
