import { sqlite } from "../db";
import {
  backupPaths,
  createFullBackup,
  listFullBackups,
  inspectFullBackup,
  restoreFullBackup,
} from "../../scripts/full-backup.mjs";
import { exclusiveWrite } from "./write-gate";
import { HttpError } from "./http-error";
const paths = () => backupPaths(sqlite.name);
export const backupList = () => listFullBackups(paths());
export const backupCreate = () =>
  exclusiveWrite(() => createFullBackup(sqlite, paths()));
export const backupInspect = (id: string) =>
  exclusiveWrite(() => inspectFullBackup(sqlite, paths(), id));
export const backupRestore = (id: string, hash: string) =>
  exclusiveWrite(() => restoreFullBackup(sqlite, paths(), id, hash));
export function backupSettings() {
  return {
    enabled: sqlite
      .prepare("SELECT value FROM site_settings WHERE key='dailyBackup'")
      .get() as { value: string } | undefined,
    lastError:
      (
        sqlite
          .prepare("SELECT value FROM site_settings WHERE key='backupError'")
          .get() as { value: string } | undefined
      )?.value || "",
  };
}
export function setDailyBackup(enabled: boolean) {
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO site_settings(key,value) VALUES ('dailyBackup',?)",
    )
    .run(enabled ? "true" : "false");
  return { ok: true };
}
export async function automaticBackup() {
  if (backupSettings().enabled?.value !== "true") return;
  const last = (
    sqlite
      .prepare("SELECT value FROM site_settings WHERE key='backupLastRun'")
      .get() as { value: string } | undefined
  )?.value;
  if (last && Date.now() - Date.parse(last) < 86400_000) return;
  await exclusiveWrite(async () => {
    try {
      await createFullBackup(sqlite, paths(), "daily");
      sqlite
        .prepare(
          "INSERT OR REPLACE INTO site_settings(key,value) VALUES ('backupError','')",
        )
        .run();
    } catch (error) {
      sqlite
        .prepare(
          "INSERT OR REPLACE INTO site_settings(key,value) VALUES ('backupError',?)",
        )
        .run("Backup failed. Check disk space, paths and service permissions.");
      throw new HttpError(500, "Automatic backup failed");
    } finally {
      sqlite
        .prepare(
          "INSERT OR REPLACE INTO site_settings(key,value) VALUES ('backupLastRun',?)",
        )
        .run(new Date().toISOString());
    }
  }, false);
}
