import { and, asc, desc, eq, lt, gt, or, count, sql, inArray } from "drizzle-orm";
import { db, sqlite } from ".";
import { executeSearch, searchInWorker } from "../lib/post-search";
import { projects, posts, postViews, statuses, skills, timeline, friends, reactions, adminSessions, auditLogs } from "./schema";
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
  NewFriend,
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

export async function getPublishedPosts(limit = 20): Promise<PostItem[]> {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      coverImage: posts.coverImage,
      content: posts.content,
      tags: posts.tags,
      series: posts.series,
      featured: posts.featured,
      draft: posts.draft,
      hidden: posts.hidden,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(and(eq(posts.draft, false), eq(posts.hidden, false)))
    .orderBy(desc(posts.publishedAt), desc(posts.id)).limit(Math.max(1, Math.min(limit, 100)));
}

export async function getAllPosts(): Promise<PostItem[]> {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      coverImage: posts.coverImage,
      content: posts.content,
      tags: posts.tags,
      series: posts.series,
      featured: posts.featured,
      draft: posts.draft,
      hidden: posts.hidden,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .orderBy(desc(posts.publishedAt));
}

const publicPosts = and(eq(posts.draft, false), eq(posts.hidden, false));

export async function getPublishedPostMetadata() {
  return db.select({ id: posts.id, slug: posts.slug, title: posts.title, description: posts.description,
    tags: posts.tags, publishedAt: posts.publishedAt, updatedAt: posts.updatedAt }).from(posts)
    .where(publicPosts).orderBy(desc(posts.publishedAt), desc(posts.id));
}

export async function getPublicPostPage(options: { query?: string; tag?: string; page?: number } = {}) {
  const query = (options.query || "").trim().slice(0, 200);
  const tag = (options.tag || "").trim().slice(0, 50);
  if (query) {
    const parameters = { query, tag, page: options.page };
    const result = sqlite.name === ":memory:" ? executeSearch(sqlite, parameters) : await searchInWorker(sqlite.name, parameters);
    const items = result.ids.length ? await db.select().from(posts).where(and(publicPosts, inArray(posts.id, result.ids)))
      .orderBy(desc(posts.publishedAt), desc(posts.id)) : [];
    return { posts: items, total: result.total, page: result.page, pageSize: result.pageSize };
  }
  const condition = and(publicPosts,
    tag ? sql`EXISTS (SELECT 1 FROM json_each(${posts.tags}) WHERE value = ${tag})` : undefined);
  const total = db.select({ count: count() }).from(posts).where(condition).get()!.count;
  const pageSize = 20;
  const page = Math.max(1, Math.min(Number.isSafeInteger(options.page) ? options.page! : 1, Math.max(1, Math.ceil(total / pageSize))));
  const items = await db.select().from(posts).where(condition)
    .orderBy(desc(posts.publishedAt), desc(posts.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { posts: items, total, page, pageSize };
}

export async function getAdjacentPosts(slug: string): Promise<{ prev: Pick<PostItem, "title" | "slug"> | null; next: Pick<PostItem, "title" | "slug"> | null }> {
  const current = db.select({ id: posts.id, publishedAt: posts.publishedAt }).from(posts).where(and(publicPosts, eq(posts.slug, slug))).get();
  if (!current) return { prev: null, next: null };
  const newer = or(gt(posts.publishedAt, current.publishedAt), and(eq(posts.publishedAt, current.publishedAt), gt(posts.id, current.id)));
  const older = or(lt(posts.publishedAt, current.publishedAt), and(eq(posts.publishedAt, current.publishedAt), lt(posts.id, current.id)));
  return {
    prev: db.select({ slug: posts.slug, title: posts.title }).from(posts).where(and(publicPosts, newer)).orderBy(asc(posts.publishedAt), asc(posts.id)).limit(1).get() ?? null,
    next: db.select({ slug: posts.slug, title: posts.title }).from(posts).where(and(publicPosts, older)).orderBy(desc(posts.publishedAt), desc(posts.id)).limit(1).get() ?? null,
  };
}

export async function getPostBySlug(slug: string): Promise<PostItem | null> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      coverImage: posts.coverImage,
      content: posts.content,
      tags: posts.tags,
      series: posts.series,
      featured: posts.featured,
      draft: posts.draft,
      hidden: posts.hidden,
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

export async function getPublicPostIdentity(slug: string) {
  return db.select({ id: posts.id, slug: posts.slug }).from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.draft, false))).get();
}

export async function recordPostView(postId: number, slug: string, visitorKey: string, viewBucket: number) {
  return db.insert(postViews).values({ postId, slug, visitorKey, viewBucket }).onConflictDoNothing();
}

export async function getPostViewCount(slug: string): Promise<number> {
  return (sqlite.prepare("SELECT COALESCE(sum(v.views),0) AS n FROM post_view_daily v JOIN posts p ON p.id=v.postId WHERE p.slug=?").get(slug) as { n: number }).n;
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

// ─── Friends (Blogroll) ─────────────────────────────────────────────

export async function getFriendList() {
  return db
    .select()
    .from(friends)
    .orderBy(friends.sortOrder);
}

export async function createFriend(data: NewFriend) {
  return db.insert(friends).values(data).returning();
}

export async function updateFriend(id: number, data: Partial<NewFriend>) {
  return db.update(friends).set(data).where(eq(friends.id, id)).returning();
}

export async function deleteFriend(id: number) {
  return db.delete(friends).where(eq(friends.id, id));
}

// ─── Reactions ──────────────────────────────────────────────────────

export async function addReaction(postId: number, slug: string, emoji: string, visitorKey: string) {
  return db.insert(reactions).values({ postId, slug, emoji, visitorKey }).onConflictDoNothing();
}

export async function getReactionCounts(slug: string): Promise<Record<string, number>> {
  const rows = sqlite.prepare("SELECT r.emoji,r.count FROM reaction_totals r JOIN posts p ON p.id=r.postId WHERE p.slug=?").all(slug) as { emoji: string; count: number }[];
  return Object.fromEntries(rows.map(row => [row.emoji,row.count]));
}

// ─── Stats ──────────────────────────────────────────────────────────

export async function getTotalViews(): Promise<number> {
  return (sqlite.prepare("SELECT COALESCE(sum(views),0) AS n FROM post_view_daily").get() as { n: number }).n;
}

export async function getTopPosts(limit = 10) {
  return sqlite.prepare("SELECT p.slug,p.title,sum(v.views) AS views FROM post_view_daily v JOIN posts p ON p.id=v.postId GROUP BY p.id ORDER BY views DESC,p.id DESC LIMIT ?")
    .all(Math.max(1,Math.min(limit,100))) as { slug: string; title: string; views: number }[];
}

export async function getViewsByDay(days = 30) {
  return sqlite.prepare("SELECT day AS date,sum(views) AS views FROM post_view_daily WHERE day >= ? AND day != 'unknown' GROUP BY day ORDER BY day")
    .all(new Date(Date.now() - days * 86400_000).toISOString().slice(0,10)) as { date: string; views: number }[];
}

// ─── Series ─────────────────────────────────────────────────────────

export async function getPostsBySeries(series: string): Promise<Pick<PostItem, "title" | "slug">[]> {
  return db
    .select({ title: posts.title, slug: posts.slug })
    .from(posts)
    .where(and(publicPosts, eq(posts.series, series)))
    .orderBy(posts.publishedAt);
}
