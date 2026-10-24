import { publishDue, cleanTrash } from "../db/content";
import { automaticBackup } from "./backups";
import { maintenanceActive } from "./write-gate";
import { automaticRemoteBackup } from "./operations";
let started = false,
  busy = false;
export function startJobs() {
  if (started) return;
  started = true;
  setInterval(async () => {
    if (busy || maintenanceActive()) return;
    busy = true;
    try {
      publishDue();
      cleanTrash();
      await automaticBackup();
      await automaticRemoteBackup();
    } catch {
      console.error(
        "Background content job failed. Check migrations, backup status and disk space.",
      );
    } finally {
      busy = false;
    }
  }, 30_000).unref();
}
