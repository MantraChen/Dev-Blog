import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { migrate } from "../scripts/migrate.mjs";

const directory = mkdtempSync(join(tmpdir(), "devblog-http-test-"));
const database = join(directory, "test.db");
const db = new Database(database);
migrate(db);
const insert = db.prepare("INSERT INTO posts(title, slug, content, description, tags, draft, hidden, coverImage, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
for (let i = 1; i <= 25; i++) insert.run(`Public ${i}`, `public-${i}`, "## 中文标题\n\nHello world\n\n$$\\sqrt{x}$$", "Description", '["test"]', 0, 0, "https://howielog.com/icon-512.png", "2026-10-25T00:00:00.000Z");
insert.run("Secret", "draft", "private", "", "[]", 1, 0, null, "2026-10-25T00:00:00.000Z");
insert.run("Hidden", "hidden", "unlisted", "", "[]", 0, 1, null, "2026-10-25T00:00:00.000Z");
db.close();
const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const password = crypto.randomUUID();
const child = spawn(process.execPath, ["dist/server/entry.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: database, ADMIN_PASSWORD_HASH: bcrypt.hashSync(password, 4) },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
const get = async (path, options = {}) => {
  try { return await fetch(origin + path, { redirect: "manual", ...options }); }
  catch (error) { throw new Error(`${options.method || "GET"} ${path} failed. Server output:\n${output}`, { cause: error }); }
};
const post = (path, body, headers = {}) => get(path, { method: "POST", headers: { "Content-Type": "application/json", origin, ...headers }, body: JSON.stringify(body) });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await get("/api/health")).ok; } catch {}
    if (ready) break;
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  for (const path of ["/blog/no-such-post", "/blog/draft", "/404"]) assert.equal((await get(path)).status, 404, path);
  const article = await get("/blog/public-1");
  assert.equal(article.status, 200);
  assert.equal(article.headers.get("cache-control"), "no-cache");
  const html = await article.text();
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /katex/);
  assert.match(html, /id="中文标题"/);
  const hidden = await get("/blog/hidden");
  assert.match(hidden.headers.get("cache-control"), /no-store/);
  assert.match(await hidden.text(), /name="robots" content="noindex, nofollow"/);
  const search = await get("/api/posts/search?q=Public&tag=test&page=2");
  const results = await search.json();
  assert.equal(search.headers.get("x-total-count"), "25");
  assert.equal(results.length, 5);
  assert.ok(results.every(post => post.readingTime >= 1 && post.coverImage && !("content" in post)));
  for (const path of ["/rss.xml", "/sitemap.xml"]) {
    const response = await get(path); assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /\/blog\/(draft|hidden)/);
  }
  assert.equal((await post("/api/posts/views", { slug: "draft" })).status, 404);
  assert.equal((await post("/api/reactions", { slug: "missing", emoji: "👍" })).status, 404);
  const visit = await post("/api/posts/views", { slug: "public-1" });
  const visitorCookie = visit.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await post("/api/posts/views", { slug: "public-1" }, { cookie: visitorCookie })).json()).views, 1);
  assert.equal((await get("/api/posts")).status, 401);
  assert.equal((await get("/admin", { headers: { cookie: "admin_session=%E0%A4%A" } })).status, 302);
  assert.equal((await post("/api/auth/login", { password }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await get("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
  const login = await post("/api/auth/login", { password });
  assert.equal(login.status, 200, await login.clone().text());
  assert.match(login.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const admin = await get("/api/posts", { headers: { cookie } });
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get("cache-control"), /no-store/);
  assert.equal((await post("/api/posts", { title: "Duplicate", slug: "public-1" }, { cookie })).status, 409);
  assert.equal((await get("/api/posts/99999", { method: "DELETE", headers: { cookie, origin } })).status, 404);
  assert.equal((await get("/api/posts/1abc", { method: "DELETE", headers: { cookie, origin } })).status, 400);
  assert.equal((await post("/api/posts", { title: "Bad date", slug: "bad-date", publishedAt: "no-date" }, { cookie })).status, 400);
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 18; i++) controller.enqueue(new Uint8Array(65536)); controller.close(); } });
  const large = await get("/api/posts/preview", { method: "POST", headers: { "content-type": "application/json", cookie, origin }, body: stream, duplex: "half" });
  assert.equal(large.status, 413);
  assert.equal((await post("/api/auth/logout", {}, { cookie })).status, 200);
  assert.equal((await get("/api/posts", { headers: { cookie } })).status, 401);
  for (let i = 0; i < 5; i++) await post("/api/auth/login", { password: "incorrect" });
  assert.equal((await post("/api/auth/login", { password: "incorrect" })).status, 429);
  assert.equal((await get("/api/health")).status, 200);
  console.log("PASS: production HTTP smoke checks (pages, SEO, pagination, privacy, authentication, CSRF, payload limits, CRUD, views and rate limits)");
} finally {
  const exited = once(child, "exit");
  if (child.exitCode === null) { child.kill(); await exited; }
  rmSync(directory, { recursive: true, force: true });
}
