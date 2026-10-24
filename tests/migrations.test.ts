import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { migrate, pendingMigrations } from "../scripts/migrate.mjs";

test("migration bootstraps a fresh database and is idempotent", () => {
  const db = new Database(":memory:");
  try {
    migrate(db);
    db.prepare("INSERT INTO posts(title, slug) VALUES (?, ?)").run("Keep me", "keep-me");
    migrate(db);
    assert.equal((db.prepare("SELECT count(*) AS n FROM posts").get() as { n: number }).n, 1);
    assert.equal(pendingMigrations(db).length, 0);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'friends'").get());
  } finally { db.close(); }
});

test("adopts the old Drizzle schema without dropping content", () => {
  const db = new Database(":memory:");
  try {
    for (const file of ["0000_nervous_komodo", "0001_great_silhouette", "0002_aromatic_the_hood"]) {
      db.exec(readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), "utf8"));
    }
    db.prepare("INSERT INTO posts(title, slug, content) VALUES (?, ?, ?)").run("Original", "original", "Keep this content");
    db.prepare("INSERT INTO post_views(slug) VALUES (?)").run("original");
    migrate(db);
    const row = db.prepare("SELECT content, hidden, coverImage, series FROM posts WHERE slug = 'original'").get();
    assert.deepEqual(row, { content: "Keep this content", hidden: 0, coverImage: null, series: null });
    assert.equal((db.prepare("SELECT postId FROM post_views").get() as { postId: number }).postId, 1);
  } finally { db.close(); }
});
