import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Rollup triggers preserve totals. Limit background deletions to short batches. */
export function maintain(db, { now = Date.now(), limit = 2000, apply = false } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid maintenance batch size");
  const day = days => new Date(now - days * 86400_000).toISOString().slice(0, 10);
  // These table/column names are constants, never caller input.
  const jobs = [
    ["post_views", "id", "createdAt", day(30)],
    ["reactions", "id", "createdAt", day(90)],
    ["audit_logs", "id", "createdAt", day(90)],
    ["admin_sessions", "id", "expiresAt", new Date(now).toISOString()],
  ];
  const run = () => {
    // Fail closed if migration/rollup setup is missing; never prune unaggregated data.
    for (const name of ["post_view_rollup", "reaction_rollup"]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name)) throw new Error("Run database migrations before maintenance");
    }
    const result = {};
    for (const [table, key, field, cutoff] of jobs) {
      if (apply) result[table] = db.prepare(`DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE ${field} < ? ORDER BY ${field} LIMIT ?)`).run(cutoff,limit).changes;
      else result[table] = db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${field} < ?`).get(cutoff).n;
    }
    if (apply) result.rate_limits = db.prepare("DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE expires <= ? LIMIT ?)").run(now,limit).changes;
    else result.rate_limits = db.prepare("SELECT count(*) AS n FROM rate_limits WHERE expires <= ?").get(now).n;
    return result;
  };
  return apply ? db.transaction(run).immediate() : run();
}

export async function maintainFile(filename, apply = false) {
  const db = new Database(resolve(filename), { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    const before = maintain(db);
    console.log("Eligible records:", before);
    if (!apply) return before;
    const folder = resolve(process.env.BACKUP_DIR || `${filename}.backups`);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const backup = resolve(folder, `${Date.now()}-maintenance-${crypto.randomUUID()}.db`);
    await db.backup(backup);
    const snapshot = new Database(backup, { readonly: true });
    try { if (snapshot.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup integrity check failed"); }
    finally { snapshot.close(); }
    console.log("Verified backup:", backup);
    // Bounded CLI run; schedule again if a very large historical backlog remains.
    for (let batch = 0; batch < 100; batch++) {
      if (Object.values(maintain(db, { apply: true, limit: 10000 })).every(value => value === 0)) break;
      await new Promise(resolve => setImmediate(resolve));
    }
    console.log("Remaining:", maintain(db));
    db.pragma("wal_checkpoint(PASSIVE)");
    return before;
  } finally { db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  maintainFile(process.env.DATABASE_PATH || "data.db", process.argv.includes("--apply"))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
