import { eq } from "drizzle-orm";
import { db, sqlite } from "./index";
import { posts } from "./schema";
import { createPost, updatePost } from "./queries";
import { recordRevision } from "./post-history";
import { createPostSchema } from "../lib/validation";
import {
  emptyEditorData,
  editorDataSchema,
  toEditorData,
  type EditorData,
  type EditorDraft,
  type DraftSummary,
} from "../lib/editor-data";
import { HttpError } from "../lib/http-error";

type DraftRow = Omit<EditorDraft, "data"> & { data: string };
const decode = (row: DraftRow): EditorDraft => ({
  ...row,
  data: editorDataSchema.parse(JSON.parse(row.data)),
});

export function getDraft(id: string): EditorDraft {
  const row = sqlite.prepare("SELECT * FROM post_drafts WHERE id=?").get(id) as
    DraftRow | undefined;
  if (!row) throw new HttpError(404, "Draft not found");
  if (
    row.postId &&
    sqlite
      .prepare("SELECT 1 FROM posts WHERE id=? AND deletedAt IS NOT NULL")
      .get(row.postId)
  )
    throw new HttpError(409, "Restore the article from Trash before editing.");
  return decode(row);
}

export function listDrafts(): DraftSummary[] {
  return sqlite
    .prepare(
      "SELECT id, postId, json_extract(data, '$.title') AS title, updatedAt FROM post_drafts WHERE postId IS NULL OR postId IN (SELECT id FROM posts WHERE deletedAt IS NULL) ORDER BY updatedAt DESC LIMIT 200",
    )
    .all() as DraftSummary[];
}

export function openDraft(id: string, postId?: number): EditorDraft {
  return sqlite
    .transaction(() => {
      const existing = sqlite
        .prepare(
          postId
            ? "SELECT * FROM post_drafts WHERE postId=?"
            : "SELECT * FROM post_drafts WHERE id=?",
        )
        .get(postId || id) as DraftRow | undefined;
      if (existing) return getDraft(existing.id);
      const post = postId
        ? db.select().from(posts).where(eq(posts.id, postId)).get()
        : undefined;
      if (postId && (!post || post.deletedAt))
        throw new HttpError(404, "Post not found");
      if (post) recordRevision(post);
      if (
        (
          sqlite.prepare("SELECT count(*) AS n FROM post_drafts").get() as {
            n: number;
          }
        ).n >= 200
      ) {
        throw new HttpError(
          409,
          "Keep at most 200 working drafts. Publish or discard an old draft first.",
        );
      }
      sqlite
        .prepare(
          "INSERT INTO post_drafts(id, postId, baseVersion, data, updatedAt) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          id,
          postId || null,
          post?.version || null,
          JSON.stringify(post ? toEditorData(post) : emptyEditorData()),
          new Date().toISOString(),
        );
      return getDraft(id);
    })
    .immediate();
}

export function saveDraft(
  id: string,
  version: number,
  data: EditorData,
): EditorDraft {
  return sqlite
    .transaction(() => {
      const draft = getDraft(id);
      if (draft.version !== version)
        throw new HttpError(
          409,
          "This draft changed in another tab. Reload the server draft before saving again.",
        );
      if (
        draft.postId &&
        sqlite
          .prepare("SELECT 1 FROM posts WHERE id=? AND deletedAt IS NOT NULL")
          .get(draft.postId)
      )
        throw new HttpError(
          409,
          "Restore the article from Trash before editing.",
        );
      sqlite
        .prepare(
          "UPDATE post_schedules SET status='cancelled',error='Draft edited; schedule again.' WHERE draftId=? AND status='pending'",
        )
        .run(id);
      sqlite
        .prepare(
          "UPDATE post_drafts SET data=?, version=version+1, updatedAt=? WHERE id=?",
        )
        .run(JSON.stringify(data), new Date().toISOString(), id);
      return getDraft(id);
    })
    .immediate();
}

export function discardDraft(id: string, version: number) {
  return sqlite
    .transaction(() => {
      const draft = getDraft(id);
      if (draft.version !== version)
        throw new HttpError(
          409,
          "This draft changed in another tab. Reload before discarding it.",
        );
      sqlite.prepare("DELETE FROM post_drafts WHERE id=?").run(id);
    })
    .immediate();
}

export function publishDraft(
  id: string,
  version: number,
  scheduledAt?: string,
) {
  return sqlite
    .transaction(() => {
      const draft = getDraft(id);
      if (draft.version !== version)
        throw new HttpError(
          409,
          "The draft changed. Reload before publishing.",
        );
      const existing = draft.postId
        ? db.select().from(posts).where(eq(posts.id, draft.postId)).get()
        : null;
      if (
        draft.postId &&
        (!existing ||
          existing.deletedAt ||
          existing.version !== draft.baseVersion)
      ) {
        throw new HttpError(
          409,
          "The published post changed after this draft was opened. Compare and merge changes before publishing.",
        );
      }
      const parsed = createPostSchema.safeParse({
        ...draft.data,
        draft: false,
        publishedAt:
          !existing && scheduledAt ? scheduledAt : draft.data.publishedAt,
        tags: draft.data.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        coverImage: draft.data.coverImage || null,
        series: draft.data.series || null,
      });
      if (!parsed.success)
        throw new HttpError(
          400,
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        );
      const [post] = existing
        ? updatePost(existing.id, parsed.data)
        : createPost(parsed.data);
      sqlite.prepare("DELETE FROM post_drafts WHERE id=?").run(id);
      sqlite
        .prepare(
          "INSERT INTO audit_logs(action, resource, resourceId) VALUES ('post.publish', 'post', ?)",
        )
        .run(String(post.id));
      return post;
    })
    .immediate();
}

export function listRevisions(postId: number) {
  return sqlite
    .prepare(
      "SELECT id, version, savedAt, json_extract(data, '$.title') AS title FROM post_revisions WHERE postId=? ORDER BY id DESC LIMIT 30",
    )
    .all(postId) as {
    id: number;
    version: number;
    savedAt: string;
    title: string;
  }[];
}

export function getRevision(postId: number, revisionId: number) {
  const revision = sqlite
    .prepare(
      "SELECT id, version, data, savedAt FROM post_revisions WHERE postId=? AND id=?",
    )
    .get(postId, revisionId) as
    { id: number; version: number; data: string; savedAt: string } | undefined;
  if (!revision) throw new HttpError(404, "Revision not found");
  return {
    ...revision,
    data: editorDataSchema.parse(JSON.parse(revision.data)),
  };
}

export function restoreRevision(
  id: string,
  version: number,
  revisionId: number,
) {
  return sqlite
    .transaction(() => {
      const draft = getDraft(id);
      if (!draft.postId)
        throw new HttpError(404, "This draft has no published history yet");
      return saveDraft(id, version, getRevision(draft.postId, revisionId).data);
    })
    .immediate();
}
