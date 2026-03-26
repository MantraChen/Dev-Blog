import { desc } from "drizzle-orm";
import { db } from ".";
import { posts, projects, statuses } from "./schema";
import type { PostListItem, ProjectItem, StatusItem } from "./types";

export async function getPostList(): Promise<PostListItem[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      tags: posts.tags,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .orderBy(desc(posts.publishedAt));

  return rows;
}

export async function getProjectList(): Promise<ProjectItem[]> {
  const rows = await db
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

  return rows;
}

export async function getLatestStatuses(
  limit = 20,
): Promise<StatusItem[]> {
  const rows = await db
    .select({
      id: statuses.id,
      text: statuses.text,
      createdAt: statuses.createdAt,
    })
    .from(statuses)
    .orderBy(desc(statuses.createdAt))
    .limit(limit);

  return rows;
}
