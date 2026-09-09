# PWA readiness — 8 September 2026

The supported application is the Next.js web PWA. Native application files, native OAuth configuration, device registration endpoints and the push-device database model have been removed. Historical migrations remain so existing databases can upgrade safely.

## Accounts and database

Eight migrations have been applied to the supplied Supabase database. All remaining public application tables and migration metadata have row-level security enabled, with no public Data API policies. The API enforces role and ownership checks using its backend database connection.

The first administrator is `engreseglory@gmail.com`. Its generated password is in the ignored, mode-0600 `apps/api/.env.bootstrap-admin` file. Password login and authenticated account retrieval were verified against Supabase. No demo members were provisioned. Administrators can approve/revoke member Google access through the member directory; linked account emails cannot be reassigned. Concurrent first Google logins are handled transactionally.

## Security and performance changes

JWT configuration is required; production cannot disable rate limiting. Request DTOs reject invalid or injected fields, member performance is access-controlled, and member meeting responses omit other members' attendance and contact data. Dashboard queries aggregate in PostgreSQL and leaderboard queries no longer make a query for each member. Fonts are local. Remember Me now controls persistent versus session-only token storage.

The dependency set was audited with Yarn, including development dependencies, with no security advisories reported. This is an advisory check, not a guarantee that no vulnerability exists.

## Validation

API integration: 59 tests passed against isolated PostgreSQL. Unit tests: 21 passed. Browser coverage includes admin and member routes, member Google-access administration, responsive layouts, PWA metadata/service workers, offline navigation, permission denial, and signed QR scanning through synthetic camera video followed by real attendance persistence. Chromium, WebKit and Firefox are exercised, including mobile-sized Chromium and WebKit contexts. The full 389-case run passed 386 cases and identified two Safari camera failures and one Firefox history-navigation timeout. After scanner/media-test corrections and playback recovery, all 25 targeted camera, permission and history cases passed across the five browser contexts, including five new playback-gesture cases. All 394 distinct scenarios therefore have passing coverage across these runs; this was not a single uninterrupted 394-case run. API/web production builds and lint passed.

## Outstanding external validation

The live Render environment has not been changed because authenticated Render access is unavailable. `scripts/configure-render-database.cjs` prepares the targeted secret update once access is available; redeployment is required afterward.

A Google OAuth client of type **Web application** with the deployed origin authorized is still required. Native OAuth credentials cannot replace it. `yarn setup:google <downloaded-web-client.json>` installs the public client ID into local API/web configuration. Real Google sign-in therefore remains unverified.

Physical-phone installation, camera/GPS behavior and production performance require validation on the deployed HTTPS application. Automated passing results establish tested scenarios; they do not establish 100% correctness.
