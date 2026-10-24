import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { maintain } from "../../scripts/maintenance.mjs";

export const sqlite = new Database(process.env.DATABASE_PATH || "data.db");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Keep raw history bounded while retaining daily/all-time aggregates. Small batches
// avoid a large startup transaction. CLI maintenance handles a historical backlog.
if (sqlite.name !== ":memory:") {
  setInterval(() => {
    try { maintain(sqlite, { apply: true }); }
    catch { console.error("Database maintenance failed; check migrations and disk availability."); }
  }, 15 * 60_000).unref();
}
