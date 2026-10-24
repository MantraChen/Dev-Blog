/** GitHub deployment listener; run behind Caddy on loopback. */
const http = require("node:http");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

function verifySignature(payload, signature, secret) {
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

function createWebhookServer({ secret, branch = "main", onPush, health = () => ({}), maxBodyBytes = 1024 * 1024 }) {
  if (!secret) throw new Error("WEBHOOK_SECRET is required");
  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(message);
    };
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ status: "ok", ...health() }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/webhook") return reply(404, "Not found");
    let size = 0;
    let oversized = false;
    const chunks = [];
    const rejectOversized = () => {
      oversized = true;
      chunks.length = 0;
      res.setHeader("Connection", "close");
      res.on("finish", () => req.destroy());
      reply(413, "Request body too large");
    };
    if (Number(req.headers["content-length"]) > maxBodyBytes) {
      rejectOversized();
      req.resume();
      return;
    }
    req.on("data", (chunk) => {
      if (oversized) return;
      size += chunk.length;
      if (size > maxBodyBytes) return rejectOversized();
      chunks.push(chunk);
    });
    req.on("error", () => { if (!res.headersSent) reply(400, "Invalid request"); });
    req.on("end", () => {
      if (oversized) return;
      const body = Buffer.concat(chunks);
      if (!verifySignature(body, req.headers["x-hub-signature-256"], secret)) return reply(401, "Invalid signature");
      if (req.headers["x-github-event"] !== "push") return reply(200, "Ignored");
      let payload;
      try { payload = JSON.parse(body.toString("utf8")); }
      catch { return reply(400, "Invalid JSON"); }
      if (!payload || typeof payload !== "object") return reply(400, "Invalid payload");
      if (payload.ref !== `refs/heads/${branch}` || payload.deleted) return reply(200, "Ignored");
      try { onPush(); reply(202, "Deployment queued"); }
      catch { reply(500, "Could not queue deployment"); }
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

function main() {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("WEBHOOK_SECRET environment variable is required");
  const port = Number(process.env.WEBHOOK_PORT || 9000);
  const deployDir = process.env.DEPLOY_DIR || path.resolve(__dirname, "..");
  const service = process.env.SERVICE_NAME || "dev-blog";
  const logFile = path.join(__dirname, "deploy.log");
  let deploying = false;
  let pending = false;
  const log = (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    try { fs.appendFileSync(logFile, line + "\n"); }
    catch (error) { console.error("Could not write deployment log:", error.message); }
  };
  const deploy = () => {
    if (deploying) { pending = true; return; }
    deploying = true;
    log("Deployment started");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "deploy.ps1")],
      { cwd: deployDir, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        deploying = false;
        log(error ? `Deployment failed: ${error.message}` : "Deployment completed");
        if (stdout) log(stdout);
        if (stderr) log(stderr);
        if (pending) { pending = false; deploy(); }
      });
  };
  const server = createWebhookServer({ secret, branch: process.env.DEPLOY_BRANCH || "main", onPush: deploy, health: () => ({ deploying, pending, service }) });
  server.listen(port, "127.0.0.1", () => log(`Webhook listening on 127.0.0.1:${port}`));
}
if (require.main === module) main();
module.exports = { verifySignature, createWebhookServer };
