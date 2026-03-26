import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Posts ───────────────────────────────────────────────────────────
export const posts = sqliteTable("posts", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  slug: text().notNull().unique(),
  content: text().notNull(),
  tags: text({ mode: "json" }).notNull().$type<string[]>(),
  publishedAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Projects ────────────────────────────────────────────────────────
export const projects = sqliteTable("projects", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  description: text().notNull(),
  techStack: text({ mode: "json" }).notNull().$type<string[]>(),
  demoUrl: text(),
  repoUrl: text(),
  sortOrder: int().notNull().default(0),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Status ──────────────────────────────────────────────────────────
export const statuses = sqliteTable("statuses", {
  id: int().primaryKey({ autoIncrement: true }),
  text: text().notNull(),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});
