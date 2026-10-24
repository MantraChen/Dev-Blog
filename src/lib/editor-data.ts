import { z } from "zod";

// Drafts may be incomplete. Publication uses the stricter post schema.
export const editorDataSchema = z.object({
  title: z.string().max(200), slug: z.string().max(200),
  description: z.string().max(500), content: z.string().max(500_000),
  tags: z.string().max(1200), coverImage: z.string().max(2048),
  series: z.string().max(100), featured: z.boolean(), hidden: z.boolean(),
  publishedAt: z.string().max(40),
});
export type EditorData = z.infer<typeof editorDataSchema>;
export interface EditorDraft {
  id: string; postId: number | null; baseVersion: number | null;
  version: number; data: EditorData; updatedAt: string;
}
export interface DraftSummary {
  id: string; postId: number | null; title: string; updatedAt: string;
}
export const draftVersionSchema = z.object({ version: z.number().int().positive() });
export const saveDraftSchema = draftVersionSchema.extend({ data: editorDataSchema });
export const openDraftSchema = z.object({
  id: z.uuid(), postId: z.number().int().positive().optional(),
});
export const restoreDraftSchema = draftVersionSchema.extend({ revisionId: z.number().int().positive() });

export function toEditorData(post: {
  title: string; slug: string; description: string; content: string; tags: string[];
  coverImage: string | null; series: string | null; featured: boolean; hidden: boolean; publishedAt: string;
}): EditorData {
  const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(post.publishedAt)
    ? post.publishedAt.replace(" ", "T") + "Z" : post.publishedAt;
  return { title: post.title, slug: post.slug, description: post.description, content: post.content,
    tags: post.tags.join(", "), coverImage: post.coverImage || "", series: post.series || "",
    featured: post.featured, hidden: post.hidden, publishedAt: Number.isNaN(Date.parse(date)) ? date : new Date(date).toISOString() };
}

export function emptyEditorData(): EditorData {
  return { title: "", slug: "", description: "", content: "", tags: "", coverImage: "",
    series: "", featured: false, hidden: false, publishedAt: new Date().toISOString() };
}
