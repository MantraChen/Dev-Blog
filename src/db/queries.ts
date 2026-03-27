import { desc, eq, lt, like, or, count } from "drizzle-orm";
import { db } from ".";
import { projects, posts, postViews, statuses, skills, timeline, adminSessions, auditLogs } from "./schema";
import type {
  ProjectItem,
  PostItem,
  StatusItem,
  SkillItem,
  TimelineItem,
  NewProject,
  NewPost,
  NewSkill,
  NewTimelineEntry,
  NewAuditLog,
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

// ─── Posts ───────────────────────────────────────────────────────────

export async function getPublishedPosts(): Promise<PostItem[]> {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      content: posts.content,
      tags: posts.tags,
      featured: posts.featured,
      draft: posts.draft,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.draft, false))
    .orderBy(desc(posts.publishedAt));
}

export async function getAllPosts(): Promise<PostItem[]> {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      content: posts.content,
      tags: posts.tags,
      featured: posts.featured,
      draft: posts.draft,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .orderBy(desc(posts.publishedAt));
}

export async function searchPosts(query: string): Promise<PostItem[]> {
  const pattern = `%${query}%`;
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      content: posts.content,
      tags: posts.tags,
      featured: posts.featured,
      draft: posts.draft,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(
      or(
        like(posts.title, pattern),
        like(posts.description, pattern),
        like(posts.content, pattern),
      )
    )
    .orderBy(desc(posts.publishedAt));
}

export async function getAdjacentPosts(slug: string): Promise<{ prev: Pick<PostItem, "title" | "slug"> | null; next: Pick<PostItem, "title" | "slug"> | null }> {
  const published = await db
    .select({ slug: posts.slug, title: posts.title, publishedAt: posts.publishedAt })
    .from(posts)
    .where(eq(posts.draft, false))
    .orderBy(desc(posts.publishedAt));

  const idx = published.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? { title: published[idx - 1].title, slug: published[idx - 1].slug } : null,
    next: idx < published.length - 1 ? { title: published[idx + 1].title, slug: published[idx + 1].slug } : null,
  };
}

export async function getPostBySlug(slug: string): Promise<PostItem | null> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      content: posts.content,
      tags: posts.tags,
      featured: posts.featured,
      draft: posts.draft,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPost(data: NewPost) {
  return db.insert(posts).values(data).returning();
}

export async function updatePost(id: number, data: Partial<NewPost>) {
  return db
    .update(posts)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(posts.id, id))
    .returning();
}

export async function deletePost(id: number) {
  return db.delete(posts).where(eq(posts.id, id));
}

// ─── Post Views ─────────────────────────────────────────────────────

export async function recordPostView(slug: string) {
  return db.insert(postViews).values({ slug });
}

export async function getPostViewCount(slug: string): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(postViews)
    .where(eq(postViews.slug, slug));
  return rows[0]?.count ?? 0;
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

// ─── Audit Logs ─────────────────────────────────────────────────────

export async function createAuditLog(data: NewAuditLog) {
  return db.insert(auditLogs).values(data);
}

export async function getAuditLogs(limit = 50) {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
