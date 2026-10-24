import Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rename,
  readdir,
  chmod,
  stat,
  unlink,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hashText = (value) => createHash("sha256").update(value).digest("hex");
export async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export function backupPaths(databasePath, env = process.env) {
  return {
    root: resolve(env.FULL_BACKUP_DIR || `${databasePath}.full-backups`),
    media: resolve(env.MEDIA_DIR || join(dirname(databasePath), "media")),
  };
}
function schema(db) {
  return hashText(
    JSON.stringify(
      db
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all(),
    ),
  );
}
function folder(paths, id) {
  if (!validId.test(id)) throw new Error("Invalid backup ID");
  return join(paths.root, id);
}
export async function createFullBackup(db, paths, reason = "manual") {
  const id = randomUUID(),
    work = join(paths.root, `.partial-${id}`);
  try {
    await mkdir(join(work, "media"), { recursive: true, mode: 0o700 });
    const file = join(work, "data.db");
    await db.backup(file);
    await chmod(file, 0o600);
    const copy = new Database(file, { readonly: true, fileMustExist: true });
    let assets, counts, fingerprint;
    try {
      if (copy.pragma("quick_check", { simple: true }) !== "ok")
        throw new Error("Backup integrity check failed");
      assets = copy.prepare("SELECT id FROM media").all();
      fingerprint = schema(copy);
      counts = {
        posts: copy.prepare("SELECT count(*) AS n FROM posts").get().n,
        drafts: copy.prepare("SELECT count(*) AS n FROM post_drafts").get().n,
        images: assets.length,
      };
    } finally {
      copy.close();
    }
    const files = [];
    for (const asset of assets) {
      if (!validId.test(asset.id)) throw new Error("Invalid stored image ID");
      const name = `${asset.id}.webp`,
        source = join(paths.media, name),
        target = join(work, "media", name);
      await copyFile(source, target);
      await chmod(target, 0o600);
      files.push({
        name,
        bytes: (await stat(target)).size,
        sha256: await hashFile(target),
      });
    }
    const manifest = {
      format: 1,
      id,
      createdAt: new Date().toISOString(),
      reason,
      schema: fingerprint,
      databaseSha256: await hashFile(file),
      counts,
      files,
    };
    await writeFile(
      join(work, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 },
    );
    await rename(work, folder(paths, id));
    return manifest;
  } catch (error) {
    // work is an immediate child constructed from a fresh UUID, never user input.
    await rm(work, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
export async function listFullBackups(paths) {
  let entries;
  try {
    entries = await readdir(paths.root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const results = [];
  for (const entry of entries)
    if (entry.isDirectory() && validId.test(entry.name)) {
      try {
        const value = JSON.parse(
          await readFile(join(paths.root, entry.name, "manifest.json"), "utf8"),
        );
        results.push({
          id: entry.name,
          createdAt: value.createdAt,
          reason: value.reason,
          counts: value.counts,
          bytes: value.files.reduce((n, f) => n + f.bytes, 0),
        });
      } catch {
        results.push({ id: entry.name, error: "Manifest is unreadable" });
      }
    }
  return results.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}
export async function inspectFullBackup(db, paths, id) {
  const root = folder(paths, id),
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (
    manifest.format !== 1 ||
    manifest.id !== id ||
    manifest.schema !== schema(db)
  )
    throw new Error(
      "Backup schema does not match this application version. Use a compatible release.",
    );
  if ((await hashFile(join(root, "data.db"))) !== manifest.databaseSha256)
    throw new Error("Backup database checksum failed");
  const copy = new Database(join(root, "data.db"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    if (
      schema(copy) !== manifest.schema ||
      copy.pragma("quick_check", { simple: true }) !== "ok" ||
      copy.pragma("foreign_key_check").length
    )
      throw new Error("Backup database integrity failed");
    const expected = copy
      .prepare("SELECT id FROM media ORDER BY id")
      .all()
      .map((row) => `${row.id}.webp`);
    if (
      JSON.stringify(expected) !==
      JSON.stringify(manifest.files.map((file) => file.name).sort())
    )
      throw new Error("Backup image inventory is incomplete");
  } finally {
    copy.close();
  }
  for (const asset of manifest.files) {
    if (
      !/^[0-9a-f-]{36}\.webp$/.test(asset.name) ||
      !validId.test(asset.name.slice(0, -5))
    )
      throw new Error("Invalid backup image name");
    if ((await hashFile(join(root, "media", asset.name))) !== asset.sha256)
      throw new Error("Backup image checksum failed");
  }
  return {
    id,
    createdAt: manifest.createdAt,
    counts: manifest.counts,
    databaseSha256: manifest.databaseSha256,
    current: {
      posts: db.prepare("SELECT count(*) AS n FROM posts").get().n,
      drafts: db.prepare("SELECT count(*) AS n FROM post_drafts").get().n,
      images: db.prepare("SELECT count(*) AS n FROM media").get().n,
    },
  };
}
export async function restoreFullBackup(db, paths, id, expectedHash) {
  const preview = await inspectFullBackup(db, paths, id);
  if (preview.databaseSha256 !== expectedHash)
    throw new Error("Preview expired; inspect this backup again.");
  let safety;
  const root = folder(paths, id),
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
    added = [];
  let committed = false;
  await mkdir(paths.media, { recursive: true, mode: 0o700 });
  try {
    for (const asset of manifest.files) {
      const target = join(paths.media, asset.name);
      try {
        if ((await hashFile(target)) !== asset.sha256)
          throw new Error(
            "Existing image differs from backup; restore stopped to protect current files.",
          );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await copyFile(join(root, "media", asset.name), target);
        await chmod(target, 0o600);
        added.push(target);
      }
    }
    // Recover missing immutable files before taking the safety snapshot. The
    // database is still untouched; failures remove only these newly added files.
    safety = await createFullBackup(db, paths, "before-restore");
    db.prepare("ATTACH DATABASE ? AS recovery").run(join(root, "data.db"));
    try {
      const tables = db
        .pragma("table_list")
        .filter(
          (t) =>
            t.schema === "main" &&
            t.type === "table" &&
            !t.name.startsWith("sqlite_") &&
            t.name !== "app_migrations",
        )
        .map((t) => t.name);
      const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
      const ordered = [],
        visiting = new Set(),
        visited = new Set();
      const visit = (name) => {
        if (visited.has(name)) return;
        if (visiting.has(name))
          throw new Error("Cyclic foreign keys require an offline restore.");
        visiting.add(name);
        for (const key of db.pragma(`foreign_key_list(${quote(name)})`))
          if (tables.includes(key.table)) visit(key.table);
        visiting.delete(name);
        visited.add(name);
        ordered.push(name);
      };
      tables.forEach(visit);
      const triggers = db
        .prepare(
          "SELECT name,sql FROM main.sqlite_master WHERE type='trigger' AND sql IS NOT NULL",
        )
        .all();
      // Authentication is current security state, not historical content.
      const currentKeys = db.prepare("SELECT * FROM admin_passkeys").all();
      const currentUser = db
        .prepare("SELECT value FROM site_settings WHERE key='passkeyUserId'")
        .get();
      db.transaction(() => {
        // Raw events and their lifetime aggregates are both in the snapshot.
        // Replaying insert triggers would count events twice or collide with
        // restored primary keys. DDL is transactional, so a failure restores
        // both the old tables and their original triggers.
        for (const trigger of triggers)
          db.exec(`DROP TRIGGER main.${quote(trigger.name)}`);
        for (const name of [...ordered].reverse())
          db.exec(`DELETE FROM main.${quote(name)}`);
        for (const name of ordered)
          db.exec(
            `INSERT INTO main.${quote(name)} SELECT * FROM recovery.${quote(name)}`,
          );
        for (const trigger of triggers) db.exec(trigger.sql);
        db.exec("INSERT INTO posts_search(posts_search) VALUES ('rebuild')");
        // Restoring a backup must not revive old sessions or overdue scheduled publications.
        db.exec(
          "DELETE FROM admin_sessions; UPDATE post_schedules SET status='cancelled',error='Cancelled during backup restore; review and schedule again.' WHERE status='pending'",
        );
        // Never resurrect revoked preview links, challenges or old authenticators.
        // Preserve current passkeys and counters, rather than rolling them back.
        db.exec(
          "DELETE FROM auth_challenges; DELETE FROM admin_passkeys; DELETE FROM preview_shares; DELETE FROM site_settings WHERE key IN ('operationsSettings','operationsState','remoteLastAttempt','remoteLastSuccess','remoteLastCheck')",
        );
        const restoreKey = db.prepare(
          "INSERT INTO admin_passkeys(id,publicKey,counter,transports,name,createdAt,lastUsedAt) VALUES (?,?,?,?,?,?,?)",
        );
        for (const key of currentKeys)
          restoreKey.run(
            key.id,
            key.publicKey,
            key.counter,
            key.transports,
            key.name,
            key.createdAt,
            key.lastUsedAt,
          );
        db.prepare("DELETE FROM site_settings WHERE key='passkeyUserId'").run();
        if (currentUser)
          db.prepare(
            "INSERT INTO site_settings VALUES ('passkeyUserId',?)",
          ).run(currentUser.value);
        if (db.pragma("foreign_key_check").length)
          throw new Error("Restore integrity check failed");
      }).immediate();
      committed = true;
    } finally {
      db.exec("DETACH DATABASE recovery");
    }
  } catch (error) {
    if (!committed)
      for (const path of added) await unlink(path).catch(() => {});
    throw error;
  }
  return { ok: true, safetyBackup: safety.id, signInRequired: true };
}
