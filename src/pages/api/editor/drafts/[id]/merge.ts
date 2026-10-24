import { z } from "zod";
import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { getDraft, saveDraft } from "@/db/editor";
import { sqlite, db } from "@/db";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorDataSchema, toEditorData } from "@/lib/editor-data";
import { HttpError } from "@/lib/http-error";
export const GET = adminEndpoint(({ params }) => {
  const draft = getDraft(params.id!);
  const post = draft.postId
    ? db.select().from(posts).where(eq(posts.id, draft.postId)).get()
    : null;
  const previous = draft.postId
    ? (sqlite
        .prepare("SELECT data FROM post_revisions WHERE postId=? AND version=?")
        .get(draft.postId, draft.baseVersion) as { data: string } | undefined)
    : undefined;
  return Response.json({
    draft,
    published:
      post && !post.deletedAt && post.version !== draft.baseVersion
        ? {
            version: post.version,
            data: toEditorData(post),
            base: previous
              ? editorDataSchema.parse(JSON.parse(previous.data))
              : null,
          }
        : null,
  });
});
export const POST = adminEndpoint(async ({ params, request }) => {
  const input = await body(
    request,
    z.object({
      version: z.number().int().positive(),
      postVersion: z.number().int().positive().optional(),
      data: editorDataSchema,
    }),
  );
  const result = sqlite
    .transaction(() => {
      const draft = getDraft(params.id!);
      if (input.postVersion) {
        if (
          !draft.postId ||
          !sqlite
            .prepare(
              "SELECT 1 FROM posts WHERE id=? AND version=? AND deletedAt IS NULL",
            )
            .get(draft.postId, input.postVersion)
        )
          throw new HttpError(
            409,
            "Published article changed again. Reopen the merge.",
          );
        sqlite
          .prepare("UPDATE post_drafts SET baseVersion=? WHERE id=?")
          .run(input.postVersion, draft.id);
      }
      return saveDraft(draft.id, input.version, input.data);
    })
    .immediate();
  return Response.json(result);
});
