import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { securitySyncHealth } from '../src/lib/security';

test('sync status requires a published index and a fresh successful sync from each source', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blog-sync-health-test-'));
  const file = join(directory, 'security.db');
  const previous = process.env.SECURITY_DATABASE_PATH;
  process.env.SECURITY_DATABASE_PATH = file;
  const now = Date.parse('2026-11-23T13:00:00Z');
  const recent = '2026-11-23T12:30:00Z';
  const sources = ['GitHub', 'CISA KEV', 'OSV / npm', 'OSV / PyPI', 'OSV / Maven', 'OSV / crates.io', 'OSV / Go'];

  try {
    assert.equal(securitySyncHealth(now), 'unavailable');
    const db = new Database(file);
    try {
      db.exec('CREATE TABLE entries(id TEXT); CREATE TABLE states(source TEXT PRIMARY KEY,last_success TEXT,error TEXT)');
      const save = db.prepare('INSERT OR REPLACE INTO states VALUES(?,?,?)');
      for (const source of sources) save.run(source, recent, null);
      assert.equal(securitySyncHealth(now), 'unavailable');
      db.prepare('INSERT INTO entries VALUES (?)').run('fixture-entry');
      assert.equal(securitySyncHealth(now), 'ok');

      save.run('GitHub', recent, 'TemporaryFailure');
      assert.equal(securitySyncHealth(now), 'ok');
      for (const stamp of [null, 'not-a-timestamp', '2026-11-23T13:05:00Z', '2026-11-23T09:59:59Z']) {
        save.run('GitHub', stamp, null);
        assert.equal(securitySyncHealth(now), 'stale');
      }
      save.run('GitHub', '2026-11-23T10:00:00Z', null);
      assert.equal(securitySyncHealth(now), 'ok');
      db.prepare('DELETE FROM states WHERE source=?').run('GitHub');
      save.run('extra source', recent, null);
      assert.equal(securitySyncHealth(now), 'stale');
    } finally {
      db.close();
    }
  } finally {
    if (previous === undefined) delete process.env.SECURITY_DATABASE_PATH;
    else process.env.SECURITY_DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
