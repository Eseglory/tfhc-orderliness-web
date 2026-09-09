# Supabase / Render database setup

The API's ignored `apps/api/.env` contains the Supabase transaction-pooler URL with percent-encoded credentials, TLS enabled, `pgbouncer=true`, and a connection limit of 10. Credentials are not stored in the Blueprint or this document.

On 8 September 2026, the target database was empty. Eight migrations were applied through the session-mode pooler (port 5432), including row-level security for all application tables and migration metadata, and removal of the retired native push-device table. Backend Prisma reads were verified afterward. No demo accounts or sample data were seeded. The first administrator, `engreseglory@gmail.com`, and five meeting categories were provisioned. Password login and authenticated account retrieval were verified against Supabase. The generated password is stored only in the ignored, permission-restricted `apps/api/.env.bootstrap-admin` file.

The backend connects as the table owner, which bypasses RLS and enforces authorization in NestJS. Supabase `anon` and `authenticated` roles have no RLS policies; they cannot read/write application rows directly through the Data API. Do not add broad public policies for this backend-only architecture.

For future migrations, use the same pooler host on port 5432, removing `pgbouncer=true`; use port 6543 for application traffic.

## Remaining Render step

An authenticated Render connection is required. Add `RENDER_API_KEY` to the ignored API `.env` (or the process environment), then run:

```sh
node scripts/configure-render-database.cjs
```

The script identifies the unique `tfhc-orderliness-api` web service, updates only its `DATABASE_URL`, and reads it back to verify the saved value without printing secrets. If the service has another name or is ambiguous, set `RENDER_SERVICE_ID` explicitly. Redeploy the API service afterward to activate the changed environment.

`render.yaml` now declares `DATABASE_URL` with `sync: false` rather than linking it to Render PostgreSQL. The existing Render database resource declaration is retained; no existing database was deleted. Editing the Blueprint locally does not change a live service.

References: [Render environment-variable API](https://api-docs.render.com/reference/update-env-var), [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
