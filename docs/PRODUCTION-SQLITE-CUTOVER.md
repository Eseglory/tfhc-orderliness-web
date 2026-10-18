# Production SQLite cutover — 15 October 2026

**Live:** the production API now runs on the existing UtilityHub VPS, with SQLite on `/home/ese/tfhc-production/data`. Supabase remains the central PostgreSQL database. The Vercel website and original Render API address are unchanged. Render now runs a database-free compatibility proxy to `https://staging.utilityhub.ng/tfhc`. No new paid infrastructure was provisioned.

## Verified evidence

- Final PostgreSQL backup independently restored: 66 tables and 81 foreign keys, including the four new replication support tables. Evidence: ignored `data/storage-backups/verification-82197a8d-6939-4901-8812-e86f8737ad82/evidence.json`.
- Final import: 61 application models and 5,244 records, with scalar-value comparisons, foreign-key checks and SQLite integrity verification.
- Production replay: checkpoint 153 at the consistency check; all 61 model counts matched Supabase, with 5,244 records and no duplicate receipts. No conflicts or unprotected writes. Later pending operations are expected until the next scheduled replay.
- Authenticated read and unauthorized-access checks passed locally and through both public API routes. Socket.IO polling and actual WebSocket upgrades passed.
- Existing UtilityHub services remained healthy. No synthetic business records were inserted into production for testing.
- Ten focused proxy/routing/backup-safety tests passed after cutover; the broader application and recovery suites were run before activation as documented in the implementation runbook.

Production image: `sha256:18e35b4dcac2822e595ae69b71fc255a7f86dcf0e439f1df03cbdcacabf0e1a3`. The source is the local working tree used for the verified image; implementation changes have not yet been committed or pushed. Preserve the image and source until a reviewed release is recorded.

## Data protection

Each acknowledged mutation commits locally and to the immutable Supabase recovery log before success. Business tables replay at **03:00 and 15:00 Africa/Lagos**. Source leases, unique operation receipts, ordered checkpoints and before-image comparisons prevent independent authorities, duplicate replay and silent conflict overwrites. This still requires Supabase availability for successful write acknowledgement.

The activation backup and manifest remain under `/var/data` inside the container. A verified post-cutover SQLite backup also remains on the VPS at `/home/ese/tfhc-production/data/post-cutover-20261015.db` (SHA-256 `cad44153f599a20388bcb42621ecdad31816edc0e16f5579ad79c3de43b2779f`). Automatic approval review denied exporting that full member-data copy to the local workspace, so it was not transferred. The verified PostgreSQL archive is retained locally and on the VPS, and acknowledged subsequent changes are protected in Supabase.

## Operations

Use SSH profile `staging.utilityhub.ng`; production Compose is `/home/ese/tfhc-production/compose.yml`, private configuration is `production.env`, immutable image selection is `.env`. Never display resolved Compose configuration or environment values in logs. The service is `tfhc-production-api` and binds only to `127.0.0.1:14001`.

Public mode health: `/health/database-sync`. Permissioned detailed health: `/health/database-sync/details` (`reports.view` required). Render `/health` identifies the compatibility proxy and does not attest to upstream database health; use the database-sync endpoint for end-to-end monitoring.

Operator status:

```sh
docker exec tfhc-production-api node apps/api/dist/apps/api/src/database-sync/maintenance.js status --db /var/data/operational.db
```

Manual replay, when operationally required:

```sh
docker exec tfhc-production-api node apps/api/dist/apps/api/src/database-sync/maintenance.js sync --db /var/data/operational.db --allow-central-writes
```

Investigate conflicts rather than skipping them. Never delete pending operations or recovery receipts to make a health check green. The read-only `production-readiness.cjs` and `verify-production-consistency.cjs` helpers are retained in the VPS `prepared` directory. A consistency comparison requires a drained journal and rejects concurrent-write races.

Render autodeploy is disabled. The active Docker command contains the tested standalone proxy source; `deploy/vps/Dockerfile.proxy` and `render.yaml` record the future source-controlled equivalent. Do not restore the old PostgreSQL-writing startup command or use an old Render rollback while SQLite remains active. The Vercel API URL still targets Render, preserving existing clients without needing a Vercel deployment token.

For rollback: stop incoming mutations and the SQLite writer, protect every recoverable local operation, drain business-table replay, verify matching data and retain new backups. Only then restore a PostgreSQL writer. If replay is blocked by a conflict, resolve it before rollback. Keep the original SQLite source, journal, manifest and backups intact. A stopped process's lease can take up to 60 seconds to expire; never create a second source to bypass it.

## Practical limits

The compatibility proxy preserves Render cold starts and adds a network hop; directly configuring Vercel for the VPS later removes that hop. The observed warm authenticated read was 71 ms via the VPS and 398 ms via Render from the test host; these are individual observations, not a load benchmark or SLA. The shared VPS has one CPU and about 1 GB RAM, so Sunday traffic needs ongoing monitoring. Journal retention, disk usage, recovery backlog and external-media backups remain ongoing operational responsibilities. No system can promise absolute zero downtime or zero risk of data loss.
