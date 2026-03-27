CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
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
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`level` integer DEFAULT 3 NOT NULL,
	`iconSlug` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline` (
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
