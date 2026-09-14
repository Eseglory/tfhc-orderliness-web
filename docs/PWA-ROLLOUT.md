# Previous PWA rollout assessment

Superseded by [the full member portal release](MEMBER-PORTAL-RELEASE.md). The owner has since authorized committing, pushing and deploying the complete application after validation. The assessment below records the earlier PWA-only scope and review boundary.

# PWA production rollout awaiting approval

The isolated release is based on live commit `638632a20924953649c1bd6fb689a5b0a9eae095`.
It contains PWA changes, preserves existing business endpoints, and excludes other
unfinished workspace features and environment credentials.

## Evidence

A read-only Prisma comparison found that every release table, column, modeled
index and relation already exists in production. Production also has additional
business columns/tables, which the release does not remove. Eight migrations are
absent from the history despite their schema objects existing. Backend-only RLS
is disabled on tables from several of those migrations. Production VAPID settings
are not configured. Both Render services still run the original live commit.

## Exact approval requested

1. Apply `PWA-PRODUCTION-REPAIR.sql`: enable the existing backend-only RLS policy
   on the listed tables and create four missing optional chat indexes concurrently.
   The API connects as table owner and continues to enforce application RBAC.
   Direct Supabase anonymous/authenticated access to these tables will be blocked.
   DDL can briefly contend with active transactions; lock/statement timeouts bound it.
2. Baseline the eight migration names below using Prisma `migrate resolve --applied`,
   then apply the new PWA RLS migration through `migrate deploy`. This records the
   verified existing schema rather than re-running duplicate CREATE statements.
   Preserve all current business records and authentication settings. In particular,
   do not rerun the historical email-auth backfill, which could change existing
   staff authentication state.
3. Set API VAPID keys and subject in Render's secret environment; set the web-only
   server `PWA_API_URL` in Render/Vercel. Never publish the private key.
4. Deploy the reviewed PWA release to the existing API and web projects, verify
   health, push configuration, secure cookie bridge, worker version and offline mode.

Migration names to baseline:

- `20260909150000_recurrence_exceptions`
- `20260909160000_approval_engine`
- `20260909170000_finance`
- `20260909180000_chat`
- `20260910000000_email_auth`
- `20260910220000_chat_performance_indexes`
- `20260912160000_pwa_push`
- `20260912180000_pwa_advanced`

## Rollback

Retain current deployment IDs and migration-history metadata before changing them.
If application smoke checks fail, restore the previous deployment. The new schema
is additive and is compatible with that code. Keep backend-only RLS enabled unless
an explicitly reviewed access-control rollback is required; disabling it can expose
private data through the database Data API. Do not automatically delete tables or
migration records during rollback.

## Approval boundary

Automatic approval review rejected the combined production database repair because
it changes RLS, migration history and indexes. No production database repair or code
deployment has been executed. The release branch and local checks can be completed
without this approval. Physical device push permission/receipt remains a separate
browser interaction; automated tests cannot grant a user's device permission.

The GitHub release-branch push was also rejected by automatic approval review.
Approval must explicitly authorize publishing this isolated PWA release to
`https://github.com/Eseglory/tfhc-orderliness-web`, branch
`codex/advanced-pwa-release-20260912`, as well as the production rollout above.
The source is reviewable locally at `/private/tmp/tfhc-pwa-release-20260912`.
It passes 51 API/database tests and 37 browser tests (one unsupported WebKit
Background Sync case skipped). The final Lighthouse login scores are
98 performance / 100 accessibility / 100 best practices; offline is 100/100/100.
