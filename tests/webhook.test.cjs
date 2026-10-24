const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const http = require("node:http");
const { createWebhookServer, verifySignature } = require("../deploy/webhook.cjs");
const secret = "local-test-secret";
const sign = (body) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("malformed signatures fail closed without throwing", () => {
  for (const signature of [undefined, "", "sha256=x", "sha256=" + "z".repeat(64), [sign("{}")] ]) {
    assert.equal(verifySignature(Buffer.from("{}"), signature, secret), false);
  }
  assert.equal(verifySignature(Buffer.from("{}"), sign("{}"), secret), true);
  assert.equal(verifySignature(Buffer.from("other"), sign("{}"), secret), false);
});

test("HTTP handler rejects malformed and oversized input and remains healthy", async (t) => {
  let deployments = 0;
  const server = createWebhookServer({ secret, onPush: () => deployments++, maxBodyBytes: 128 });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, signature = sign(body)) => fetch(`${base}/webhook`, { method: "POST", body, headers: { "x-hub-signature-256": signature, "x-github-event": "push" } });
  assert.equal((await post("{}", "sha256=x")).status, 401);
  assert.equal((await post("{")).status, 400);
  assert.equal((await post(JSON.stringify({ ref: "refs/heads/other" }))).status, 200);
  assert.equal((await post(JSON.stringify({ ref: "refs/heads/main", deleted: true }))).status, 200);
  assert.equal((await post(JSON.stringify({ ref: "refs/heads/main" }))).status, 202);
  assert.equal(deployments, 1);
  assert.equal((await post("x".repeat(129))).status, 413);
  const chunkedStatus = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/webhook`, { method: "POST" }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject);
    req.write("x".repeat(64));
    req.end("y".repeat(65));
  });
  assert.equal(chunkedStatus, 413);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(deployments, 1);
});
