# Windows deployment

## Runtime and service prerequisites

Use Node.js **22.23.4 or newer** (Node 24 LTS recommended), npm, Git, NSSM and Caddy. Upgrade Node before deploying this branch. Run deployment under an account allowed to manage the blog service.

Keep the database outside versioned releases. Before the first deployment, configure the blog's NSSM `AppEnvironmentExtra` with all of these values, preserving any existing settings:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=4321`
- `DATABASE_PATH=C:\\sites\\dev-blog\\data.db` (use the actual existing database, an absolute path)
- `ADMIN_PASSWORD_HASH=<bcrypt hash>` (runtime environment, never commit a password or hash)

Use `nssm edit dev-blog` → Environment to avoid putting secrets in shell history. Restrict database, backup, release and log directory ACLs to the service/deployment accounts and administrators. The deployment account also needs the same Node major version as the blog, because SQLite uses a native addon.

The application and webhook bind only to loopback. Only Caddy should accept internet traffic. Use [Caddyfile.example](Caddyfile.example), replace the domain, and update `security.allowedDomains` and `site` in `astro.config.mjs` if using a different hostname. Caddy replaces forwarded client headers; exposing the Node port directly would invalidate the IP rate-limit trust boundary.

## Deployment

Commit the migration, source and package lock, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\sites\\dev-blog\\deploy\\deploy.ps1
```

The script fetches `origin/main` into a new `.releases/<commit>-<id>` directory, runs `npm ci`, type checking, regression tests, production build and production dependency audit while the current service stays online. A lock prevents simultaneous manual/webhook deployments.

After validation, it stops the service, backs up the existing SQLite database using SQLite's backup API, applies versioned additive migrations, updates NSSM to the new release and starts it. `/api/health` checks the database schema and identifies the exact built commit. Failed migration/switch/health checks restart the previous configuration. Native command failures are checked, including NSSM failures.

Old releases and database backups are retained intentionally. Monitor disk usage and remove only releases no longer used by NSSM or needed for rollback. Do not edit already applied migrations; add a new migration to `scripts/migrate.mjs`.

Rollback restores application code, **not the database**. The current migrations are additive and keep legacy columns so the previous code can read them. For future destructive changes, design a separate migration/recovery plan. Restoring a backup can lose writes made after that backup; stop the service and restore only after selecting and validating the correct snapshot. Periodically rehearse recovery on a separate machine, and keep off-host backups.

## GitHub webhook

Generate a secret with a cryptographic generator:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
nssm install dev-blog-webhook "C:\\Program Files\\nodejs\\node.exe" "C:\\sites\\dev-blog\\deploy\\webhook.cjs"
nssm set dev-blog-webhook AppDirectory "C:\\sites\\dev-blog"
nssm edit dev-blog-webhook
```

Configure `WEBHOOK_SECRET`, `WEBHOOK_PORT=9000`, `DEPLOY_DIR=C:\\sites\\dev-blog`, `DEPLOY_BRANCH=main`, `SERVICE_NAME=dev-blog` in the webhook service's Environment tab. Configure NSSM stdout/stderr files and log rotation for both services.

In GitHub → Settings → Webhooks, use `https://howielog.com/webhook`, content type `application/json`, the same secret and only push events. The listener verifies the raw body signature, limits the payload to 1 MiB and queues a follow-up build when a push arrives during deployment.

The long-running webhook uses the script in its own checkout. When deployment tooling changes, update that checkout with `git pull --ff-only` and restart the webhook service. Do this manually for the initial migration from the old deployment pipeline, after verifying environment settings and a backup.

```powershell
nssm start dev-blog-webhook
Invoke-RestMethod http://127.0.0.1:9000/health
Invoke-RestMethod http://127.0.0.1:4321/api/health
```

This repository's tests simulate deployment failures without changing Windows services. They cannot verify a real server's NSSM permissions, Caddy configuration, disk capacity or backup recoverability.
