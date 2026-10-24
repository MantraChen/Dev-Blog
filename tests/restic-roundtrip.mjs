import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { migrate } from "../scripts/migrate.mjs";
import {
  createFullBackup,
  backupPaths,
  inspectFullBackup,
  restoreFullBackup,
} from "../scripts/full-backup.mjs";
import {
  runRestic,
  uploadBackup,
  checkRepository,
  pruneRemote,
} from "../scripts/remote-backup.mjs";
if (!process.env.RESTIC_TEST_BINARY)
  throw new Error("Set RESTIC_TEST_BINARY to an installed restic executable.");
const root = await mkdtemp(join(tmpdir(), "devblog-restic-")),
  database = join(root, "data.db"),
  db = new Database(database);
const env = {
  ...process.env,
  RESTIC_BINARY: process.env.RESTIC_TEST_BINARY,
  RESTIC_REPOSITORY: join(root, "encrypted-repository"),
  RESTIC_PASSWORD_FILE: join(root, "password.txt"),
  RESTIC_REPOSITORY_FILE: undefined,
  RESTIC_PASSWORD: undefined,
  RESTIC_PASSWORD_COMMAND: undefined,
  RESTIC_CACHE_DIR: join(root, "cache"),
  SITE_URL: "https://backup-fixture.example",
  PUBLIC_BASE_PATH: "/howielog",
};
try {
  await writeFile(
    env.RESTIC_PASSWORD_FILE,
    randomBytes(32).toString("base64url"),
    { mode: 0o600 },
  );
  migrate(db);
  db.prepare(
    "INSERT INTO posts(title,slug,content,draft) VALUES (?,?,?,0)",
  ).run(
    "Encrypted fixture",
    "encrypted-fixture",
    "Private backup contents — restored successfully",
  );
  const paths = backupPaths(database, {
    MEDIA_DIR: join(root, "media"),
    FULL_BACKUP_DIR: join(root, "snapshots"),
  });
  const snapshot = await createFullBackup(db, paths, "remote");
  await inspectFullBackup(db, paths, snapshot.id);
  await runRestic(["init"], { env });
  const uploaded = await uploadBackup(join(paths.root, snapshot.id), env);
  assert.match(uploaded.snapshot, /^[0-9a-f]{8,64}$/);
  await checkRepository(env);
  const policy = await pruneRemote(true, env);
  assert.equal(policy.candidates.length, 0);
  assert.equal(policy.keepCount, 1);
  const restored = join(root, "restored", snapshot.id);
  await mkdir(restored, { recursive: true });
  const inventory = String(
    await runRestic(["ls", "--json", uploaded.snapshot], { env }),
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const manifestEntry = inventory.find(
    (entry) => entry.name === "manifest.json",
  );
  assert.ok(manifestEntry);
  // Restore only the backup subtree, not Windows system parent directories/ACLs.
  const subtree = manifestEntry.path.slice(
    0,
    manifestEntry.path.lastIndexOf("/"),
  );
  await runRestic(
    [
      "restore",
      uploaded.snapshot + ":" + subtree,
      "--target",
      restored,
      "--verify",
    ],
    { env },
  );
  async function find(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = await find(path);
        if (nested) return nested;
      } else if (entry.name === "manifest.json") return directory;
    }
    return null;
  }
  const recovered = await find(restored);
  assert.ok(recovered);
  const manifest = JSON.parse(
    await readFile(join(recovered, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.id, snapshot.id);
  const recoveredPaths = { ...paths, root: join(recovered, "..") };
  const preview = await inspectFullBackup(db, recoveredPaths, snapshot.id);
  db.prepare("UPDATE posts SET title=?").run("Changed after backup");
  await restoreFullBackup(
    db,
    recoveredPaths,
    snapshot.id,
    preview.databaseSha256,
  );
  assert.equal(
    db.prepare("SELECT title FROM posts").get().title,
    "Encrypted fixture",
  );
  await pruneRemote(false, env);
  await checkRepository(env);
  console.log(
    "PASS: encrypted restic snapshot, full data verification, retention preview, restore and application integrity. Repository is a temporary local fixture, not off-site storage.",
  );
} catch (error) {
  console.error("Restic round-trip failed:", error);
  throw error;
} finally {
  db.close();
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
