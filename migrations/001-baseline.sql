CREATE TABLE IF NOT EXISTS `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`techStack` text NOT NULL,
	`demoUrl` text,
	`repoUrl` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`level` integer DEFAULT 3 NOT NULL,
	`iconSlug` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `timeline` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`tags` text,
	`url` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`resource` text,
	`resourceId` text,
	`detail` text,
	`ip` text,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`draft` integer DEFAULT true NOT NULL,
	`publishedAt` text DEFAULT (datetime('now')) NOT NULL,
	`updatedAt` text,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `posts_slug_unique` ON `posts` (`slug`);
CREATE TABLE IF NOT EXISTS `post_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
  avatar TEXT, description TEXT, sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, emoji TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
