import { stat, statfs, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { sqlite } from "../db";
import {
  backupPaths,
  createFullBackup,
  inspectFullBackup,
  listFullBackups,
} from "../../scripts/full-backup.mjs";
import {
  remoteConfigured,
  uploadBackup,
  checkRepository,
  pruneRemote,
  localRetention,
} from "../../scripts/remote-backup.mjs";
import { exclusiveWrite } from "./write-gate";
import { HttpError } from "./http-error";

type OperationState = {
  phase: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  snapshot?: string;
  backupId?: string;
};
let busy = false;
const setting = (key: string) =>
  (
    sqlite.prepare("SELECT value FROM site_settings WHERE key=?").get(key) as
      { value: string } | undefined
  )?.value;
const save = (key: string, value: unknown) =>
  sqlite
    .prepare("INSERT OR REPLACE INTO site_settings VALUES (?,?)")
    .run(key, JSON.stringify(value));
function json<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(setting(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export const operationsSettings = () => ({
  ...json("operationsSettings", {
    remoteDaily: false,
    retention: false,
    localKeep: 7,
  }),
  configured: remoteConfigured(),
});
export const operationsState = () => ({
  ...json<OperationState>("operationsState", { phase: "idle" }),
  running: busy,
});
export function configureOperations(input: {
  remoteDaily: boolean;
  retention: boolean;
  localKeep: number;
}) {
  if (input.remoteDaily && !remoteConfigured())
    throw new HttpError(
      400,
      "Configure restic repository, binary and password file in the service environment first.",
    );
  save("operationsSettings", input);
  return operationsSettings();
}
export function startOperation(
  action: "backup" | "check" | "retention-preview" | "retention",
) {
  if (busy) throw new HttpError(409, "A maintenance operation is running.");
  if (["backup", "check"].includes(action) && !remoteConfigured())
    throw new HttpError(400, "Remote backup is not configured.");
  const state: OperationState = {
    phase: action,
    startedAt: new Date().toISOString(),
  };
  save("operationsState", state);
  busy = true;
  void (async () => {
    try {
      const paths = backupPaths(sqlite.name);
      if (action === "backup") {
        const backup = await exclusiveWrite(async () => {
          const result = await createFullBackup(sqlite, paths, "remote");
          await inspectFullBackup(sqlite, paths, result.id);
          return result;
        }, false);
        state.backupId = backup.id;
        save("operationsState", { ...state, phase: "uploading" });
        const result = await uploadBackup(join(paths.root, backup.id));
        state.snapshot = result.snapshot;
        save("remoteLastSuccess", new Date().toISOString());
        if (operationsSettings().retention) {
          await pruneRemote(false);
          await exclusiveWrite(
            () =>
              localRetention(paths.root, operationsSettings().localKeep, true),
            false,
          );
        }
      } else if (action === "check") {
        await checkRepository();
        save("remoteLastCheck", new Date().toISOString());
      } else {
        const preview = await exclusiveWrite(
          () =>
            localRetention(
              paths.root,
              operationsSettings().localKeep,
              action === "retention",
            ),
          false,
        );
        const remote = remoteConfigured()
          ? await pruneRemote(action === "retention-preview")
          : null;
        save("retentionPreview", { local: preview, remote });
      }
      save("operationsState", {
        ...state,
        phase: "complete",
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      const code =
        error instanceof Error && /^REMOTE_[A-Z_]+$/.test(error.message)
          ? error.message
          : "OPERATION_FAILED";
      try {
        save("operationsState", {
          ...state,
          phase: "failed",
          error: code,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        // A full or unavailable database must not turn a failed background job
        // into an unhandled rejection. Avoid logging restic credential output.
        console.error(
          "Maintenance failed; could not persist operation status.",
        );
      }
    } finally {
      busy = false;
    }
  })();
  return { accepted: true };
}
export async function automaticRemoteBackup() {
  if (!operationsSettings().remoteDaily || busy) return;
  const last = json<string>("remoteLastAttempt", "");
  if (last && Date.now() - Date.parse(last) < 86400000) return;
  save("remoteLastAttempt", new Date().toISOString());
  startOperation("backup");
}
export function assertNoRemoteOperation() {
  if (busy)
    throw new HttpError(
      409,
      "Wait for the remote backup operation to finish before restoring.",
    );
}
export async function healthReport() {
  const paths = backupPaths(sqlite.name);
  const fileSize = async (file: string) =>
    (await stat(file).catch(() => null))?.size || 0;
  const [dbBytes, walBytes, space, backups] = await Promise.all([
    fileSize(sqlite.name),
    fileSize(sqlite.name + "-wal"),
    statfs(dirname(sqlite.name)).catch(() => null),
    listFullBackups(paths),
  ]);
  const backupBytes = (
    await Promise.all(
      backups.map(
        async (item) =>
          (item.bytes || 0) +
          (await fileSize(join(paths.root, item.id, "data.db"))),
      ),
    )
  ).reduce((sum, value) => sum + value, 0);
  const media = sqlite
    .prepare("SELECT count(*) count,coalesce(sum(bytes),0) bytes FROM media")
    .get();
  // Count actual files asynchronously so orphaned uploads are also visible.
  let mediaDiskBytes = 0;
  for (const entry of await readdir(paths.media, { withFileTypes: true }).catch(
    () => [],
  ))
    if (entry.isFile())
      mediaDiskBytes += await fileSize(join(paths.media, entry.name));
  const schedules = sqlite
    .prepare(
      "SELECT s.draftId,s.scheduledAt,s.error,json_extract(d.data,'$.title') title FROM post_schedules s JOIN post_drafts d ON d.id=s.draftId WHERE s.status='failed' ORDER BY s.scheduledAt DESC LIMIT 20",
    )
    .all();
  return {
    runtime: {
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: process.memoryUsage().rss,
      release: process.env.DEPLOY_COMMIT || process.env.GIT_COMMIT || "local",
    },
    storage: {
      databaseBytes: dbBytes,
      walBytes,
      media,
      mediaDiskBytes,
      backupBytes,
      freeBytes: space ? space.bavail * space.bsize : null,
      totalBytes: space ? space.blocks * space.bsize : null,
      backupCount: backups.length,
    },
    latestBackup: backups[0] || null,
    backupError: setting("backupError") || "",
    schedules,
    settings: operationsSettings(),
    operation: operationsState(),
    lastRemoteSuccess: json("remoteLastSuccess", null),
    lastRemoteCheck: json("remoteLastCheck", null),
    retention: json("retentionPreview", null),
  };
}
