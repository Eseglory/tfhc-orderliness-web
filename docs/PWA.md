# PWA audit and operating contract

## Audit before implementation (2026-09-12)

The repository is a Yarn 4 workspace: Next.js 15 App Router / React 18 web,
NestJS 11 API, Prisma 5 / PostgreSQL, and shared domain functions. Existing
uncommitted changes are preserved. There is no Sites hosting configuration.

Routes include public authentication, `/member/*` (attendance, calendar,
notifications, chat, profile, dues, welfare, availability and requests), and
`/admin/*` (operations, finance, reports, permissions and administration).
Root AuthGate verifies `/auth/me`; AuthProvider holds React context and a cached
profile. Pages otherwise use local React state and `fetchApi`. API origin is
`NEXT_PUBLIC_API_URL`, with existing localhost / Render defaults. JSON, multipart
and bearer headers are handled centrally. API errors carry HTTP status; there
was no general retry or idempotency mechanism. Chat uses cursor pagination;
notification listing is capped at 100. Business routes retain existing contracts.

JWTs expire after seven days, use localStorage for remembered sessions and
sessionStorage otherwise, with no refresh-token flow. Password changes invalidate
older tokens server-side. Logout stamps an audit event and clears local state.
Google Calendar refresh tokens are server-side integration credentials.
The existing profile cache contains identity and permissions; it is not offline
authority. Authentication and RBAC remain server-authoritative.

Existing PWA: manifest, branded PNG/maskable icons, static offline document and a
handwritten worker. No Workbox, IndexedDB or background queue dependencies.
The previous worker activated immediately, deleted unrelated origin caches,
and cached arbitrary unauthenticated same-origin GETs. Next build assets were
network-only. Registration disabled localhost even in production builds.

Socket.IO `/chat` authenticates with JWT and retries ten times; unread badges poll
every 30 seconds. Live meeting screens also poll. Existing notifications live in
`member_notifications`; scheduled services and approval workflows generate them.
SMTP delivery exists, but no Web Push subscription or delivery implementation.
Chat attachments and profile photos are limited to 2 MB, normalized with sharp,
and stored as data URLs. Imports accept existing spreadsheet/CSV flows; reports
are generated server-side. No chunked/resumable upload protocol exists.

Web deploys through Vercel or standalone Docker; API through Render/Docker.
CI builds shared/API/web and runs Jest. Playwright covers PWA, auth, roles and
devices; its normal suite requires an isolated local PostgreSQL database.
Environment names inspected without exposing values: NEXT_PUBLIC_API_URL,
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID, DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN,
GOOGLE_OAUTH_CLIENT_IDS, TFHC_TIMEZONE, SMTP_*, DISABLE_RATE_LIMIT and bootstrap /
deployment secrets. Next public variables are build-time values.

## Implemented capabilities

| Area | Implementation and operating limits |
| --- | --- |
| Installation | Existing branded icons, maskable icons, stable manifest ID, standalone display, platform install prompt, Apple metadata, check-in/calendar/activity shortcuts. |
| Caching | Versioned public shell and cache-first immutable Next resources, bounded to 160 entries. Network-only authenticated HTML/RSC/API with a standalone offline workspace on network failure. Only TFHC caches are cleaned. |
| Offline workspace | Explicitly saved calendar snapshots and excuse/chat drafts, accessible without fetching the authenticated application. Offline access requires an online-verified account lease (24 hours maximum) and a separate offline passphrase. |
| Secure persistence | IndexedDB schema v2, AES-256-GCM with owner/item associated data, PBKDF2-SHA256 with 250,000 iterations and random salt. Passphrases and derived keys are never persisted. Up to 100 records / 20 MB encrypted content; drafts expire after seven days and schedules after 24 hours. |
| Queue and conflict handling | Explicit notification IDs only, account partitioning, seven-day expiry, 100-operation bound, transaction leases, timeouts, eight attempts, exponential backoff with jitter, conflict/permanent-failure review and discard. Draft revision checks reject stale overwrites. |
| Closed-app synchronization | Service worker replays notification reads through a same-origin HttpOnly, SameSite=Strict cookie bridge. API stores only a hash of the narrowly scoped device grant and rechecks account, ownership, expiration and revocation. No bearer JWT is copied into IndexedDB or worker storage. |
| Browser fallback | Browsers without Background Sync retry on online/focus and every 15 seconds while the app is visible. OS scheduling is browser-controlled. Payments, check-ins, approvals and message submission remain server-authoritative and require connectivity. |
| Push | Member opt-in, VAPID, bounded per-user subscriptions, provider validation, unread-notification scheduler, database delivery leases, expiry/revocation, retry/backoff and invalid-endpoint cleanup. Generic lock-screen text avoids private message content. |
| Updates and tabs | Explicit update/reload action; other tabs are not forcibly reloaded. BroadcastChannel and IDB leases coordinate notification reads. Remembered-account changes discard rendered account data. Logout clears private offline data. |
| Sharing and files | Escaped UTF-8-folded iCalendar export, native file/text share and download fallback. Manifest share target and file handlers feed a bounded encrypted review inbox; users select a chat and explicitly send. File-picker fallback works without OS integration. |
| Resumable uploads | 256 KB chunks for existing 2 MB chat attachments, SHA-256 verification, offset reconciliation, duplicate-chunk acknowledgement, pause/retry/cancel, persistent upload IDs, and idempotent final message creation. Reselecting the same file after reload resumes it. Server upload records expire after 24 hours. |
| Real-time recovery | Existing Socket.IO architecture retained, reconnect backoff and history reconciliation preserve pending messages and recover missed history. Failed text sends restore the composer. |
| Network and performance | Online/offline/limited-connectivity status, no private media prefetch, bounded caches and lazy optional icon font. Login uses lightweight SVG icons. |
| Observability | Web Vitals LCP/CLS/INP and bounded operational metrics through the existing API/logger. Collector validates names/numbers and discards URLs, user IDs and arbitrary fields; browser respects Do Not Track. Push delivery logs exclude endpoints, keys and content. |
| Accessibility | Live status/error announcements, labelled controls, keyboard controls, touch targets and responsive layouts. Automated WCAG A/AA checks cover the standalone offline workspace in desktop Chromium and mobile WebKit. |

## Security and data boundaries

The existing remembered/session JWT storage contract is unchanged. The new offline
stores contain no raw login credentials. Cached identity is never authorization.
Server RBAC remains mandatory for all operations. The scoped cookie can only mark
explicitly owned notifications read; it cannot send messages or authorize business
mutations. Production must serve HTTPS. The cookie expires no later than the main
session, and logout/password/account revocation is checked on the server.

Offline passphrases are separate from login passwords. Closing/reloading a tab
locks the vault, and forgotten offline passphrases require clearing saved data.
Only explicitly selected schedules and drafts are persisted. Do not save payment
credentials or secrets in draft text. Local encryption does not protect against
malicious JavaScript executing in an unlocked application.

Incoming shares use a nonextractable, device-local CryptoKey so the OS can deliver
files without asking for the offline passphrase. This key is stored in IndexedDB,
so this temporary inbox has a different protection boundary from the passphrase
vault. It accepts at most ten incoming items, up to three files of 2 MB each and
10,000 text characters per item; items expire after ten minutes. Files are never
automatically uploaded. Unassigned incoming shares survive sign-in for review.

No route HTML, RSC responses, financial/attendance APIs, private attachments or
authentication responses are stored in Cache Storage. Saved calendar snapshots
exclude meeting links and unnecessary member data. Offline editing updates local
drafts only; it does not claim that a server mutation succeeded.

## Deployment

Build shared, generate Prisma, build API and web through the existing Yarn/Docker
pipeline. The API container already runs its migration deployment script before
starting. Migration failures now stop startup instead of silently starting against a missing schema. This change adds three backward-compatible migrations:

- `20260912160000_pwa_push`: push subscriptions.
- `20260912180000_pwa_advanced`: scoped device sessions, resumable uploads and
  nullable unique chat operation IDs.
- `20260912200000_pwa_backend_only_rls`: backend-only access to PWA tables.

Local API VAPID settings were generated with `node scripts/configure-pwa.cjs` without printing secrets or rotating an existing keypair. Configure the same stable API-only settings in the production secret environment before enabling push:

```dotenv
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key; secret environment setting>
VAPID_SUBJECT=mailto:<operator email>
```

Never put the private key in NEXT_PUBLIC variables or source control. Keep a
stable keypair across deployments; rotation requires device resubscription.
Configure web server `PWA_API_URL` to the API origin (falls back to
`NEXT_PUBLIC_API_URL`). The same-origin `/api/pwa/*` bridge must remain dynamic;
static export alone cannot support closed-app authenticated synchronization.

Keep `/sw.js` at the origin root with no-store headers and the manifest
revalidated. Increment the worker `VERSION` when shell resources change. Updates
wait for the user's explicit action, preserving unsaved work in other tabs.

Push is an at-least-once hint, coalesced by notification tag/provider topic.
A crash after sending can repeat a hint. Expired subscriptions and 404/410
responses are removed; transient failures back off. Explicit browser permission
is required. Browser support for installation, Background Sync, incoming shares
and file handlers varies; unsupported capabilities use the documented UI fallback.

## Verification

```sh
yarn build:shared
yarn workspace @tfhc/api prisma:generate
yarn workspace @tfhc/api test --runTestsByPath test/pwa.spec.ts test/pwa-advanced.spec.ts test/pwa-database.spec.ts test/member-profile.spec.ts test/auth-email.spec.ts
yarn build:api
NEXT_DIST_DIR=.next-pwa NEXT_TELEMETRY_DISABLED=1 yarn build:web
yarn exec playwright test --config playwright.pwa.config.ts
node scripts/audit-pwa.mjs
```

Database integration tests require `PWA_TEST_DATABASE_URL` pointing to an isolated
local PostgreSQL database named `tfhc_pwa_e2e`. Without it they skip. The suite
refuses remote/production databases. Both additive migrations were applied to an
isolated PostgreSQL instance, then tests verified actual chunk resume, concurrent
completion producing exactly one message, scoped replay and logout revocation.
The focused API run passed **51 tests across five suites**. API and production
web builds passed; existing unrelated lint warnings remain.

The final browser run passed **37 tests**, with one Chromium-only Background Sync case explicitly skipped on WebKit. The browser suite uses actual production web builds, Cache Storage, IndexedDB,
service workers and a local HTTP fixture. It covers offline reload, encryption,
TTL, draft conflicts, account isolation, two-tab leases, retry/failure handling,
update consent, share intake, safe deep links, calendar exports, HttpOnly grants,
closed-app Chromium sync, and the Activity UI reconnect flow. The Activity UI
fixture disables service workers because WebKit-controlled requests bypass route
mocks; actual worker replay is tested separately against the HTTP fixture.

Mobile Lighthouse audit of the production build: **login 98 performance / 100
accessibility / 100 best practices; offline workspace 100 / 100 / 100**. Full
machine-readable reports are in `docs/pwa-audits/`. These are local lab results,
not field guarantees. The dedicated PWA quality GitHub workflow runs the focused
unit/browser checks and retains traces on failure.

Production deployment and real-device push receipt are separate release checks;
local test success does not establish that new code is live. Physical iOS/Android
installation, OS file association and real push-provider delivery require an
installed browser and explicit device permission.

## Platform references

[MDN service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API),
[Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API),
[Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API),
[Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target),
and [File Handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling).

## Release follow-up

The isolated release preserves production business routes and adds a calendar
fallback to `/meetings/calendar` when the newer feed endpoint is unavailable.
Password and Google sign-in both restore safe deep links. A release database
test exposed a Prisma upsert race; completion now recovers the existing message
when concurrent requests hit its unique operation ID.

Production tables already contain the PWA schema but migration history is behind.
Automatic approval review rejected the proposed database reconciliation. See
[PWA-ROLLOUT.md](PWA-ROLLOUT.md) and [the exact SQL](PWA-PRODUCTION-REPAIR.sql)
for the specific approval required before production deployment.
