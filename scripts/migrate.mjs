import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const baseline = readFileSync(new URL("../migrations/001-baseline.sql", import.meta.url), "utf8");
// Released migrations are immutable. Add a new entry for each schema change.
const migrations = [{
  id: "001-baseline",
  up(db) {
    db.exec(baseline);
    const columns = new Set(db.pragma("table_info(posts)").map(column => column.name));
    for (const [name, definition] of [["coverImage", "TEXT"], ["series", "TEXT"], ["hidden", "INTEGER NOT NULL DEFAULT 0"]]) {
      if (!columns.has(name)) db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${definition}`);
    }
  },
}, {
  id: "002-engagement-identity",
  up(db) {
    for (const table of ["post_views", "reactions"]) {
      const columns = new Set(db.pragma(`table_info(${table})`).map(column => column.name));
      if (!columns.has("postId")) db.exec(`ALTER TABLE ${table} ADD COLUMN postId INTEGER REFERENCES posts(id) ON DELETE CASCADE`);
      db.exec(`UPDATE ${table} SET postId = (SELECT id FROM posts WHERE posts.slug = ${table}.slug) WHERE postId IS NULL`);
    }
    const columns = new Set(db.pragma("table_info(post_views)").map(column => column.name));
    if (!columns.has("visitorKey")) db.exec("ALTER TABLE post_views ADD COLUMN visitorKey TEXT");
    if (!columns.has("viewBucket")) db.exec("ALTER TABLE post_views ADD COLUMN viewBucket INTEGER");
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS post_views_visitor_bucket ON post_views(postId, visitorKey, viewBucket);
      CREATE INDEX IF NOT EXISTS post_views_post_created ON post_views(postId, createdAt);
      CREATE INDEX IF NOT EXISTS post_views_created ON post_views(createdAt);
      CREATE INDEX IF NOT EXISTS reactions_post_emoji ON reactions(postId, emoji);`);
  },
}];

export function pendingMigrations(db) {
  const hasJournal = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_migrations'").get();
  const applied = new Set(hasJournal ? db.prepare("SELECT id FROM app_migrations").all().map(row => row.id) : []);
  return migrations.filter(migration => !applied.has(migration.id));
}

export function migrate(db) {
  db.pragma("foreign_keys = ON");
  db.transaction(() => {
    const pending = pendingMigrations(db);
    db.exec("CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT (datetime('now')))");
    for (const migration of pending) {
      migration.up(db);
      db.prepare("INSERT INTO app_migrations (id) VALUES (?)").run(migration.id);
    }
  }).immediate();
}

export async function migrateFile(filename = process.env.DATABASE_PATH || "data.db") {
  const databasePath = resolve(filename);
  const existed = existsSync(databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  try {
    db.pragma("busy_timeout = 5000");
    const pending = pendingMigrations(db);
    if (!pending.length) { console.log("Database schema is current"); return; }
    if (existed) {
      const backups = resolve(process.env.BACKUP_DIR || `${databasePath}.backups`);
      mkdirSync(backups, { recursive: true });
      const backup = resolve(backups, `${Date.now()}-${crypto.randomUUID()}.db`);
      await db.backup(backup);
      console.log(`Database backup: ${backup}`);
    }
    migrate(db);
    console.log(`Applied: ${pending.map(item => item.id).join(", ")}`);
  } finally { db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  migrateFile().catch(error => { console.error(error); process.exitCode = 1; });
}
