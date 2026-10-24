import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { migrate } from "../scripts/migrate.mjs";

const directory = mkdtempSync(join(tmpdir(), "devblog-http-test-"));
const database = join(directory, "test.db");
const db = new Database(database);
migrate(db);
const insert = db.prepare("INSERT INTO posts(title, slug, content, description, tags, draft, hidden, coverImage, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
for (let i = 1; i <= 25; i++) insert.run(`Public ${i}`, `public-${i}`, "## 中文标题\n\nHello world\n\n[Related](https://howielog.com/blog/public-2?q=1#heading)\n\n![Legacy image](/icon-512.png)\n\n$$\\sqrt{x}$$", "Description", '["test"]', 0, 0, "https://howielog.com/icon-512.png", "2026-10-25T00:00:00.000Z");
insert.run("Secret", "draft", "private", "", "[]", 1, 0, null, "2026-10-25T00:00:00.000Z");
insert.run("Hidden", "hidden", "unlisted", "", "[]", 0, 1, null, "2026-10-25T00:00:00.000Z");
db.close();
const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const base = (process.env.PUBLIC_BASE_PATH || '/').replace(/\/+$/, '');
const site = process.env.SITE_URL || 'https://howielog.com';
const sessionName = base ? 'howielog_admin_session' : 'admin_session';
const visitorName = base ? 'howielog_visitor' : 'blog_visitor';
const checkLocalLinks = html => {
  for (const [,url] of html.matchAll(/(?:href|src|action|component-url|renderer-url)="(\/[^"\s]*)"/g)) {
    assert.ok(!base || url.startsWith(base + '/'), `URL escaped blog prefix: ${url}`);
  }
};
const password = crypto.randomUUID();
const child = spawn(process.execPath, ["dist/server/entry.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: database, MEDIA_DIR: join(directory, "media"), ADMIN_PASSWORD_HASH: bcrypt.hashSync(password, 4) },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
const get = async (path, options = {}) => {
  try { return await fetch(origin + base + path, { redirect: "manual", ...options }); }
  catch (error) { throw new Error(`${options.method || "GET"} ${path} failed. Server output:\n${output}`, { cause: error }); }
};
const post = (path, body, headers = {}) => get(path, { method: "POST", headers: { "Content-Type": "application/json", origin, ...headers }, body: JSON.stringify(body) });
const checkScriptPolicy = async response => {
  const policy = response.headers.get('content-security-policy');
  const scriptPolicy = policy?.split(';').find(value => value.trim().startsWith('script-src '));
  assert.ok(scriptPolicy, 'Astro must emit a script policy');
  assert.doesNotMatch(scriptPolicy, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /frame-ancestors 'none'/);
  for (const [,attrs,body] of (await response.clone().text()).matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=|application\/ld\+json/.test(attrs) || !body.trim()) continue;
    const hash = createHash('sha256').update(body).digest('base64');
    assert.ok(scriptPolicy.includes(`'sha256-${hash}'`),'Rendered trusted inline script must match the CSP hash');
  }
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await get("/api/health")).ok; } catch {}
    if (ready) break;
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  for (const path of ["/", "/blog", "/archive", "/friends", "/projects", "/skills", "/timeline"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-cache", path);
    await checkScriptPolicy(response);
    checkLocalLinks(await response.clone().text());
  }
  for (const path of ["/blog/no-such-post", "/blog/draft", "/404"]) assert.equal((await get(path)).status, 404, path);
  const article = await get("/blog/public-1");
  assert.equal(article.status, 200);
  await checkScriptPolicy(article);
  await checkScriptPolicy(await get('/admin/login'));
  assert.equal(article.headers.get("cache-control"), "no-cache");
  const html = await article.text();
  checkLocalLinks(html);
  assert.ok(html.includes(`rel="canonical" href="${site}${base}/blog/public-1"`));
  assert.ok(html.includes(`property="og:image" content="${site}${base}/icon-512.png"`));
  assert.ok(html.includes(`href="${base}/blog/public-2?q=1#heading"`));
  assert.ok(html.includes(`src="${base}/icon-512.png"`));
  for (const path of ['/theme.js', '/favicon.svg', '/icon-512.png']) {
    const asset = await get(path);
    assert.equal(asset.status, 200, path);
    assert.doesNotMatch(asset.headers.get('content-type'), /text\/html/);
  }
  const bundledAssets = new Set([...html.matchAll(/(?:src|href|component-url|renderer-url)="([^"\s]*\/_astro\/[^"\s]+)"/g)].map(match => match[1]));
  assert.ok(bundledAssets.size > 0);
  for (const asset of bundledAssets) assert.equal((await get(asset.slice(base.length))).status, 200, asset);
  if (base) {
    assert.equal((await fetch(origin + '/api/health', { redirect: 'manual' })).status, 404);
    assert.ok(html.includes('data-storage-key="howielog:theme"'));
  }
  const robots = await (await get('/robots.txt')).text();
  assert.ok(robots.includes(`Disallow: ${base}/admin`));
  assert.ok(robots.includes(`Sitemap: ${site}${base}/sitemap.xml`));
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
    const xml = await response.text();
    assert.doesNotMatch(xml, /\/blog\/(draft|hidden)/);
    assert.ok(xml.includes(`${site}${base}/blog/public-1`));
    if (base) assert.doesNotMatch(xml, /howielog\.com|dyyjs\.com\/blog\//);
  }
  assert.equal((await post("/api/posts/views", { slug: "draft" })).status, 404);
  assert.equal((await post("/api/reactions", { slug: "missing", emoji: "👍" })).status, 404);
  const visit = await post("/api/posts/views", { slug: "public-1" });
  assert.ok(visit.headers.get('set-cookie').startsWith(visitorName + '='));
  assert.ok(visit.headers.get('set-cookie').includes(`Path=${base}/;`));
  const visitorCookie = visit.headers.get("set-cookie").split(";")[0];
  assert.equal((await (await post("/api/posts/views", { slug: "public-1" }, { cookie: visitorCookie })).json()).views, 1);
  assert.equal((await (await post('/api/posts/views',{slug:'public-1'})).json()).views,1,'Cookie clearing must not inflate network-deduplicated views');
  for (let i=0;i<2;i++) assert.equal((await (await post('/api/reactions',{slug:'public-1',emoji:'👍'})).json())['👍'],1);
  assert.equal((await get("/api/posts")).status, 401);
  const unauthorized = await get('/admin', { headers: { cookie: `${sessionName}=%E0%A4%A` } });
  assert.equal(unauthorized.status, 302);
  assert.equal(unauthorized.headers.get('location'), base + '/admin/login');
  assert.match(unauthorized.headers.get('cache-control'), /no-store/);
  assert.equal((await post("/api/auth/login", { password }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await get("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
  const login = await post("/api/auth/login", { password });
  assert.equal(login.status, 200, await login.clone().text());
  assert.match(login.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(login.headers.get('set-cookie').startsWith(sessionName + '='));
  assert.ok(login.headers.get('set-cookie').includes(`Path=${base}/;`));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await checkScriptPolicy(await get('/admin',{headers:{cookie}}));
  const admin = await get("/api/posts", { headers: { cookie } });
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get("cache-control"), /no-store/);
  assert.equal((await post("/api/posts", { title: "Duplicate", slug: "public-1" }, { cookie })).status, 409);
  assert.equal((await get("/api/posts/99999", { method: "DELETE", headers: { cookie, origin } })).status, 404);
  assert.equal((await get("/api/posts/1abc", { method: "DELETE", headers: { cookie, origin } })).status, 400);
  assert.equal((await post("/api/posts", { title: "Bad date", slug: "bad-date", publishedAt: "no-date" }, { cookie })).status, 400);
  // End-to-end writing workflow: private work, authenticated previews, media and history.
  for (const path of ['/api/editor/drafts', '/api/media']) assert.equal((await get(path)).status, 401);
  const opened = await post('/api/editor/drafts', { id: crypto.randomUUID() }, { cookie });
  assert.equal(opened.status, 200);
  let working = await opened.json();
  const draftPath = `/api/editor/drafts/${working.id}`;
  const saveWorking = data => get(draftPath, { method: 'PUT', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: working.version, data }) });
  assert.equal((await get(draftPath)).status, 401);
  assert.equal((await get(`/admin/preview/${working.id}`)).status, 302);
  assert.equal((await post(draftPath + '/publish', { version: working.version }, { cookie })).status, 400);
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#abc' } }).png().toBuffer();
  const upload = await get('/api/media', { method: 'POST', body: png, headers: { cookie, origin, 'Content-Type': 'image/png' } });
  assert.equal(upload.status, 201, await upload.clone().text());
  const uploaded = await upload.json();
  assert.equal((await get(uploaded.url)).status, 404, 'Draft images are private');
  const privateImage = await get(uploaded.url, { headers: { cookie } });
  assert.equal(privateImage.headers.get('content-type'), 'image/webp');
  assert.match(privateImage.headers.get('cache-control'), /no-store/);
  const saved = await saveWorking({ ...working.data, title: 'Workflow article', slug: 'workflow-article', content: `## Preview heading\n\nFirst published version\n\n![Image](${uploaded.url})`, coverImage: uploaded.url });
  assert.equal(saved.status, 200, await saved.clone().text());
  const priorVersion = working.version;
  working = await saved.json();
  assert.equal((await get(draftPath, { method: 'PUT', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: priorVersion, data: working.data }) })).status, 409);
  assert.equal((await get('/blog/workflow-article')).status, 404);
  const preview = await get(`/admin/preview/${working.id}`, { headers: { cookie } });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('cache-control'), /no-store/);
  assert.match(preview.headers.get('x-robots-tag'), /noindex/);
  await checkScriptPolicy(preview);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /First published version/);
  assert.doesNotMatch(previewHtml, /giscus-container|data-post-slug/);
  checkLocalLinks(previewHtml);
  const publication = await post(draftPath + '/publish', { version: working.version }, { cookie });
  assert.equal(publication.status, 200, await publication.clone().text());
  const published = await publication.json();
  const publicImage = await get(uploaded.url);
  assert.equal(publicImage.status, 200);
  const imageTag = publicImage.headers.get('etag');
  assert.ok(imageTag);
  assert.equal((await get(uploaded.url, { headers: { 'If-None-Match': imageTag } })).status, 304);
  assert.equal((await get(draftPath, { headers: { cookie } })).status, 404);
  working = await (await post('/api/editor/drafts', { id: crypto.randomUUID(), postId: published.id }, { cookie })).json();
  const editPath = `/api/editor/drafts/${working.id}`;
  assert.equal((await get(editPath + '/history')).status, 401);
  const revisions = await (await get(editPath + '/history', { headers: { cookie } })).json();
  working = await (await get(editPath, { method: 'PUT', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: working.version, data: { ...working.data, content: 'Private unreviewed change' } }) })).json();
  assert.doesNotMatch(await (await get('/blog/workflow-article')).text(), /Private unreviewed change/);
  const restored = await post(editPath + '/history', { version: working.version, revisionId: revisions[0].id }, { cookie });
  assert.equal(restored.status, 200);
  working = await restored.json();
  assert.match(working.data.content, /First published version/);
  assert.equal((await post(editPath + '/publish', { version: working.version }, { cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await get(editPath, { method: 'DELETE', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: working.version }) })).status, 200);
  assert.equal((await get(`/api/posts/${published.id}`, { method: 'PUT', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: true }) })).status, 200);
  assert.equal((await get(uploaded.url, { headers: { 'If-None-Match': imageTag } })).status, 404, 'Unpublishing revokes image access even for cached images');
  assert.equal((await get('/api/media', { method: 'POST', body: '<svg/>', headers: { cookie, origin, 'Content-Type': 'image/svg+xml' } })).status, 415);
  const hugeImage = new ReadableStream({ start(controller) { for (let i = 0; i < 129; i++) controller.enqueue(new Uint8Array(65536)); controller.close(); } });
  assert.equal((await get('/api/media', { method: 'POST', body: hugeImage, duplex: 'half', headers: { cookie, origin, 'Content-Type': 'image/png' } })).status, 413);
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 18; i++) controller.enqueue(new Uint8Array(65536)); controller.close(); } });
  const large = await get("/api/posts/preview", { method: "POST", headers: { "content-type": "application/json", cookie, origin }, body: stream, duplex: "half" });
  assert.equal(large.status, 413);
  const logout = await post('/api/auth/logout', {}, { cookie });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get('set-cookie').startsWith(sessionName + '='));
  assert.ok(logout.headers.get('set-cookie').includes(`Path=${base}/;`));
  assert.equal((await get("/api/posts", { headers: { cookie } })).status, 401);
  for (let i = 0; i < 5; i++) await post("/api/auth/login", { password: "incorrect" });
  assert.equal((await post("/api/auth/login", { password: "incorrect" })).status, 429);
  assert.equal((await get("/api/health")).status, 200);
  console.log(`Deployment tested: ${site}${base}/`);
  console.log("PASS: production HTTP smoke checks (pages, SEO, pagination, privacy, authentication, CSRF, payload limits, CRUD, views and rate limits)");
} finally {
  const exited = once(child, "exit");
  if (child.exitCode === null) { child.kill(); await exited; }
  rmSync(directory, { recursive: true, force: true });
}
