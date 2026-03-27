CREATE TABLE `post_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`createdAt` text DEFAULT (datetime('now')) NOT NULL
);
