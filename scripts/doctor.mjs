import { existsSync, readdirSync, statSync, statfsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { totalmem, freemem, platform, release, availableParallelism } from "node:os";
import Database from "better-sqlite3";
import { supportedRuntime } from "./check-runtime.mjs";
import { pendingMigrations } from "./migrate.mjs";

const filename = resolve(process.env.DATABASE_PATH || "data.db");
const report = {
  runtime: { node:process.versions.node, supported:supportedRuntime(), platform:platform(), osRelease:release(), cpus:availableParallelism(), memoryBytes:totalmem(), freeMemoryBytes:freemem() },
  configuration: { databasePathExplicit:Boolean(process.env.DATABASE_PATH), loopbackBound:process.env.HOST==='127.0.0.1', adminPasswordConfigured:Boolean(process.env.ADMIN_PASSWORD_HASH) },
  database: { exists:existsSync(filename) },
  warnings: [],
};
if (!report.runtime.supported) report.warnings.push('Node security update required');
if (!report.configuration.databasePathExplicit) report.warnings.push('Set an explicit DATABASE_PATH in the service environment');
if (!report.configuration.loopbackBound) report.warnings.push('Set HOST=127.0.0.1 behind the trusted reverse proxy');
if (!report.configuration.adminPasswordConfigured) report.warnings.push('ADMIN_PASSWORD_HASH is not configured in this process');
if (report.database.exists) {
  const db = new Database(filename,{readonly:true,fileMustExist:true});
  try {
    const storage = statfsSync(dirname(filename));
    const backupDir=resolve(process.env.BACKUP_DIR || `${filename}.backups`);
    const backups=existsSync(backupDir) ? readdirSync(backupDir).filter(name=>name.endsWith('.db')).map(name=>statSync(resolve(backupDir,name))) : [];
    Object.assign(report.database,{ sizeBytes:statSync(filename).size, quickCheck:db.pragma('quick_check',{simple:true}), journalMode:db.pragma('journal_mode',{simple:true}), pendingMigrations:pendingMigrations(db).map(m=>m.id), freeDiskBytes:storage.bavail*storage.bsize, backupCount:backups.length, backupBytes:backups.reduce((sum,file)=>sum+file.size,0), latestBackupAt:backups.length ? new Date(Math.max(...backups.map(file=>file.mtimeMs))).toISOString() : null });
    if (storage.bavail*storage.bsize < Math.max(1024**3,statSync(filename).size*3)) report.warnings.push('Low disk headroom for a backup, WAL and search-index migration');
    if (!backups.length) report.warnings.push('No database backups found');
  } finally { db.close(); }
} else report.warnings.push('Database not found; run doctor with the production service environment');
// Never print environment values, password hashes, visitor keys or database content.
console.log(JSON.stringify(report,null,2));
if (report.warnings.length) process.exitCode=1;
