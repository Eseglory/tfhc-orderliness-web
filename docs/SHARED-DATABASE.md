# Shared database on the existing hosting

> Current production status: the SQLite cutover is LIVE as of 15 October 2026. See [the production cutover record](PRODUCTION-SQLITE-CUTOVER.md). The earlier preparation/rehearsal status below is historical and does not describe the current deployment.

**Status:** The user has superseded this PostgreSQL-primary proposal with SQLite-first operations and twice-daily Supabase synchronization. See `SQLITE-FIRST-IMPLEMENTATION.md`. PostgreSQL remains active in production only until the SQLite storage, backup and cutover requirements pass; this file records the fallback configuration, not the requested target architecture.

The supported no-additional-cost configuration uses the existing PostgreSQL database as the operational source of truth. Local and hosted frontend clients communicate with the authenticated NestJS API over HTTPS. Database credentials belong only on the API server. Do not distribute the SQLite file or PostgreSQL credentials to frontend clients.

PostgreSQL is already the default when `OPERATIONAL_DATABASE` is unset; setting it explicitly to `postgresql` has the same effect. The API uses a maximum of three PostgreSQL connections per process by default and respects an explicitly configured `connection_limit`. No SQLite bootstrap, daily replication, new database, or data migration is needed for this approach. Existing SQLite implementation remains opt-in and must not be activated on ephemeral hosting.

Use the working Render runtime `DATABASE_URL`; the committed local value was found to differ. Never overwrite the working runtime value from the repository. Local development and automated tests use an isolated database; they must not share the production database. Automated PrismaService clients reject non-local test URLs before client construction, including attempts to override the host through query parameters. Test credentials and database files are disposable.

No deployment or production configuration changes have been made for this implementation. Before deployment, coordinate rotation of credentials committed to Git, verify the production backup/restore procedure, and run application regression checks. Render automatic deployment is enabled, so pushing main can deploy changes. Free hosting can still sleep or impose resource limits; keeping PostgreSQL avoids relying on container files for durable application records but does not eliminate those hosting limitations.

## Backup rehearsal status

`node scripts/verify-production-backup.cjs --read-only-production-backup` uses the runtime database connection obtained privately from Render. It dumps only `public` under read-only session settings and restores into a disposable local PostgreSQL container without an exposed port. It retains the archive and verification evidence under ignored `data/storage-backups/`; provider authentication schemas and external media are outside its scope. Set `TFHC_BACKUP_IMAGE` only to a trusted PostgreSQL image compatible with the source server.

The authorized rehearsal **passed on 2026-10-15** using the cached PostgreSQL 17.5 backup client and an isolated PostgreSQL 18.4 restore server. It restored 62 public tables and 79 foreign keys. The archive and SHA-256 evidence are in `data/storage-backups/verification-eaf0608a-5757-4f54-a3b9-0baf6bd58284/`. Previous empty files are failed attempts, not backups.

The tool writes an archive inside its temporary client container and uses `docker cp` afterward because Docker cannot bind-mount this workspace's E: drive. It waits for the restore server's final TCP listener (not the temporary initdb server), removes only the fresh test database's empty public schema before restoring, and runs the restore container with no network access. All test containers are removed afterward. It rejects paths outside the local backup directory and invalid archive headers before starting Docker.

The successful tool selections were `TFHC_BACKUP_IMAGE=postgres:latest` (verified 18.4), `TFHC_BACKUP_CLIENT_IMAGE=dpage/pgadmin4:latest`, and `TFHC_BACKUP_CLIENT_BINARY=/usr/local/pgsql-17/pg_dump` (verified 17.5). These are local tool images, not production database settings. The production database remains Supabase.
