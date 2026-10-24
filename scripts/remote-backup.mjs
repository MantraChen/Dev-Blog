import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join, relative, isAbsolute } from "node:path";
import { readdir, readFile, lstat, realpath, rm } from "node:fs/promises";

export function remoteConfigured(env = process.env) {
  return Boolean(
    env.RESTIC_BINARY &&
    (env.RESTIC_REPOSITORY || env.RESTIC_REPOSITORY_FILE) &&
    env.RESTIC_PASSWORD_FILE,
  );
}
export function backupTag(env = process.env) {
  return (
    "devblog-" +
    createHash("sha256")
      .update(env.SITE_URL || "https://howielog.com")
      .update(env.PUBLIC_BASE_PATH || "/")
      .digest("hex")
      .slice(0, 16)
  );
}
export function runRestic(args, { env = process.env, cwd } = {}) {
  if (!remoteConfigured(env)) throw new Error("REMOTE_NOT_CONFIGURED");
  return new Promise((resolveResult, reject) => {
    const child = spawn(env.RESTIC_BINARY, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      size = 0,
      finished = false;
    const timer = setTimeout(() => {
      child.kill();
      fail("REMOTE_TIMEOUT");
    }, 30 * 60_000);
    timer.unref();
    function fail(code) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(code));
    }
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        child.kill();
        fail("REMOTE_OUTPUT_LIMIT");
      } else output += chunk.toString();
    });
    // Provider errors can contain repository URLs or credentials. Do not expose them.
    child.stderr.on("data", () => {});
    child.on("error", () => fail("REMOTE_START_FAILED"));
    child.on("close", (code) => {
      if (finished) return;
      if (code !== 0) return fail("REMOTE_COMMAND_FAILED");
      finished = true;
      clearTimeout(timer);
      resolveResult(output);
    });
  });
}
export async function uploadBackup(directory, env = process.env) {
  const output = await runRestic(
    [
      "backup",
      "--json",
      "--tag",
      backupTag(env),
      "--host",
      "devblog",
      "--",
      directory,
    ],
    { env },
  );
  const summary = String(output)
    .trim()
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find((row) => row?.message_type === "summary");
  if (!summary?.snapshot_id) throw new Error("REMOTE_NO_SNAPSHOT");
  return { snapshot: summary.snapshot_id };
}
export async function checkRepository(env = process.env) {
  await runRestic(["check", "--read-data"], { env });
  return { ok: true };
}
export async function pruneRemote(dryRun = true, env = process.env) {
  // All UUID source paths belong to ONE site's retention group. Never prune other tags.
  const output = await runRestic(
    [
      "forget",
      "--json",
      "--tag",
      backupTag(env),
      "--group-by",
      "tags",
      "--keep-last",
      "3",
      "--keep-daily",
      "7",
      "--keep-weekly",
      "4",
      "--keep-monthly",
      "12",
      dryRun ? "--dry-run" : "--prune",
    ],
    { env },
  );
  const groups = dryRun ? JSON.parse(String(output)) : [];
  return {
    ok: true,
    dryRun,
    candidates: groups.flatMap((group) =>
      (group.remove || []).map((snapshot) => ({
        id: snapshot.id,
        time: snapshot.time,
      })),
    ),
    keepCount: groups.reduce(
      (sum, group) => sum + (group.keep?.length || 0),
      0,
    ),
  };
}
export async function localRetention(root, keep = 7, apply = false) {
  if (!Number.isInteger(keep) || keep < 3 || keep > 365)
    throw new Error("Invalid retention count");
  const base = resolve(root),
    candidates = [];
  for (const entry of await readdir(base, { withFileTypes: true }).catch(
    () => [],
  )) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue;
    const target = join(base, entry.name);
    try {
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) continue;
      const manifest = JSON.parse(
        await readFile(join(target, "manifest.json"), "utf8"),
      );
      if (
        manifest.format === 1 &&
        manifest.id === entry.name &&
        typeof manifest.schema === "string" &&
        /^[0-9a-f]{64}$/.test(manifest.databaseSha256) &&
        Array.isArray(manifest.files) &&
        (await lstat(join(target, "data.db"))).isFile() &&
        ["daily", "remote"].includes(manifest.reason) &&
        Number.isFinite(Date.parse(manifest.createdAt))
      )
        candidates.push({ id: entry.name, createdAt: manifest.createdAt });
    } catch {
      /* Unknown or damaged backups are kept for manual investigation. */
    }
  }
  candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const removed = candidates.slice(keep);
  if (apply)
    for (const item of removed) {
      const target = join(base, item.id),
        realBase = await realpath(base),
        realTarget = await realpath(target),
        rel = relative(realBase, realTarget);
      if (
        !rel ||
        rel.startsWith("..") ||
        isAbsolute(rel) ||
        (await lstat(target)).isSymbolicLink()
      )
        throw new Error("Unsafe backup path");
      await rm(target, { recursive: true, force: false });
    }
  return { candidates: removed, applied: apply };
}
