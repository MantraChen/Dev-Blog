import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  localRetention,
  remoteConfigured,
  backupTag,
  runRestic,
} from "../scripts/remote-backup.mjs";
test("local retention previews deletion, preserves manual or unreadable manifests, and rejects unsafe policies", async () => {
  const root = await mkdtemp(join(tmpdir(), "devblog-retention-"));
  try {
    const automatic: string[] = [];
    for (let n = 0; n < 8; n++) {
      const id = crypto.randomUUID();
      automatic.push(id);
      await mkdir(join(root, id));
      await writeFile(
        join(root, id, "manifest.json"),
        JSON.stringify({
          format: 1,
          id,
          schema: "fixture",
          databaseSha256: "a".repeat(64),
          files: [],
          createdAt: new Date(2026, 0, n + 1).toISOString(),
          reason: "daily",
        }),
      );
      await writeFile(join(root, id, "data.db"), "fixture");
    }
    const manual = crypto.randomUUID();
    await mkdir(join(root, manual));
    await writeFile(
      join(root, manual, "manifest.json"),
      JSON.stringify({
        id: manual,
        createdAt: "2020-01-01T00:00:00Z",
        reason: "manual",
      }),
    );
    const broken = crypto.randomUUID();
    await mkdir(join(root, broken));
    await writeFile(join(root, broken, "manifest.json"), "invalid");
    const preview = await localRetention(root, 3, false);
    assert.equal(preview.candidates.length, 5);
    assert.ok(await readFile(join(root, automatic[0], "manifest.json")));
    await localRetention(root, 3, true);
    await assert.rejects(readFile(join(root, automatic[0], "manifest.json")));
    assert.ok(await readFile(join(root, manual, "manifest.json")));
    assert.ok(await readFile(join(root, broken, "manifest.json")));
    await assert.rejects(localRetention(root, 0, true), /retention/);
    assert.equal(remoteConfigured({}), false);
    assert.throws(() => runRestic(["backup"], { env: {} }), /NOT_CONFIGURED/);
    assert.notEqual(
      backupTag({ SITE_URL: "https://example.com", PUBLIC_BASE_PATH: "/a" }),
      backupTag({ SITE_URL: "https://example.com", PUBLIC_BASE_PATH: "/b" }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
