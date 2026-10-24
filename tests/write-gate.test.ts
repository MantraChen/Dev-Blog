import test from "node:test";
import assert from "node:assert/strict";
import {
  trackWrite,
  exclusiveWrite,
  maintenanceActive,
} from "../src/lib/write-gate";

test("maintenance waits for active uploads, rejects new writes, and reopens after completion", async () => {
  let finish!: () => void;
  const upload = trackWrite(async () => {
    await new Promise<void>((resolve) => (finish = resolve));
    return new Response("uploaded");
  });
  let ran = false;
  const snapshot = exclusiveWrite(async () => {
    ran = true;
    return "snapshot";
  }, false);
  assert.equal(maintenanceActive(), true);
  assert.equal(ran, false);
  assert.equal(
    (await trackWrite(async () => new Response("unexpected"))).status,
    503,
  );
  finish();
  await upload;
  assert.equal(await snapshot, "snapshot");
  assert.equal(maintenanceActive(), false);
  assert.equal(
    (await trackWrite(async () => new Response("ready"))).status,
    200,
  );
});

test("a maintenance request does not wait for itself and an error releases the gate", async () => {
  await assert.rejects(
    trackWrite(() =>
      exclusiveWrite(async () => {
        throw new Error("disk unavailable");
      }),
    ),
    /disk unavailable/,
  );
  assert.equal(maintenanceActive(), false);
  assert.equal(
    (await trackWrite(() => exclusiveWrite(async () => new Response("done"))))
      .status,
    200,
  );
});
