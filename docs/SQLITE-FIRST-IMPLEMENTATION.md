# SQLite-first implementation and activation runbook

> Current production status: the SQLite cutover is LIVE as of 15 October 2026. See [the production cutover record](PRODUCTION-SQLITE-CUTOVER.md). The earlier preparation/rehearsal status below is historical and does not describe the current deployment.

2026-10-15: implemented locally; **production remains unchanged**. SQLite-first operations use twice-daily Supabase business-table synchronization at 03:00 and 15:00 Africa/Lagos plus immediate remote recovery protection before write acknowledgement. A read-only production `public`-schema backup has now been restored successfully into an isolated local database: **62 tables and 79 foreign keys**. No production deployment, schema change, migration or paid infrastructure purchase was performed. Synthetic application tests used temporary SQLite databases and disposable local PostgreSQL, never the production database.

The verified backup and checksum evidence are retained under ignored `data/storage-backups/verification-eaf0608a-5757-4f54-a3b9-0baf6bd58284/`. The rehearsal covers public application schema/data, not provider-managed auth, roles, or external media. All rehearsal containers were removed. Backup tool safeguards also passed three unit tests. The existing UtilityHub VPS has now passed a synthetic SQLite container-replacement rehearsal on its ext4 bind mount and a read-only Supabase connectivity check. Its test database was deleted afterward. See [VPS staging results](../deploy/vps/README.md). Production activation still requires HTTPS routing, production configuration, capacity checks, coordinated credential rotation, and an approved writer cutover; the activation guard remains enabled.

## 1. Files created or modified

New files in `apps/api/src/database-sync/`:

- `sqlite-prisma-adapter.ts`, `sqlite-bootstrap.ts`: application-wide routing, type conversion, consistent snapshot import and per-record verification.
- `sqlite-journal.ts`, `sqlite-journal.worker.ts`, `sync.types.ts`: transactional capture, checkpoints, verified backups and worker RPC.
- `postgres-destination.ts`, `sync-runner.ts`, `daily-sync.job.ts`: ordered PostgreSQL replay and daily scheduling.
- `recovery-journal.ts`, `operational-lease.ts`, `recover-sqlite.ts`: recovery protection before acknowledgement, writer fencing and disaster recovery.
- `database-mode.ts`, `storage-preflight.ts`, `activation.ts`, `maintenance.ts`: activation guards and operator commands.
- `replication-receipts.sql`: additive PostgreSQL support tables, deliberately outside automatic migrations.
- `sqlite-request.interceptor.ts`: atomic HTTP mutations and persisted retry responses after authorization guards.

Build/routing changes: `.gitignore`, `apps/api/scripts/generate-sqlite.cjs`, `apps/api/scripts/start.cjs`, `apps/api/package.json`, `apps/api/src/prisma/prisma.service.ts`, `app.module.ts`, `app.controller.ts`, `main.ts`. PostgreSQL schema and dependency versions are unchanged. Generated SQLite schema/client files are ignored and recreated during the API build.

Business integration: chat service/gateway/controllers, resumable upload controller, members upload controller, wardrobe upload controller, webhook service, service reminder service, and finance payment service. Notifications/broadcasts start after commit; multipart interception runs after parsing; payment confirmation/rejection uses conditional status changes to prevent double application.

Browser changes: `apps/web/src/lib/api.ts`, new `mutation-retry.ts`. Session storage retains request hashes and random retry keys, not bodies or credentials.

New tests: `sqlite-app-integration`, `sqlite-prisma-integration`, `sqlite-postgres-live`, `sqlite-operational-journal`, `postgres-sync-destination`, `daily-database-sync`, `sqlite-storage-preflight`, `sqlite-maintenance`, `sqlite-finance-integration`, `sqlite-chat-integration` under `apps/api/test/`, plus `tests/unit/mutation-retry.test.cjs`. The shared finance acceptance suite now creates reference fixtures, respects current permissions and tests concurrent confirmation. Earlier Sunday-attendance, loader and profile-photo edits were preserved.

## 2. SQLite-first operations

`OPERATIONAL_DATABASE` defaults to `postgresql`. Explicit `sqlite` mode routes every existing Prisma business model through an independently generated SQLite Prisma client. A separate PostgreSQL client handles replication/recovery. Conversion covers the current complete Prisma schema, compound keys, relations, enum validation, JSON, JSON null versus SQL NULL, scalar lists, bytes and date-only fields. Existing attendance locks, leaderboard SQL and chat read-receipt SQL are adapted at this boundary.

SQLite uses rollback journaling (`journal_mode=DELETE`), foreign keys and `synchronous=FULL`. The installed Node SQLite is 3.47.2, which predates the [SQLite WAL-reset corruption fix](https://www.sqlite.org/wal.html#walreset). Avoiding WAL removes that specific multi-connection race without changing the application's Prisma major version. Re-enabling WAL requires verifying patched SQLite versions in **both** Prisma and Node and rerunning recovery/concurrency checks. Rollback journaling can block readers during commits; native Prisma queries are asynchronous and journal/backup work runs in a separate Node worker. The local write queue is bounded. SQLite still has one writer, and long mutations can delay other writes. Case-insensitive searches currently scan the relevant local column, so production-sized search/load tests remain necessary.

Bootstrap creates a **new** file from a consistent read-only PostgreSQL snapshot, verifying copied records, per-model counts, foreign keys and integrity. Startup refuses missing files and schema drift against generated code. Future SQLite schema changes require a reviewed offline migration; PostgreSQL automatic migration deployment is skipped in SQLite mode.

## 3. Daily synchronization

Nest starts business-table sync at **03:00 and 15:00 Africa/Lagos**, twice daily: batches of at most 100 operations/10 seconds within a 30-minute window. Async replay yields between operations. Each operation's row changes, receipt and checkpoint commit in one PostgreSQL serializable transaction.

SQLite triggers capture inserts, updates, deletions and foreign-key effects in the business transaction. UUIDs, ordered sequences and SHA-256 payload digests identify operations. PostgreSQL receipts prevent duplicate replay after a crash between remote commit and local acknowledgement. Pending operations, conflicts and retry timestamps survive restarts. A conflict blocks dependent operations instead of skipping them. Transient failures remain pending for the next scheduled run or explicit manual retry.

The process must be running at 03:00 and 15:00 for on-time synchronization; no external scheduler is provisioned. On application bootstrap, a background check replays a backlog whose oldest pending operation predates the latest scheduled slot, catching up a missed run after sleep/restart. Existing chat cache reconciliation runs at both scheduled times, using the selected operational database.

- `/health/database-sync`: public mode summary without private records or paths.
- `/health/database-sync/details`: requires authentication and `reports.view`; reports backlog, conflicts, unprotected writes, checkpoint, oldest pending time and schedule status.
- Maintenance `status` reads durable state. Scheduler logs contain status/counts, not row payloads or credentials.

## 4. Data protection and conflicts

Twice-daily sync alone cannot prevent loss of acknowledged writes if the SQLite disk disappears. Production therefore requires `SQLITE_DURABILITY=postgres-journal`: commit business data and the journal locally, commit an immutable recovery record to PostgreSQL, **then acknowledge success**. The main PostgreSQL business tables update at the two scheduled times. Production PostgreSQL remains Supabase; Docker PostgreSQL is used only for disposable tests and restore rehearsals.

This retains a PostgreSQL write per mutation. PostgreSQL availability and network latency remain part of write acknowledgement. A failed recovery commit produces `503 / WRITE_CONFIRMATION_PENDING`; the local change remains intact. Browser retries reuse the same key; chat retains existing operation IDs across HTTP and Socket.IO. Callers must preserve keys after uncertain responses: a new key represents a new operation.

A PostgreSQL lease fences independent SQLite writers. It is pinned to one source identity, refreshed every 15 seconds and checked inside recovery-record transactions. An unclean restart can require up to 60 seconds for expiry. Independent replicas and simultaneous PostgreSQL-mode writers are unsupported; stop the former writer before cutover.

Replay compares full prior row values, including JSON-null distinctions, and stops on conflicting central edits. There is no automatic last-write-wins merge. Constraints, rollback and conditional payment updates guard duplicates. Recovery preserves operation receipts and cached HTTP results.

Offline recovery refuses an active lease, replays protected operations into PostgreSQL and builds a **new** SQLite snapshot. It never overwrites an existing SQLite file. Conflicts stop recovery for review. The old writer must remain stopped throughout. Unacknowledged writes present only on a lost disk cannot be reconstructed from PostgreSQL; PostgreSQL itself still needs verified independent backups.

## 5. Validation

The live suite requires explicit opt-in and rejects any endpoint other than `127.0.0.1:55519/tfhc_e2e`. No destructive test targets production.

Coverage includes full Nest boot, staff login, permissions, service scalar lists, geofenced/concurrent attendance and actual leaderboard SQL; 17 chat acceptance scenarios including HTTP/Socket.IO retries and media; six finance scenarios in SQLite and separately PostgreSQL mode; transactional rollback, bulk duplicates, process restarts, failed connections, conflicts, JSON-null distinctions, real replication, relationship/deletion semantics, recovery-log protection, lost-disk reconstruction, fencing, backup restoration, checksum tampering and activation/schema guards. Existing Sunday, profile, chat and authorization regressions and browser account/retry tests were also run.

Final results: 79 database/integration checks across 10 suites, 81 existing API regression checks, 21 browser checks, and six additional finance checks in PostgreSQL mode passed (187 test executions). SQLite generation, the Nest API build, API/web TypeScript checks and `git diff --check` passed. The full-app Jest run initially exceeded its compiler heap; validation was rerun with isolated test transpilation and separate TypeScript checking. Local tests do not establish 100% production reliability or replace a production-sized staging load test and hosting restart/redeploy rehearsal.

## 6. Remaining infrastructure requirements and costs

- The existing UtilityHub VPS ext4 bind mount passed container-replacement retention with synthetic related records. Production must use a separate private directory and exactly one active API writer. This does not establish survival of host disk loss; remote recovery protection and independent backups remain necessary.
- The production PostgreSQL public-schema backup passed isolated restoration with 62 tables and 79 foreign keys. Refresh and verify the backup during the final stopped-writer cutover. Provider-managed auth and external media need their own recovery coverage.
- Alerts for backlog age, conflicts, unprotected writes, disk space and PostgreSQL availability. Journal/recovery history is retained; no automatic deletion policy was introduced. Offline recovery loads retained history in memory, requiring capacity planning as it grows.
- Production-sized Sunday traffic/search/media benchmarks. External email and push retain their existing delivery semantics; this is not a distributed exactly-once guarantee for third-party providers.

The existing free Render service has no persistent disk and cannot host this authoritative file safely. The user-authorized existing VPS now provides the tested storage candidate without provisioning a new paid service. Its shared one-CPU/1-GB capacity still needs realistic load validation before production cutover. Until that cutover, production remains unchanged in PostgreSQL operational mode.

No paid service was provisioned. Render's [official cost guide](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), checked 2026-10-13, lists disks at $0.25/GB/month and gives a July 2026 API-plus-small-Postgres example of about $13/month before storage/traffic. A rough planning estimate from that historical example plus 5 GB disk is **$14.25/month**, excluding PostgreSQL storage, backups, traffic, taxes and upgrades. This is not a current quote or the account bill; verify instance prices before purchase. No permanent free-production assumption is made.

## 7. Exact activation and recovery steps

These are operator instructions, **not actions already executed against production**. Deployment and production database changes still require explicit authorization. Configure credentials through a secret manager/environment, not command arguments or logs.

1. Build/test staging: `yarn workspace @tfhc/api build`. Generation contacts no database. Use a validated Node runtime with built-in `node:sqlite` (the existing image uses Node 22).
2. Choose a persistent mount, e.g. `/var/data`, and one API instance. Rehearse restart/redeploy retention using disposable staging data. Put the DB, journal sidecars, chat cache and activation backup under the mount; grant the non-root runtime user filesystem access.
3. Stop all API, scheduled and administrative writers for cutover. Back up PostgreSQL; restore it into an isolated database and verify counts/relationships. Keep an off-host copy. Create private evidence JSON:

   ```json
   {"backupPath":"/secure/pg-before.dump","sha256":"<64-character SHA-256>","restoreVerified":true}
   ```

   The CLI checks the file hash. `restoreVerified` attests to the operator's independent PostgreSQL restore; the CLI does not perform that restore.
4. With production migration authorization, apply `apps/api/src/database-sync/replication-receipts.sql` once using a transaction-capable PostgreSQL connection. It adds support tables only. PUBLIC access is revoked and RLS enabled. The backend must own these tables or receive reviewed restricted grants/policies; never grant browser/anonymous access. Do not run Prisma `db push` against production.
5. Securely set maintenance `DATABASE_URL` to the intended PostgreSQL source. While writers remain stopped:

   ```text
   yarn workspace @tfhc/api sqlite:maintenance bootstrap --out /var/data/operational.db --writers-stopped --backup-evidence /secure/pg-backup-evidence.json
   yarn workspace @tfhc/api sqlite:maintenance backup --db /var/data/operational.db --out /var/data/activation-backup.db
   ```

   Compare returned per-model counts with the source. Journal initialization first creates its own verified pre-journal snapshot. Retain all original files.
6. After actual retention/single-writer checks, create the manifest on the Linux host:

   ```text
   yarn workspace @tfhc/api sqlite:maintenance activation-manifest --db /var/data/operational.db --backup /var/data/activation-backup.db --out /var/data/activation.json --redeploy-retention-verified --single-writer-verified
   ```

   This opens a separately restored copy, checks integrity/foreign keys/identity, and records the immutable backup hash. Evidence remains valid across subsequent restarts. Do not overwrite the referenced backup.
7. Configure the approved deployment:

   ```text
   OPERATIONAL_DATABASE=sqlite
   SQLITE_DATABASE_PATH=/var/data/operational.db
   SQLITE_DURABILITY=postgres-journal
   SQLITE_ACTIVATION_MANIFEST=/var/data/activation.json
   CHAT_SHARED_DB_PATH=/var/data/chat.db
   DISABLE_SCHEDULED_JOBS=false
   ```

   Retain the central `DATABASE_URL`. Start exactly one writer. Startup checks evidence/schema/lease and protects pending recovery records. No empty-file fallback occurs.
8. Smoke-test authentication, authorization, attendance, chat/media, notifications and finance. Check authorized health details, verify recovery protection, and conduct one controlled replay. Monitor the first 03:00 run and compare records/relationships before declaring cutover complete.
9. Inspection/manual retry commands:

   ```text
   yarn workspace @tfhc/api sqlite:maintenance status --db /var/data/operational.db
   yarn workspace @tfhc/api sqlite:maintenance protect --db /var/data/operational.db --allow-central-writes
   yarn workspace @tfhc/api sqlite:maintenance retry --db /var/data/operational.db --operation <operation-id>
   yarn workspace @tfhc/api sqlite:maintenance sync --db /var/data/operational.db --allow-central-writes
   ```

   Reconcile conflicts before retry: this command does not alter payloads or discard evidence. Manual sync is bounded to 1,000 operations/30 seconds per invocation; repeat for remaining pending work, never skip conflicts.
10. Disk-loss recovery: fence/stop the old writer, wait for lease expiry, verify a fresh PostgreSQL backup, then use a new destination:

    ```text
    yarn workspace @tfhc/api sqlite:maintenance recover --source <saved-source-id> --out /var/data/recovered.db --writers-stopped --backup-evidence /secure/pg-backup-evidence.json --allow-central-writes
    ```

    Validate counts/backup and create a new activation manifest for that path. Start only the recovered authority. Conflicts stop recovery for review. Never switch back to PostgreSQL with unsynchronized writes: stop writes, preserve files, protect/drain the journal, verify equality, then perform the approved rollback.

Commands use `ts-node` through the workspace script. Production images can run compiled `apps/api/dist/apps/api/src/database-sync/maintenance.js` with the same arguments. Neither entry point deploys infrastructure or replaces an existing SQLite database.

## Additional readiness validation (2026-10-13)

Added `apps/api/test/sqlite-concurrency.spec.ts`: 256 transactions in batches of 32 concurrent callers, each creating a user and related audit record while a simulated destination drains the journal. It verifies all 512 records, relationship integrity, 256 distinct replay receipts, restart continuity, and an empty final backlog. The local run passed (transaction latency p50 104 ms, p95 284 ms, p99 371 ms). These timings exclude network protection, HTTP, and a real PostgreSQL destination; they are not production capacity estimates. The existing journal and maintenance suites also passed again (17 tests), including abrupt process exit and backup verification. An initial test assertion used an incorrect fixture column name; it was corrected to the schema's `actorUserId` before the passing run.

Production access discovery found no configured database or Render credential variables in the process environment or standard project environment files. `render.yaml` specifies free services without persistent disks. Actual hosting state, production backup restore, and redeployment retention therefore remain unverified. Do not activate SQLite on that basis. No deployment or production data modification was performed.

### Follow-up after pulling main at `94a6485`

Authenticated read-only Render inspection now succeeds. The live API is a single free instance in Oregon with zero persistent disks and automatic deployment enabled. Its runtime database URL differs from the newly committed local configuration. `SELECT 1` succeeds using the runtime URL; the local URL failed to connect. Runtime configuration does not enable SQLite operational mode or its activation settings. Never push activation changes casually: automatic deployment is enabled.

The current hosting arrangement cannot satisfy persistent SQLite storage. A paid persistent disk/compute decision or another verified persistent host is required before activation. Backups, restore rehearsal, retention across redeployment, and staging load tests remain outstanding. The newly tracked environment files also contain credentials: coordinate rotation and removal from tracked files/history without disrupting running services. Do not copy their contents into reports, logs, or tickets. No production deployment, settings change, or data mutation was performed during these checks.

### Isolated failure validation

Added `sqlite-write-protection.spec.ts` with a temporary SQLite database and simulated remote recovery log. It verifies that a remote outage produces HTTP 503 semantics rather than acknowledging an unprotected write, preserves the record and pending operation across adapter restart, returns the original result on a stable-key retry without rerunning the mutation, and rejects reuse of that key with a different payload. Cleanup validates the temporary path, removes the database directory, and asserts its removal. No production database is contacted by this test.

The focused validation run passed 45 tests across eight suites: write protection, concurrency, operational journal, maintenance, Prisma compatibility, storage preflight, daily scheduling, and destination conflict handling. All test SQLite databases created by these suites are temporary and removed by their cleanup hooks. This does not replace a real production backup/restore rehearsal or persistent-host validation.
