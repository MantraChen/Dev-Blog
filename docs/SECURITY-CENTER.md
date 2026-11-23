# Security center

Public routes: `/security`, `/security/advisories/:id`, `/security/response`, `/security/rss.xml`.

Independent response articles are published through the existing admin editor. Add the exact tag `security-response` to a published, visible article to list it on the response page. No separate credentials or publishing system is required. Do not publish unconfirmed external reports as original research.

The read-only web view uses `SECURITY_DATABASE_PATH`, or `security.db` beside `DATABASE_PATH`. This derived public cache is separate from the blog content database. It can be rebuilt from public sources and is not included in the blog's existing content backup format. Keep the sync script and its schedule in deployment backups. Private response articles remain in the existing backed-up blog database.

## Synchronization

Run hourly as an unprivileged account that can write to the persistent directory shared with the blog:

```sh
python3 scripts/security-sync.py --data /srv/blog/data --work /srv/blog/security-worker
```

For the x99 deployment, the 1Panel scheduled shell task runs at minute 17 each hour with the service account selected in the task settings. The script uses Linux flock to prevent overlapping runs. No token, Redis, AI API, or extra Python package is required.

### One-off container rollout

The candidate in `deploy/security-worker/compose.yaml` runs the same script
as a one-off task. In a protected environment file set `SECURITY_SYNC_UID`,
`SECURITY_SYNC_GID`, `SECURITY_SYNC_DATA_DIR` and `SECURITY_SYNC_WORK_DIR`.
Use the existing non-root owner and the exact existing database and work
directories, including the directory with `sync.lock`. Keep the source tree
at the checked-out release commit. The container mounts the script read-only.

From a directory with the checked-out release, validate with isolated data
and work directories before scheduling the production command.

```sh
docker compose --env-file /path/to/security-worker.env \
  -f deploy/security-worker/compose.yaml config --quiet
docker compose --env-file /path/to/security-worker.env \
  -f deploy/security-worker/compose.yaml run --rm --no-deps -T security-sync --source kev
```

Confirm the exit code, the KEV source state, and the database quick check.
For the hourly run, omit `--source kev` to use all sources. Configure 1Panel
to invoke the pinned command from a Docker-capable scheduler context. The worker
process runs with the configured unprivileged UID/GID. Keep one hourly job.
After the manual verification and after any native sync exits, replace the
existing job command in place, preserving minute 17. Validate the next run's
exit status, source cursors, and public page. Roll back by restoring the previous
native command, keeping the same database, work directory, and lock. No
credential file or Docker socket is mounted in the sync container.

- GitHub reviewed advisories: initial official repository archive; hourly change discovery via OSV's global modified index and direct fetches from the official GitHub repository. A fresh repository snapshot every seven days reconciles upstream removals and changes. This avoids the server's unauthenticated GitHub API rate limit.
- OSV npm, PyPI, Maven, crates.io and Go: initial archives, then per-ecosystem modified indexes. Malware-only `MAL-` packages are excluded. GitHub records are deduplicated against the authoritative source.
- CISA KEV: complete catalog snapshot each run; validates count and rejects unexpected shrinkage. Removal of a KEV label is not the same as withdrawal of the vulnerability itself.
- Failed sources keep their previous data and cursor. Successful sources publish independently. States show last attempt, last success and retry status; success older than three hours is shown as stale.
- Aliases are grouped transitively. Source-specific descriptions, severity assessments and affected-version events are kept separately. Conflicting ratings are disclosed; no CVSS score is invented or recalculated.
- Chinese summaries use deterministic factual templates. Titles and descriptions retain source language. No AI translation is configured or billed.

### Synchronization health

`GET /api/security/status` returns HTTP 200 with `{"status":"ok"}` when the
published index is available and all seven feed jobs have a valid successful
publication within the last three hours. It returns HTTP 503 with `stale` if
a feed has no recent success, or `unavailable` if the index cannot be read or
is empty. The response contains only the aggregate status and disables caching.
The three-hour window tolerates occasional upstream fetch errors. A failed
publication keeps its previous success timestamp and cursor for a retry.

After deploying both the site and the updated hourly task, add a Kuma HTTP
monitor for `/api/security/status` that expects HTTP 200. Keep the general site
health check so a feed delay can be handled independently of an outage.

## Verification

`npm run test:http` uses Python 3 to publish a synthetic advisory before
starting the local server. Set `PYTHON` when the interpreter is off PATH.

`python3 -m unittest discover -s tests -p test_security_sync.py -v` checks alias merging, source withdrawals, idempotence, cursor safety and unsafe URLs. `node tests/security-http.mjs` checks live pages, search and filters, unknown advisory 404, HTML attribute escaping, RSS, response page and homepage. Set `SECURITY_TEST_ORIGIN` to the candidate's origin. Run `npm run check` and `npm run build` before container publication.

GitHub data is CC BY 4.0; links and attribution are shown on the site. OSV retains upstream data-source licensing. All imported descriptions are rendered as text, never as executable HTML or instructions.
