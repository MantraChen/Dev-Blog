import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
const { sqlite } = await import("../src/db/index");
migrate(sqlite);
const session = crypto.randomUUID();
sqlite.prepare("INSERT INTO admin_sessions(id, expiresAt) VALUES (?, ?)").run(session, new Date(Date.now() + 60_000).toISOString());

test("editing and deleting missing resources returns 404 without fake success audit entries", async () => {
  for (const resource of ["posts", "projects", "skills", "friends", "timeline"]) {
    const { PUT, DELETE } = await import(`../src/pages/api/${resource}/[id].ts`);
    const context = (method: string) => ({ params: { id: "999" }, clientAddress: "127.0.0.1", request: new Request(`https://example.com/api/${resource}/999`, {
      method, headers: { cookie: `admin_session=${session}`, "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify(resource === "posts" || resource === "timeline" ? { title: "Test" } : { name: "Test" }) } : {}),
    }) });
    assert.equal((await PUT(context("PUT"))).status, 404, resource);
    assert.equal((await DELETE(context("DELETE"))).status, 404, resource);
  }
  assert.equal((sqlite.prepare("SELECT count(*) AS n FROM audit_logs").get() as { n: number }).n, 0);
});
