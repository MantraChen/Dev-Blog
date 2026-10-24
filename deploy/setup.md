# Windows deployment

## Runtime and service prerequisites

Use **Node 24.22.1 or newer within Node 24** (recommended), npm, Git, NSSM and Caddy. Patched Node 22.23.4+ or 26.12.1+ within those majors also work. The install/build/deploy checks reject older patch levels and unsupported majors. Upgrade Node before deploying this branch. Run deployment under an account allowed to manage the blog service.

Keep the database outside versioned releases. Before the first deployment, configure the blog's NSSM `AppEnvironmentExtra` with all of these values, preserving any existing settings:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=4321`
- `SITE_URL=https://howielog.com`
- `PUBLIC_BASE_PATH=/`
- `WEBAUTHN_ORIGIN=https://howielog.com`
- `DATABASE_PATH=C:\\sites\\dev-blog\\data.db` (use the actual existing database, an absolute path)
- `ADMIN_PASSWORD_HASH=<bcrypt hash>` (runtime environment, never commit a password or hash)

Use `nssm edit dev-blog` → Environment to avoid putting secrets in shell history. Restrict database, backup, release and log directory ACLs to the service/deployment accounts and administrators. The deployment account also needs the same Node major version as the blog, because SQLite uses a native addon.

Use the same `SITE_URL` and `PUBLIC_BASE_PATH` in the deployment/webhook process that builds the release. Remove previous `dyyjs.com` / `/howielog` overrides before rebuilding; changing only the runtime environment cannot change already bundled URLs. The supplied Caddy example serves `howielog.com`. Domain changes require a fresh admin login and registering passkeys for the target domain. Existing remote backup tags also depend on site/base: retain the old snapshots and inspect the new backup target before enabling automatic retention.

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

## Remaining-review fixes and operations

Migrations 005/006 add an FTS5 index, shared rate-limit state, a database-local HMAC secret, daily views and reaction totals. Index creation needs temporary disk space and write downtime on first migration. Test the migration on a production backup and measure its duration before scheduling the maintenance window.

Run `npm run doctor` under the service's environment to check runtime, explicit database path, loopback binding, password configuration, SQLite consistency, pending migrations, disk headroom and backups. It does not print password hashes or visitor identifiers. Missing values in an interactive shell do not prove NSSM is misconfigured; run with equivalent settings.

Background retention deletes up to 2,000 eligible records per table every 15 minutes: views older than 30 days, reactions/audit records older than 90 days, and expired sessions/limits. Aggregates preserve lifetime counts. For initial historical backlog, preview with `npm run db:maintain`; apply with `npm run db:maintain -- --apply`, which creates and integrity-checks a backup before bounded cleanup. Check the reported remaining backlog. Keep off-host snapshots and manage old backup/release/log disk usage; the app never automatically deletes recovery backups.

After retention has run, old code that counts only raw rows will show incomplete historical statistics. Prefer a rollback release supporting the aggregate tables; reverting the application does not restore deleted detail rows. Preserve the pre-migration backup, and never restore it over new writes without an explicit recovery decision.

Rate-limit quotas now survive restart and are shared by processes using this same local database. This is not a multi-host design; never share the WAL database through SMB/NFS. Anonymous statistics use keyed IP deduplication, so shared NAT can undercount and rotating networks can still inflate counts. The Node port must remain inaccessible from the internet.

For a future OS replacement, see [the environment assessment](../docs/ENVIRONMENT.md). The current PowerShell webhook deployment is Windows-only; the Linux candidate intentionally starts with manual staged releases.
