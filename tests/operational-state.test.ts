import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../scripts/migrate.mjs";
import { maintain } from "../scripts/maintenance.mjs";
import { RateLimiter } from "../src/lib/rate-limit";

test("limit counts survive connections/restarts, isolate namespaces and expire atomically", () => {
  const folder = mkdtempSync(join(tmpdir(),"blog-rate-"));
  const filename = join(folder,"test.db");
  const first = new Database(filename);
  migrate(first);
  const second = new Database(filename);
  try {
    const a = new RateLimiter(first,"login",2,1000);
    const b = new RateLimiter(second,"login",2,1000);
    assert.equal(a.check("ip",0).allowed,true);
    assert.equal(b.check("ip",1).allowed,true);
    assert.equal(new RateLimiter(second,"login",2,1000).check("ip",2).allowed,false);
    assert.equal(new RateLimiter(second,"public",60,1000).check("ip",2).allowed,true);
    assert.equal(b.check("ip",1001).allowed,true);
    a.clear("ip");
    assert.equal(b.check("ip",1002).allowed,true);
  } finally { first.close(); second.close(); rmSync(folder,{recursive:true,force:true}); }
});

test("retention preserves legacy and new totals, deduplicates reactions and cascades deletion", () => {
  const db = new Database(":memory:");
  migrate(db);
  try {
    db.exec("INSERT INTO posts(id,title,slug) VALUES(1,'Post','post')");
    db.exec(`INSERT INTO post_views(postId,slug,createdAt) VALUES(1,'post','2020-01-01'),(1,'post','2026-10-24');
      INSERT INTO reactions(postId,slug,emoji,visitorKey,createdAt) VALUES(1,'post','👍','old','2020-01-01'),(1,'post','👍','new','2026-10-24');
      INSERT OR IGNORE INTO reactions(postId,slug,emoji,visitorKey) VALUES(1,'post','👍','new');
      INSERT INTO audit_logs(action,createdAt) VALUES('login.failed','2020-01-01');`);
    const options = { now: Date.parse('2026-10-25T00:00:00Z') };
    assert.equal(maintain(db,options).post_views,1);
    assert.equal((db.prepare("SELECT count(*) n FROM post_views").get() as { n:number }).n,2);
    assert.equal(maintain(db,{...options,apply:true}).reactions,1);
    assert.equal(maintain(db,{...options,apply:true}).post_views,0);
    assert.deepEqual(db.prepare("SELECT sum(views) n FROM post_view_daily").get(),{n:2});
    assert.deepEqual(db.prepare("SELECT count FROM reaction_totals").get(),{count:2});
    db.exec("DELETE FROM posts WHERE id=1");
    assert.equal(db.prepare("SELECT * FROM post_view_daily").all().length,0);
    assert.equal(db.prepare("SELECT * FROM reaction_totals").all().length,0);
  } finally { db.close(); }
});
