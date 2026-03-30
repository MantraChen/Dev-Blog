import type {
  projects,
  posts,
  statuses,
  skills,
  timeline,
  friends,
  reactions,
  adminSessions,
  auditLogs,
} from "./schema";

// ─── Row-level types (full DB row) ──────────────────────────────────
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Status = typeof statuses.$inferSelect;
export type NewStatus = typeof statuses.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export type TimelineEntry = typeof timeline.$inferSelect;
export type NewTimelineEntry = typeof timeline.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type Friend = typeof friends.$inferSelect;
export type NewFriend = typeof friends.$inferInsert;

export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;

export type AdminSession = typeof adminSessions.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// ─── Frontend data contracts ────────────────────────────────────────
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

export interface SkillItem {
  id: number;
  name: string;
  category: string;
  level: number;
  iconSlug: string | null;
}

export interface TimelineItem {
  id: number;
  title: string;
  description: string;
  type: string;
  date: string;
  tags: string[] | null;
  url: string | null;
}

export interface PostItem {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImage: string | null;
  content: string;
  tags: string[];
  series: string | null;
  featured: boolean;
  draft: boolean;
  publishedAt: string;
  updatedAt: string | null;
}
