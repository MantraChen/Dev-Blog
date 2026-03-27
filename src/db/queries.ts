import { desc, eq, lt } from "drizzle-orm";
import { db } from ".";
import { projects, statuses, skills, timeline, adminSessions } from "./schema";
import type {
  ProjectItem,
  StatusItem,
  SkillItem,
  TimelineItem,
  NewProject,
  NewSkill,
  NewTimelineEntry,
} from "./types";

// ─── Projects ────────────────────────────────────────────────────────

export async function getProjectList(): Promise<ProjectItem[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      techStack: projects.techStack,
      demoUrl: projects.demoUrl,
      repoUrl: projects.repoUrl,
    })
    .from(projects)
    .orderBy(projects.sortOrder);
}

export async function createProject(data: NewProject) {
  return db.insert(projects).values(data).returning();
}

export async function updateProject(
  id: number,
  data: Partial<NewProject>,
) {
  return db.update(projects).set(data).where(eq(projects.id, id)).returning();
}

export async function deleteProject(id: number) {
  return db.delete(projects).where(eq(projects.id, id));
}

// ─── Statuses ────────────────────────────────────────────────────────

export async function getLatestStatuses(
  limit = 20,
): Promise<StatusItem[]> {
  return db
    .select({
      id: statuses.id,
      text: statuses.text,
      createdAt: statuses.createdAt,
    })
    .from(statuses)
    .orderBy(desc(statuses.createdAt))
    .limit(limit);
}

export async function createStatus(text: string) {
  return db.insert(statuses).values({ text }).returning();
}

export async function deleteStatus(id: number) {
  return db.delete(statuses).where(eq(statuses.id, id));
}

// ─── Skills ──────────────────────────────────────────────────────────

export async function getSkillList(): Promise<SkillItem[]> {
  return db
    .select({
      id: skills.id,
      name: skills.name,
      category: skills.category,
      level: skills.level,
      iconSlug: skills.iconSlug,
    })
    .from(skills)
    .orderBy(skills.category, skills.sortOrder);
}

export async function createSkill(data: NewSkill) {
  return db.insert(skills).values(data).returning();
}

export async function updateSkill(id: number, data: Partial<NewSkill>) {
  return db.update(skills).set(data).where(eq(skills.id, id)).returning();
}

export async function deleteSkill(id: number) {
  return db.delete(skills).where(eq(skills.id, id));
}

// ─── Timeline ────────────────────────────────────────────────────────

export async function getTimelineList(): Promise<TimelineItem[]> {
  return db
    .select({
      id: timeline.id,
      title: timeline.title,
      description: timeline.description,
      type: timeline.type,
      date: timeline.date,
      tags: timeline.tags,
      url: timeline.url,
    })
    .from(timeline)
    .orderBy(desc(timeline.date));
}

export async function createTimelineEntry(data: NewTimelineEntry) {
  return db.insert(timeline).values(data).returning();
}

export async function updateTimelineEntry(
  id: number,
  data: Partial<NewTimelineEntry>,
) {
  return db
    .update(timeline)
    .set(data)
    .where(eq(timeline.id, id))
    .returning();
}

export async function deleteTimelineEntry(id: number) {
  return db.delete(timeline).where(eq(timeline.id, id));
}

// ─── Admin Sessions ──────────────────────────────────────────────────

export async function createAdminSession(id: string, expiresAt: string) {
  return db.insert(adminSessions).values({ id, expiresAt });
}

export async function getAdminSession(id: string) {
  const rows = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteAdminSession(id: string) {
  return db.delete(adminSessions).where(eq(adminSessions.id, id));
}

export async function cleanExpiredSessions() {
  const now = new Date().toISOString();
  return db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
}
