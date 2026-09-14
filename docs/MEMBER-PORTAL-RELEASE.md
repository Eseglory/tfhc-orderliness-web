# Member portal release

This release includes the advanced PWA implementation and the complete current
member/admin application changes requested by the owner. Credentials and local
validation artifacts are excluded from Git.

## Corrections

- Verify authorization on every request and reject staff accounts at member Google sign-in.
- Validate attendance correction input, membership and meeting visibility; refresh cached totals after approval.
- Preserve recurring meeting identifiers during regeneration.
- Never create, reset, reactivate or promote an account during application startup.
- Prevent invalidated in-flight reads from restoring stale cached records.
- Keep mobile header controls reachable; isolate dialogs from page layout and preserve keyboard focus.
- Expose calendar, files, offline settings and absence requests from member home.
- Retain explicit server confirmation for payments, attendance, welfare and message sending.

## Production database preparation

A read-only comparison on 2026-09-13 found the production schema already matches
the full application schema. The migration history is incomplete because schema
objects were previously created outside migration deployment.

Before deployment, recheck that comparison and abort if it differs. Record the
following existing migrations as applied without rerunning their historical data
updates, then deploy the remaining backend-only RLS migrations:

- 20260909150000_recurrence_exceptions
- 20260909160000_approval_engine
- 20260909170000_finance
- 20260909180000_chat
- 20260910000000_email_auth
- 20260910220000_chat_performance_indexes
- 20260912160000_pwa_push
- 20260912180000_pwa_advanced
- 20260913080000_member_portal_completion

Create the four historical optional chat indexes concurrently if absent. Enable
backend-only RLS through `20260913090000_backend_table_access`, preserving owner
access and denying direct database Data API access. Check that the API database
role owns the tables or bypasses RLS before applying that change. Use bounded lock
and statement timeouts. Do not reset the database, delete records or rerun the
historical staff password backfill.

## Deployment

Use the existing GitHub repository and Render API/web services, and the existing
Vercel project. Configure the existing VAPID key pair privately on the Render API;
configure `PWA_API_URL` on both web hosts. Record previous deployment IDs for
rollback. Verify the production API health, push configuration, worker/manifest,
offline route and web/API connection after deployment.

## Validation status

Validation is ongoing. Logs are in the gitignored `.validation/` directory.
Release approval requires passing builds, API regressions, member flows and PWA
lifecycle checks. Browser-specific unsupported capabilities retain fallbacks;
real Google account sign-in and physical-device push receipt require provider/device
validation beyond simulated automated provider responses.
