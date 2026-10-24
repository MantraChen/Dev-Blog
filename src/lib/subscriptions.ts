import { sqlite } from "../db";
import { z } from "zod";
import { languageSchema } from "./languages";
export const feedFilters = z.object({
  tag: z.string().trim().max(50).default(""),
  category: z.string().trim().max(60).default(""),
  series: z.string().trim().max(100).default(""),
  language: z.union([languageSchema, z.literal("")]).default(""),
});
export function feedPosts(filters: z.infer<typeof feedFilters>) {
  const clauses = ["draft=0", "hidden=0", "deletedAt IS NULL"],
    args: string[] = [];
  for (const column of ["category", "series", "language"] as const)
    if (filters[column]) {
      clauses.push(`${column}=?`);
      args.push(filters[column]);
    }
  if (filters.tag) {
    clauses.push("id IN (SELECT postId FROM post_topics WHERE tag=?)");
    args.push(filters.tag);
  }
  return sqlite
    .prepare(
      `SELECT title,slug,description,publishedAt FROM posts WHERE ${clauses.join(" AND ")} ORDER BY publishedAt DESC,id DESC LIMIT 200`,
    )
    .all(...args) as {
    title: string;
    slug: string;
    description: string;
    publishedAt: string;
  }[];
}
export function subscriptionChoices() {
  const rows = sqlite
    .prepare(
      "SELECT tags,category,series,language FROM posts WHERE draft=0 AND hidden=0 AND deletedAt IS NULL",
    )
    .all() as {
    tags: string;
    category: string;
    series: string | null;
    language: string;
  }[];
  const unique = (values: (string | null)[]) =>
    [...new Set(values.filter(Boolean) as string[])].sort();
  return {
    tags: unique(rows.flatMap((row) => JSON.parse(row.tags))),
    categories: unique(rows.map((row) => row.category)),
    series: unique(rows.map((row) => row.series)),
    languages: unique(rows.map((row) => row.language)),
  };
}
