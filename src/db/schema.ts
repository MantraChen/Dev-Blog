import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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

// ─── Skills ──────────────────────────────────────────────────────────
export const skills = sqliteTable("skills", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  category: text().notNull(), // Languages, Frameworks, Tools, Cloud, etc.
  level: int().notNull().default(3), // 1-5 proficiency
  iconSlug: text(), // for devicon/simpleicons lookup
  sortOrder: int().notNull().default(0),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Timeline ────────────────────────────────────────────────────────
export const timeline = sqliteTable("timeline", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  description: text().notNull(),
  type: text().notNull(), // career, education, milestone, learning
  date: text().notNull(), // ISO date string
  tags: text({ mode: "json" }).$type<string[]>(),
  url: text(),
  sortOrder: int().notNull().default(0),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Posts ───────────────────────────────────────────────────────────
export const posts = sqliteTable("posts", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  slug: text().notNull().unique(),
  description: text().notNull().default(""),
  content: text().notNull().default(""),
  tags: text({ mode: "json" }).notNull().$type<string[]>().default([]),
  featured: int({ mode: "boolean" }).notNull().default(false),
  draft: int({ mode: "boolean" }).notNull().default(true),
  publishedAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text(),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Admin Sessions ──────────────────────────────────────────────────
export const adminSessions = sqliteTable("admin_sessions", {
  id: text().primaryKey(), // crypto.randomUUID()
  expiresAt: text().notNull(),
  createdAt: text()
    .notNull()
    .default(sql`(datetime('now'))`),
});
