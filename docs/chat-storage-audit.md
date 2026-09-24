# Chat storage audit — 2026-09-23

No upgrade, deployment, restart, reconciliation, deletion or production database write was performed during this audit.

## Findings

Production startup logs confirm SQLite at `/app/data/chat_shared.db` within the Render API container. The Render API reports the service is on the free plan and has no attached persistent disk. No SQLite path override is configured. This is container-local storage, not a shared remote SQLite server.

The local configuration also has no SQLite path override. Code resolves `data/chat_shared.db` against the process working directory, so launching from the repository root or from `apps/api` selects different files. No running local file handle was confirmed during the audit.

| Local file (relative to repository) | Messages | IDs absent from shared PostgreSQL |
| --- | ---: | ---: |
| `data/chat_shared.db` | 25 | 0 |
| `apps/api/data/chat_shared.db` | 50 | 24 |
| `apps/api/data/chat_realtime_buffer.db` | 10 | 0 |

All three files mark all their messages MIGRATED, but that flag alone is not proof of current PostgreSQL persistence. The 24 unmatched records must be retained and investigated; they were not automatically reinserted because they could be intentionally deleted or test records. ID presence does not establish equality of every message field.

Local and production DATABASE_URL destinations match by host, database and username (credentials were not printed). A read-only PostgreSQL query found 26 chat messages. The shared database is PostgreSQL, not SQLite. Production logs at 17:12:36 UTC show 26 messages imported into its SQLite file; this is historical evidence, not a live count of pending production writes.

## Backups

Consistent SQLite backup API snapshots are saved at `data/storage-backups/20260923-184127/{root,api,legacy}.db`, with file permissions 0600. The API and legacy backups include committed WAL contents. The root file had no WAL and was opened immutable/read-only. An additional copy remains under `/private/tmp/tfhc-chat-storage-audit-20260923-184127`.

These are local snapshots, not a backup of the production container's current SQLite file. No source database was reset or replaced. Production pending-write status and complete content parity remain unverified; deployment remains on hold.

## Recovery and cleanup completed — 23 September 2026

The observations above describe the pre-repair snapshot. Subsequent user-authorized recovery changed the state as follows:

- Backed up PostgreSQL chat records and live API messages before cleanup. All 26 accessible production messages existed in the PostgreSQL snapshot; production reported no pending or failed SQLite writes.
- Preserved all 24 unmatched local records in a durable PostgreSQL audit entry (`CHAT_SQLITE_RECOVERY_SNAPSHOT`, recovery ID `d8a1ecc52fec75c2e3e2ef26048e52286fce96dcc1d974ea3a94225ce2dca713`) and private local backups.
- Removed 20 explicit local test records from active SQLite storage into an archive. Soft-deleted the two production communication-verification messages through the existing API and removed their 64 backed-up test notifications.
- Restored three ambiguous historical records with valid original relationships, preserving IDs, contents and timestamps. One image whose original conversation no longer exists remains archived, not discarded or assigned to a guessed conversation.
- Verified all 24 original non-test PostgreSQL messages were unchanged. PostgreSQL and each reconciled local SQLite copy contained the same 29 message IDs (27 visible and two test tombstones); SQLite integrity checks passed.
- Pinned local configuration to the repository-root `data/chat_shared.db`. Default path resolution now uses the installed repository location, independent of the launch directory. Legacy copies remain preserved.
- Sending now requires PostgreSQL confirmation and a durable notification-work record before success is returned. A failed primary write leaves the client operation retryable. PostgreSQL notification recovery survives loss of the SQLite queue. SQLite and the existing noon/midnight reconciliation remain enabled. No paid infrastructure upgrade was made.
- Verification: 24 SQLite/migration unit tests passed; 19 API/WebSocket integration tests passed, including primary-write failure/retry and notification recovery without the SQLite queue. The API build passed. Jest still reported a worker-shutdown warning after passing assertions.

Recovery files are under `data/storage-backups/recovery-20260923/`, with private file permissions and explicit Git/Docker/Vercel exclusions. These measures protect the inspected records and acknowledged writes; they do not constitute an absolute guarantee against every possible future failure.

## Final readiness checks — 24 September 2026

The isolated release passed 30 SQLite/migration regressions, 19 API/WebSocket integration tests with clean shutdown, and seven desktop/mobile browser checks. Live pre-release reads matched all 29 primary message records across six conversations; pending, processing and failed SQLite counts were all zero. Authenticated WebSocket reconnect succeeded. Generation-aware change cursors recover after an ephemeral SQLite rebuild, while midnight/manual reconciliation also checks historical backfills.
