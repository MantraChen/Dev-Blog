// Disposable GitHub-hosted Linux runner only. Never runs against a real deployment.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  cp,
  chmod,
  chown,
  rm,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { migrate } from "../scripts/migrate.mjs";
if (
  process.platform !== "linux" ||
  process.getuid() !== 0 ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted"
)
  throw new Error(
    "Run only as root on a disposable GitHub-hosted Linux runner.",
  );
const root = await mkdtemp("/var/lib/devblog-rehearsal-"),
  release = join(root, "release"),
  state = join(root, "state"),
  name = "devblog-rehearsal-" + randomBytes(6).toString("hex"),
  appUnit = name + ".service",
  proxyUnit = name + "-proxy.service";
const base = (process.env.PUBLIC_BASE_PATH || "/howielog").replace(/\/+$/, ""),
  origin = "http://127.0.0.1:19642",
  password = randomBytes(24).toString("base64url");
const unitPaths = [
  join("/run/systemd/system", appUnit),
  join("/run/systemd/system", proxyUnit),
];
const command = (binary, args) =>
  execFileSync(binary, args, {
    stdio: "pipe",
    encoding: "utf8",
    timeout: 60000,
  });
const request = (path, options = {}) =>
  fetch(origin + base + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    ...options,
  });
const post = (path, body, cookie) =>
  request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
async function ready() {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await request("/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Service did not become healthy");
}
try {
  await chmod(root, 0o755);
  await mkdir(release, { mode: 0o755 });
  await mkdir(state, { mode: 0o700 });
  for (const item of [
    "dist",
    "scripts",
    "migrations",
    "node_modules",
    "package.json",
  ])
    await cp(resolve(item), join(release, item), { recursive: true });
  const database = join(state, "data.db"),
    db = new Database(database);
  migrate(db);
  db.prepare(
    "INSERT INTO posts(title,slug,content,draft) VALUES ('Linux rehearsal','linux-rehearsal','Restart and restore fixture',0)",
  ).run();
  db.close();
  await chown(state, 65534, 65534);
  await chown(database, 65534, 65534);
  const environment = join(root, "service.env");
  await writeFile(
    environment,
    `NODE_ENV=production\nHOST=127.0.0.1\nPORT=19641\nDATABASE_PATH=${database}\nMEDIA_DIR=${join(state, "media")}\nADMIN_PASSWORD_HASH=${bcrypt.hashSync(password, 10)}\nSITE_URL=${process.env.SITE_URL || "https://dyyjs.com"}\nPUBLIC_BASE_PATH=${base}\n`,
    { mode: 0o600 },
  );
  const template = await readFile("deploy/linux/dev-blog.service", "utf8");
  await writeFile(
    unitPaths[0],
    template
      .replace("User=devblog", "User=nobody")
      .replace("Group=devblog", "Group=nogroup")
      .replace(
        "WorkingDirectory=/opt/dev-blog/current",
        `WorkingDirectory=${release}`,
      )
      .replace(
        "EnvironmentFile=/etc/dev-blog.env",
        `EnvironmentFile=${environment}`,
      )
      .replaceAll("/usr/bin/node", process.execPath)
      .replace("ReadWritePaths=/var/lib/dev-blog", `ReadWritePaths=${state}`),
  );
  const caddyfile = join(root, "Caddyfile");
  await writeFile(
    caddyfile,
    "{\n  admin off\n  auto_https off\n}\nhttp://127.0.0.1:19642 {\n  reverse_proxy 127.0.0.1:19641\n}\n",
  );
  await writeFile(
    unitPaths[1],
    `[Unit]\nDescription=Isolated DevBlog test proxy\n[Service]\nUser=nobody\nGroup=nogroup\nExecStart=/usr/bin/caddy run --config ${caddyfile} --adapter caddyfile\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\n`,
  );
  command("systemd-analyze", ["verify", ...unitPaths]);
  command("/usr/bin/caddy", [
    "validate",
    "--config",
    caddyfile,
    "--adapter",
    "caddyfile",
  ]);
  command("systemctl", ["daemon-reload"]);
  command("systemctl", ["start", appUnit, proxyUnit]);
  await ready();
  assert.equal((await request("/blog/linux-rehearsal")).status, 200);
  const originalPid = command("systemctl", [
    "show",
    appUnit,
    "-p",
    "MainPID",
    "--value",
  ]).trim();
  command("systemctl", ["kill", "--kill-whom=main", "--signal=KILL", appUnit]);
  await new Promise((resolve) => setTimeout(resolve, 6000));
  await ready();
  assert.notEqual(
    command("systemctl", ["show", appUnit, "-p", "MainPID", "--value"]).trim(),
    originalPid,
  );
  const login = await post("/api/auth/login", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const saved = await post("/api/manage/backups", { action: "create" }, cookie);
  assert.equal(saved.status, 200);
  const backup = await saved.json();
  assert.equal(
    (
      await post(
        "/api/posts",
        { title: "After backup", slug: "after-backup", draft: false },
        cookie,
      )
    ).status,
    201,
  );
  const check = await post(
    "/api/manage/backups",
    { action: "inspect", id: backup.id },
    cookie,
  );
  assert.equal(check.status, 200);
  const restored = await post(
    "/api/manage/backups",
    {
      action: "restore",
      id: backup.id,
      confirmation: backup.id,
      hash: backup.databaseSha256,
    },
    cookie,
  );
  assert.equal(restored.status, 200, await restored.text());
  assert.equal(
    (await request("/api/posts", { headers: { cookie } })).status,
    401,
  );
  command("systemctl", ["restart", appUnit]);
  await ready();
  assert.equal((await request("/blog/linux-rehearsal")).status, 200);
  assert.equal((await request("/blog/after-backup")).status, 404);
  console.log(
    "PASS: Linux systemd sandbox, Caddy subpath proxy, automatic restart, persistent SQLite, complete backup and restoration.",
  );
} catch (error) {
  for (const unit of [appUnit, proxyUnit])
    try {
      console.error(
        command("journalctl", ["-u", unit, "--no-pager", "-n", "40"]),
      );
    } catch {}
  throw error;
} finally {
  try {
    command("systemctl", ["stop", appUnit, proxyUnit]);
  } catch {}
  for (const path of unitPaths) await unlink(path).catch(() => {});
  try {
    command("systemctl", ["daemon-reload"]);
  } catch {}
  assert.ok(root.startsWith("/var/lib/devblog-rehearsal-"));
  await rm(root, { recursive: true, force: true });
}
