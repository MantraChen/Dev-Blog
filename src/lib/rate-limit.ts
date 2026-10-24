import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

/** Atomic and persistent across processes sharing the same local SQLite file. */
export class RateLimiter {
  private nextSweep = 0;
  constructor(private database: Database.Database, private namespace: string,
    private limit: number, private windowMs: number, private maxKeys = 10_000) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const hashedKey = createHash("sha256").update(key).digest("hex");
    return this.database.transaction(() => {
      if (now >= this.nextSweep) {
        this.database.prepare("DELETE FROM rate_limits WHERE expires <= ?").run(now);
        this.nextSweep = now + Math.min(this.windowMs, 60_000);
      }
      const existing = this.database.prepare("SELECT count,expires FROM rate_limits WHERE namespace=? AND key=?")
        .get(this.namespace, hashedKey) as { count: number; expires: number } | undefined;
      if (existing && existing.expires > now) {
        const allowed = existing.count < this.limit;
        if (allowed) this.database.prepare("UPDATE rate_limits SET count=count+1 WHERE namespace=? AND key=?").run(this.namespace, hashedKey);
        return { allowed, retryAfterSeconds: Math.max(1, Math.ceil((existing.expires - now) / 1000)) };
      }
      if (!existing && (this.database.prepare("SELECT count(*) AS n FROM rate_limits WHERE namespace=?").get(this.namespace) as { n: number }).n >= this.maxKeys) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(Math.min(this.windowMs, 60_000) / 1000)) };
      }
      this.database.prepare("INSERT INTO rate_limits(namespace,key,count,expires) VALUES(?,?,1,?) ON CONFLICT(namespace,key) DO UPDATE SET count=1,expires=excluded.expires")
        .run(this.namespace, hashedKey, now + this.windowMs);
      return { allowed: true, retryAfterSeconds: Math.max(1, Math.ceil(this.windowMs / 1000)) };
    }).immediate();
  }

  clear(key: string) {
    this.database.prepare("DELETE FROM rate_limits WHERE namespace=? AND key=?")
      .run(this.namespace, createHash("sha256").update(key).digest("hex"));
  }
}
