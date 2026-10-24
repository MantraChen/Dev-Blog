import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../scripts/migrate.mjs";
import { executeSearch, searchInWorker } from "../src/lib/post-search";

test("indexed substring search preserves Chinese, short terms and literal operators after CRUD", () => {
  const db = new Database(":memory:"); migrate(db);
  try {
    db.exec(`INSERT INTO posts(id,title,slug,content,draft) VALUES
      (1,'中文标题','one','SQLite 100% a_b "quoted"',0),(2,'Private','two','SQLite',1);`);
    for (const query of ["中文标题","中文","中","SQLite","100%","%","a_b",'"quoted"']) {
      assert.deepEqual(executeSearch(db,{query,tag:""}).ids,[1],query);
    }
    assert.equal(executeSearch(db,{query:"SQLite OR Private",tag:""}).total,0);
    db.exec("UPDATE posts SET content='replacement' WHERE id=1");
    assert.equal(executeSearch(db,{query:"SQLite",tag:""}).total,0);
    assert.equal(executeSearch(db,{query:"replacement",tag:""}).total,1);
    db.exec("DELETE FROM posts WHERE id=1");
    assert.equal(executeSearch(db,{query:"replacement",tag:""}).total,0);
    db.prepare("INSERT INTO posts_search(posts_search,rank) VALUES('integrity-check',1)").run();
  } finally { db.close(); }
});

test("production file search runs off-thread and bounds the pending queue", async () => {
  const folder=mkdtempSync(join(tmpdir(),"blog-search-"));
  const filename=join(folder,"test.db"); const db=new Database(filename); migrate(db);
  db.exec("INSERT INTO posts(title,slug,content,draft) VALUES('中文','post','indexed content',0)");
  try {
    const tasks = Array.from({length:17},()=>searchInWorker(filename,{query:"中文",tag:""}));
    const results=await Promise.allSettled(tasks);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,16);
    assert.equal(results[16].status,'rejected');
    for (const result of results.slice(0,16)) if (result.status==='fulfilled') assert.deepEqual(result.value.ids,[1]);
  } finally {
    db.close();
    // Worker holds a read connection, so close it before Windows removes the fixture.
    const { closeSearchWorker } = await import('../src/lib/post-search');
    await closeSearchWorker();
    rmSync(folder,{recursive:true,force:true});
  }
});
