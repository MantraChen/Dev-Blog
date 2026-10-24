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
- A writing workspace with automatic draft saves, browser recovery, separate publication, private full-page/split previews, and the latest 30 article versions.
- Paste, drop or select images; validated JPEG/PNG/WebP uploads become resized WebP files. Recent uploads can be reused without uploading again.
- Markdown preview, explicit-language code highlighting, math, Unicode heading anchors, TOC and code copying.
- Public posts paginated in groups of 20, with combined keyword search and tag filters.
- Archives, RSS, sitemap, canonical/OG metadata and BlogPosting structured data.
- Drafts are private. Hidden posts are unlisted and marked noindex, but accessible by direct URL.
- Anonymous views deduplicated by a keyed network identifier and 30-minute bucket; emoji reactions deduplicated per network, post and emoji during their 90-day retention window. Shared IPs can undercount; these are approximate analytics.
- Giscus comments, locally served Geist/KaTeX fonts, dark/light themes, responsive layout and native page transitions.
- FTS5 substring search for 3+ characters; shorter Chinese/other queries retain literal substring matching in a bounded worker, away from the HTTP event loop.

## Writing workflow

Create or edit an article in **Admin → Blog**. Changes save after 800 ms of inactivity into a private working draft, including incomplete titles and slugs. **Publish article / Publish changes** validates and publishes the draft atomically. Existing public content stays unchanged while you edit. **Save draft & close** keeps it in the Working drafts list; **Discard draft** leaves the published article and its history intact. The existing article Delete action is permanent, including its draft and history.

Unsaved changes are also cached in this browser tab. After an interrupted connection or a refresh, reopen the same draft and choose the browser copy or the server copy. This is a recovery aid, not a backup: clearing site storage or closing a tab without restoring its session can make that copy unavailable. Save to the server before closing the browser. Signing out clears browser recovery copies; unsaved edits in the current editor require confirmation. Concurrent tabs cannot silently overwrite newer server drafts. On a conflict, download the working copy before reloading. If the published article itself changed, preserve your edits, discard the old working draft, and reopen the latest article.

Version history stores the latest 30 article versions, beginning with the current version when an existing article is first opened or updated. Autosaves update the working draft rather than adding history entries. Restoring a historical version replaces the working draft; publishing is still a separate action. At most 200 working drafts are allowed.

Images accept still JPEG/PNG/WebP up to 8 MiB and 16,777,216 pixels. Uploads are decoded, metadata is stripped, and the result is compressed to WebP with a maximum edge of 2048 pixels. Original files are not retained. Uploads are private until referenced by a published article; unlisted articles are still public to anyone with their link. Removing all published references revokes public access, but cannot recall copies already downloaded by visitors. Historical and unused files are retained for recovery; monitor disk usage. External image URLs retain their original host's access rules.

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

For the shared server, see [the my_server adapter](deploy/my-server/README.md). Build with `SITE_URL=https://dyyjs.com` and `PUBLIC_BASE_PATH=/howielog` to serve the complete blog at `https://dyyjs.com/howielog/`. Both settings are build-time values; changing them requires rebuilding. Omitting them preserves the standalone `https://howielog.com/` deployment. CI tests both layouts on Linux and Windows.

Deployment builds a new release with `npm ci` and verifies it before stopping the running service. It backs up and migrates SQLite, switches NSSM, checks the exact release and restores the previous service configuration on failure. Old releases and backups are retained for recovery; monitor their disk usage.

Migration `007-writing-workflow.sql` adds working drafts, revision history and image metadata. Uploaded files live in `MEDIA_DIR`, defaulting to a `media` directory beside `DATABASE_PATH`. Production must use an absolute persistent path writable by the service account, outside release directories. **Back up both SQLite and the media directory**: existing deployment/migration backups cover SQLite only. Pause writes, take the SQLite backup and copy the media directory as one recovery set; test restoring both. Keep new media files during code rollback and do not expose the directory through a static Caddy/file-server route, which would bypass draft-image authentication.

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
