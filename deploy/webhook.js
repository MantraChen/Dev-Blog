/**
 * GitHub Webhook Listener for auto-deploy
 * Runs as a separate NSSM service on Windows Server
 *
 * Environment variables:
 *   WEBHOOK_SECRET  - GitHub webhook secret (required)
 *   WEBHOOK_PORT    - Port to listen on (default: 9000)
 *   DEPLOY_DIR      - Path to the blog repo (default: script's parent dir)
 *   SERVICE_NAME    - NSSM service name (default: dev-blog)
 *   DEPLOY_BRANCH   - Branch to deploy (default: main)
 */

const http = require("node:http");
const crypto = require("node:crypto");
const { execSync, exec } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const SECRET = process.env.WEBHOOK_SECRET;
const PORT = parseInt(process.env.WEBHOOK_PORT || "9000", 10);
const DEPLOY_DIR = process.env.DEPLOY_DIR || path.resolve(__dirname, "..");
const SERVICE_NAME = process.env.SERVICE_NAME || "dev-blog";
const BRANCH = process.env.DEPLOY_BRANCH || "main";
const LOG_FILE = path.join(__dirname, "deploy.log");

if (!SECRET) {
  console.error("WEBHOOK_SECRET environment variable is required");
  process.exit(1);
}

let deploying = false;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function verifySignature(payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(payload);
  const expected = "sha256=" + hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function deploy() {
  if (deploying) {
    log("Deploy already in progress, skipping");
    return;
  }
  deploying = true;
  log("=== Deploy started ===");

  // Run deploy in background so webhook can respond immediately
  const script = path.join(__dirname, "deploy.bat");
  exec(`"${script}"`, { cwd: DEPLOY_DIR, windowsHide: true }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      log(`Deploy FAILED: ${err.message}`);
      if (stderr) log(`stderr: ${stderr}`);
    } else {
      log("Deploy completed successfully");
    }
    if (stdout) log(`stdout: ${stdout}`);
  });
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", deploying, service: SERVICE_NAME }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    // Verify GitHub signature
    const signature = req.headers["x-hub-signature-256"];
    if (!verifySignature(body, signature)) {
      log("Invalid signature, rejecting request");
      res.writeHead(401);
      res.end("Invalid signature");
      return;
    }

    // Only deploy on push to target branch
    const event = req.headers["x-github-event"];
    if (event !== "push") {
      log(`Ignoring event: ${event}`);
      res.writeHead(200);
      res.end("Ignored");
      return;
    }

    try {
      const payload = JSON.parse(body);
      const ref = payload.ref || "";
      if (ref !== `refs/heads/${BRANCH}`) {
        log(`Ignoring push to ${ref}, only deploying ${BRANCH}`);
        res.writeHead(200);
        res.end("Ignored");
        return;
      }

      log(`Push to ${BRANCH} by ${payload.pusher?.name || "unknown"}: ${payload.head_commit?.message || ""}`);
      deploy();
      res.writeHead(200);
      res.end("Deploying");
    } catch (e) {
      log(`Failed to parse payload: ${e.message}`);
      res.writeHead(400);
      res.end("Bad request");
    }
  });
});

server.listen(PORT, () => {
  log(`Webhook listener started on port ${PORT}`);
  log(`Deploy dir: ${DEPLOY_DIR}`);
  log(`Service: ${SERVICE_NAME}`);
  log(`Branch: ${BRANCH}`);
});
