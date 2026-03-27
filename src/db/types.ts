import type {
  projects,
  statuses,
  skills,
  timeline,
  adminSessions,
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

export type AdminSession = typeof adminSessions.$inferSelect;

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
