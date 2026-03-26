import type { posts, projects, statuses } from "./schema";

// ─── Row-level types (full DB row) ──────────────────────────────────
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Status = typeof statuses.$inferSelect;
export type NewStatus = typeof statuses.$inferInsert;

// ─── Frontend data contracts ────────────────────────────────────────
export interface PostListItem {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  publishedAt: string;
}

export interface PostDetail extends PostListItem {
  content: string;
  updatedAt: string;
}

export interface ProjectItem {
  id: number;
  name: string;
  description: string;
  techStack: string[];
  demoUrl: string | null;
  repoUrl: string | null;
}

export interface StatusItem {
  id: number;
  text: string;
  createdAt: string;
}
