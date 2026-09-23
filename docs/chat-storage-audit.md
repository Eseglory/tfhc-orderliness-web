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
