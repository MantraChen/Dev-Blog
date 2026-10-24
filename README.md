# Howie Sun — Dev Blog

Personal technical blog built with Astro 7 SSR, React 19, Tailwind CSS 4, SQLite and Drizzle ORM. Markdown is stored in SQLite and rendered with marked, highlight.js, KaTeX and a final HTML allowlist sanitizer.

## Local development

Use **Node 24.22.1+ within Node 24** and npm. Patched Node 22 (22.23.4+) and Node 26 (26.12.1+) are also supported. Installation and build reject older vulnerable versions.

```powershell
npm ci
npm run db:migrate
npm run dev
```

The default local database is `data.db`. Set `DATABASE_PATH` to use another file. Migrations bootstrap new databases and adopt existing schemas without dropping content. Existing databases are backed up before pending migrations are applied.

Set `ADMIN_PASSWORD_HASH` in the **server process environment** before starting the app. Use a bcrypt hash generated from a strong password, and keep it out of Git, logs and shell history. Production cookies are Secure, HttpOnly and SameSite=Strict; use HTTPS for admin access. A local HTTPS proxy is needed for admin testing on hosts that do not allow Secure cookies on localhost.

## Features

- Admin CRUD for posts, projects, statuses, skills, timeline and friend links.
- Markdown preview, explicit-language code highlighting, math, Unicode heading anchors, TOC and code copying.
- Public posts paginated in groups of 20, with combined keyword search and tag filters.
- Archives, RSS, sitemap, canonical/OG metadata and BlogPosting structured data.
- Drafts are private. Hidden posts are unlisted and marked noindex, but accessible by direct URL.
- Anonymous views deduplicated by a keyed network identifier and 30-minute bucket; emoji reactions deduplicated per network, post and emoji during their 90-day retention window. Shared IPs can undercount; these are approximate analytics.
- Giscus comments, locally served Geist/KaTeX fonts, dark/light themes, responsive layout and native page transitions.
- FTS5 substring search for 3+ characters; shorter Chinese/other queries retain literal substring matching in a bounded worker, away from the HTTP event loop.

## Validation and CI

```powershell
npm run check
npm test
npm run build
# or the complete suite, including production HTTP validation:
npm run verify
npm audit
```

GitHub Actions runs checks, regression tests and builds on Linux and Windows. Windows tests exercise deployment control flow with mocked NSSM operations; production service management requires server validation.

Security controls include streamed JSON body limits, schema validation, session cookies, same-origin mutation checks, bounded SQLite-backed rate limits shared across local processes, strict hash-based script CSP, no-store admin/API responses, Markdown sanitization and signed deployment webhooks. A dependency audit is one input to review, not proof of complete security.

Astro's ClientRouter is intentionally disabled because it does not support the built-in CSP. Normal links and native browser transitions preserve navigation; React admin panels still work without full reloads within a panel. Styles retain inline permission for KaTeX and React; scripts never use `unsafe-inline` or `unsafe-eval`.

## Deployment

See [the Windows deployment guide](deploy/setup.md) and [Caddy example](deploy/Caddyfile.example). Configure an absolute database path, runtime password hash and loopback binding in NSSM before using the new pipeline.

See [the environment assessment](docs/ENVIRONMENT.md) for the minimal-risk Linux alternative, and [the systemd template](deploy/linux/README.md) for a staged trial.

Deployment builds a new release with `npm ci` and verifies it before stopping the running service. It backs up and migrates SQLite, switches NSSM, checks the exact release and restores the previous service configuration on failure. Old releases and backups are retained for recovery; monitor their disk usage.

Never use `drizzle-kit push --force` against production. Add versioned migrations to `scripts/migrate.mjs`; keep applied migrations immutable. Existing historical Drizzle SQL files are retained for baseline adoption and regression tests.

Raw views are retained for 30 days, reaction identities and audit logs for 90 days; daily view totals and reaction totals are kept. Background cleanup runs in batches every 15 minutes. For historical backlog, `npm run db:maintain` previews eligible records and `npm run db:maintain -- --apply` creates a verified backup before cleanup. `npm run doctor` checks the current process environment and database without printing secrets. Old code that only counts raw rows cannot display lifetime totals after cleanup; keep a rollback release that understands the aggregates.

## Structure

- `src/pages`: SSR pages and JSON endpoints
- `src/components`: public UI and React admin panels
- `src/lib`: authentication, validation, Markdown and request helpers
- `src/db`: SQLite connection, schema and queries
- `scripts/migrate.mjs`, `migrations`: versioned database migration runner
- `tests`: security, API, data migration and deployment regressions
- `deploy`: webhook, staged release script and Windows setup
- `docs/REVIEW.md`: code review findings, validation and remaining risks

## License

Source code: [MIT](LICENSE). Blog content displays CC BY-NC 4.0 attribution in the footer.
