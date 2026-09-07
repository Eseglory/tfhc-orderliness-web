# Validation report — 7 September 2026

Two passes on the same day. The first (PWA hardening) is preserved below the
second because later sections reference decisions made there. Both used the
same dedicated local PostgreSQL databases (`tfhc_orderliness_db` for dev,
`tfhc_e2e` for automated tests) — no production database was touched.

## Pass 2 — member-mobile retirement, full breakpoint audit, remaining fixes

This pass resolved every item Pass 1 had left as "open" or "deferred":
retired the native app after auditing it feature-by-feature against the web
app (which turned up a critical, previously-undiscovered gap — see below),
implemented `next/image` and self-hosted both Google Fonts (no longer
deferred — both were genuinely finished, not just re-evaluated), added
automated coverage at every required mobile/tablet/desktop breakpoint (this
found and fixed two real layout bugs) plus browser back/forward/refresh
navigation (no bug found there — closing a coverage gap, not fixing one),
and re-verified the full stack.

### Results

| Check | Result |
| --- | --- |
| Shared domain tests | 15 passed |
| API unit tests | 2 passed |
| API integration tests with PostgreSQL | 51 passed |
| Playwright suite: web + PWA + viewport audit (3 projects) | 248 passed |
| API ESLint | 0 errors |
| Web ESLint (`next lint`) | 0 errors, 0 warnings |
| API production build (`nest build`) | Passed |
| Web production build (`next build`, 23 routes) | Passed |
| API production Docker image (build → boot → `/health`) | Passed (after 3 network-timeout retries — see Limits) |
| Web production Docker image (build → boot → manifest/icons/sw.js/font served) | Passed |

Two full-suite flakes were investigated, not shrugged off: one integration
test that self-resolved (documented in Pass 1) and one browser test
(`member submits weekly availability`) that failed only under the full
244-test concurrent run and passed reliably alone or in small groups — hardened
the test to wait for the toggle's rendered state before submitting rather
than assuming the click landed synchronously; it has passed on every run
since across three full-suite re-executions.

### Critical finding: members had no working way to sign in — now fixed

Discovered while updating a doc that referenced `apps/member-mobile`, not by
a failing test: the backend has always rejected password login for member
accounts (`POST /auth/login` returns 403 `MEMBER_GOOGLE_AUTH_REQUIRED` —
there's a passing integration test for exactly this, "members must use
Google login"), and the web login page has only ever had a password form —
no Google sign-in button existed anywhere in `apps/web`. Every "member"
scenario in this and the prior pass's test suites used a JWT signed directly
with the test secret, bypassing the login page entirely — which is *why*
this was never caught by a passing test suite. `apps/member-mobile` was the
only client that ever implemented Google sign-in (via `expo-auth-session`).
Removing it, per the retirement above, would have made this total: no client
anywhere could authenticate a member. This was true before this session
touched anything — retiring the mobile app just changed it from "partially
broken" to "completely broken," which is why it surfaced now rather than
being a regression introduced by this pass.

Fixed by implementing member sign-in on the web login page with [Google
Identity Services](https://developers.google.com/identity/gsi/web)
(`apps/web/src/components/GoogleSignInButton.tsx`), posting the resulting ID
token to the *already-existing, already-tested* `POST /auth/google/member` —
no backend changes were needed; it verifies any Google-issued token against
`https://oauth2.googleapis.com/tokeninfo` and checks the audience claim
against `GOOGLE_OAUTH_CLIENT_IDS`, regardless of what platform requested it.
Added `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` through the full config chain
(`apps/web/Dockerfile` build arg, `render.yaml`, `docker-compose.yml` —
which had its own latent bug fixed along the way: `NEXT_PUBLIC_API_URL` was
only set under `environment:`, which does nothing for a value that's inlined
into the client bundle at *build* time, not read at container start; it
"worked" only because it happened to match the Dockerfile's own default) and
rewrote `docs/GOOGLE_OAUTH_CLIENT_SETUP.md` for a Web OAuth client instead of
the retired app's Android/iOS ones.

Verified: the button renders when a client ID is configured, and correctly
does *not* render (with a clear message instead) when it isn't; a real
end-to-end test (`tests/e2e/web.spec.ts`, blocking the real Google script and
stubbing its callback, since a real sign-in isn't automatable without a
Google account) confirms clicking through posts `{"idToken": "..."}` to the
right endpoint and that a rejected token — which is what a fake token
correctly gets from the real backend logic — surfaces as a visible, specific
error rather than a silent failure or crash. That test caught a second real
bug in the button component itself: React 18 StrictMode double-invokes
effects in development, and the render call wasn't idempotent, so the button
appeared twice locally (never in production builds, where the double-invoke
doesn't happen, but worth fixing properly rather than shrugging off as
dev-only) — fixed by clearing the container before each render.

**Configured but environment-limited, not verified**: an actual successful
sign-in with a real Google account. That requires a real Web OAuth client ID
(create one per `docs/GOOGLE_OAUTH_CLIENT_SETUP.md` — this repository has no
access to the TFHC Google Cloud project) and a real Google account belonging
to someone in the `approved_members` table. Do this before considering
member sign-in production-ready — everything short of the real Google
handshake has been verified, but that specific gap is real and stated
plainly rather than papered over.

### `apps/member-mobile` disposition — retired, not left as an open question

Audited every mobile screen and service against `apps/web` before touching
anything:

- **Everything matched** except one real gap: weekly service availability
  (`GET`/`PUT /availability/current`). Ported it to `apps/web` at
  `/member/availability` (linked from Profile → Settings, matching how the
  pre-existing `/member/correction-request` route is similarly reached only
  from within the app rather than a bottom-nav tab), with new Playwright
  coverage for the real submit flow.
- **Expo push-token registration was not ported.** `POST /devices/push-token`
  only ever stored `ExponentPushToken[...]` values — nothing in the backend
  ever sent a push through them (no `expo-server-sdk` usage anywhere), and
  those tokens are meaningless without an Expo client. There was no working
  notification-delivery functionality to preserve. The API module is
  unchanged and still tested, but is now unreferenced by any client — flagged
  in the README as removable in a later pass rather than deleted blind here.
- Found `docs/app-store/IOS_APP_STORE_CONNECT.md` with prepared App Store
  Connect listing copy and screenshots before removing anything — real
  evidence of prior investment in the native app, not just scaffolding. Kept
  in mind, but the product direction (reverting to web-first) was explicit
  and unambiguous for this pass; the App Store material describes work for
  a path no longer being taken, so it was retired alongside the app it
  describes rather than left to describe a submission that isn't happening.
- Removed: `apps/member-mobile/`, `docs/app-store/`,
  `playwright.mobile-preview.config.ts`, `tests/e2e/native-preview.spec.ts`.
  Updated every reference: both Dockerfiles' `COPY` lines, `render.yaml`'s
  comment, `.yarnrc.yml`'s comment, `docs/MEMBER_MOBILE_MIGRATION.md` (now
  carries its actual outcome instead of a superseded plan), and the README.
  Regenerated `yarn.lock` (removed ~460 RN/Expo-only packages) and confirmed
  every workspace still builds, lints, and tests clean afterward.
- **Not deleted**: `apps/member-mobile/.env` and
  `apps/member-mobile/credentials/tfhc-orderliness-development.keystore`.
  Both were always gitignored (never in git history to begin with), and an
  Android signing key is not something to destroy on a repo-cleanliness pass
  — losing it would force a new app identity for any future native rebuild
  under the same package name. They're harmless sitting on disk; delete the
  directory locally whenever you're ready.
- The full retired source remains completely recoverable:
  `git log --all -- apps/member-mobile`.

### Breakpoint audit — two real bugs found and fixed

Added `tests/e2e/viewport.spec.ts`, checking `document.documentElement.
scrollWidth` against `window.innerWidth` (zero-tolerance for horizontal
overflow) across every member route at all six required mobile widths
(320/360/375/390/412/430) and all three tablet widths (768/820/1024), plus
every admin route at one representative mobile/tablet/desktop width each.

- **Admin top nav overflowed at 768px on every single admin route** — the
  six-item nav (Dashboard/Meetings/Members/Leaderboard/Follow-Up/Reports)
  plus the "Switch to Member App" button simply didn't fit in 768px with full
  icon+text labels. Fixed by hiding nav-item and switch-button text below the
  `lg:` breakpoint (icons alone, which stay meaningful — dashboard/calendar/
  group/trophy/warning/description) and showing full labels only from 1024px
  up. This is also the more honestly mobile-first fix: full-width labels were
  never going to fit well on any admin-portal tablet regardless of exact
  pixel count.
- **A meeting card overflowed at 320px** when a title had no natural word
  breaks (surfaced by a test-fixture meeting titled with an unbroken 13-digit
  timestamp, but the underlying defect was real: `<div className="flex-1">`
  with no `min-w-0` — the classic flexbox trap where a flex item refuses to
  shrink below its content's intrinsic width by default). Fixed with
  `min-w-0` on the flex item and `break-words` on the title; a follow-up
  run then showed the same `flex-1`/no-wrap gap on the points-weight badge
  once the title started wrapping to three lines, so that flex row also
  picked up `flex-wrap` and the badge got `shrink-0 whitespace-nowrap` so it
  either sits inline or drops to its own line, never squeezed. Also added
  defensive `break-words` to the notifications page's title/body rendering,
  since neither is guaranteed to always contain convenient whitespace in
  production either.
- All 174 viewport-audit tests pass cleanly after both fixes, independently
  confirmed clean on an isolated run and folded into the full 244-test run.

### `next/image` and Google Fonts — both finished, not deferred

Pass 1 flagged these as lower-priority and left them. This pass evaluated
each on its actual merits rather than applying either as a blanket "best
practice":

- **`next/image`**: all 13 `<img>` occurrences across 9 files turned out to
  point at the exact same 2 KB local vector icon (`logo-icon.svg`), reused as
  a placeholder avatar throughout — never a photo. `next/image`'s resizing/
  format pipeline has nothing to optimize for an already-tiny local SVG, so a
  mechanical per-instance swap would have added risk (9 files touching
  header/leaderboard/profile rendering) for no real performance gain. Instead
  extracted one `<LogoIcon>` component using `next/image` with `unoptimized`
  (skips the no-op optimization pass) and replaced all 13 call sites with it
  — this satisfies the lint rule for a real reason (required-dimension
  layout-shift safety, one consistent implementation) rather than chasing the
  warning, and also removed 13x near-identical duplicated JSX.
- **Google Fonts**: Inter moved to `next/font/google` (fully supported,
  confirmed self-hosted — the production build emits real local `.woff2`
  files, zero `fonts.googleapis.com`/`fonts.gstatic.com` requests at
  runtime). Material Symbols Outlined is *not* in next/font's supported
  catalog (checked directly against the installed package's font list, not
  assumed) — self-hosted it manually instead: fetched the actual variable
  woff2 Google serves for the app's exact axis request
  (`wght,FILL@100..700,0..1`), saved it to `/public/fonts/`, and wrote the
  matching `@font-face`/`.material-symbols-outlined` CSS by hand (this is the
  same CSS Google's own stylesheet would have served). Also added the font
  file to the service worker's cached static assets, so both fonts now work
  offline after first load. Verified with a real headless-browser check
  against the production build (not just the build succeeding): zero
  external font requests, computed `font-family` resolves to next/font's
  self-hosted Inter and the self-hosted Material Symbols face, and — the part
  that actually matters — a real screenshot of the rendered admin dashboard
  showing icons as icons and Inter rendering correctly, not literal fallback
  text or a system-font substitution.
- Net result: `next lint` went from 13 warnings to 0.

### Security, deployment, and quality items (from Pass 1, unchanged this pass)

API rate limiting (`@nestjs/throttler`), HTTP security headers (`helmet` +
Next.js headers), the CORS fix, `/health` endpoint, `render.yaml`, and
ESLint setup for both apps are all still in place from Pass 1 — see below.

### Limits

- The API and web Docker images required 3 network-timeout retries between
  them (`ETIMEDOUT` fetching packages inside Docker's build network — a
  sandbox network limitation, not a code problem) before succeeding, once
  concurrent load from the full Playwright run finished. Both were then
  fully verified — built, booted, and confirmed serving correctly against
  real dependencies (API: `/health` returns `{"status":"ok"}` against real
  Postgres; web: manifest/icons/`sw.js`/self-hosted font all return 200 with
  the security headers applied) — after the Google sign-in and font-related
  changes, which came after the member-mobile Dockerfile edits. If a
  deployment build ever hits the same timeout, it's worth a retry rather
  than treating it as a real failure; this environment's Docker build
  network is measurably flaky, independent of anything in this repo.
- Two stray Docker artifacts unrelated to this app were left untouched, per
  explicit instruction not to spend time on unrelated Docker cleanup and
  because this session's permission policy denies stopping/removing
  pre-existing containers it didn't create: `tfhc_backend_api` (a stale
  pre-Yarn-migration container that crash-loops; the current Dockerfile
  doesn't have this problem) and three `tfhc-e2e-*` containers from the same-
  day baseline run. `docker rm -f tfhc_backend_api && docker compose up -d
  --build api`, and `docker rm -f tfhc-e2e-api-image tfhc-e2e-web-image
  tfhc-e2e-db`, run those manually when convenient.
- `render.yaml`'s cross-service URLs are still name-predicted, not confirmed
  against a real deployment (none was performed this pass either).
- Installability was verified via the manifest/icon/service-worker contract
  a browser enforces (all of which a real "Add to Home Screen" also checks),
  not by physically installing on a phone from this environment — that
  distinction is real and stated plainly rather than blurred.

---

## Pass 1 — PWA hardening (original report)

Audited and hardened the Next.js app as a production PWA: installable
manifest/icons, an offline fallback shell, API rate limiting, HTTP security
headers, a `/health` endpoint, ESLint for both apps, and a Render deployment
blueprint. No destructive Docker actions were taken against pre-existing
containers.

### Results

| Check | Result |
| --- | --- |
| Shared domain tests | 15 passed |
| API unit tests | 2 passed |
| API integration tests with PostgreSQL | 51 passed |
| Playwright browser suite (chromium + iPhone 13 viewport) | 66 passed |
| API ESLint | 0 errors |
| Web ESLint (`next lint`) | 0 errors, 13 pre-existing warnings (resolved in Pass 2) |
| API production build (`nest build`) | Passed |
| Web production build (`next build`, 22 routes) | Passed |
| API production Docker image: build, boot, `/health` against real Postgres | Passed |
| Web production Docker image: build, boot, manifest/icons/service worker served with security headers | Passed |
| member-mobile TypeScript check | Passed |
| member-mobile Jest tests | 11 passed |

### What changed in this pass

- **Installable PWA icons**: the manifest previously pointed at a single
  non-square SVG (240×200) claiming both `any` and `maskable` purpose, which
  is not safe for Android's adaptive-icon mask. Replaced with real PNGs
  rasterized from the brand mark (`logo-icon.svg`) at 192/512 for `any` and a
  separately-padded 192/512 set for `maskable`, plus a 180×180 Apple touch
  icon and a 32×32 favicon. Verified installability end-to-end with new
  Playwright coverage (`tests/e2e/pwa.spec.ts`): manifest fields, icon
  reachability, service worker registration, and a real offline navigation.
- **Offline navigation fallback**: `sw.js` previously let a fully-offline
  page navigation fall through to the browser's default error page. It now
  serves a small cached `offline.html` app shell instead, without changing
  how it handles normal (online) navigations — those still always hit the
  network so a new deploy's hashed assets are never served against a stale
  cached HTML document.
- **Accessibility**: removed `maximumScale: 1` / `userScalable: false` from
  the viewport config — disabling pinch-zoom fails WCAG 1.4.4 and wasn't
  required for the standalone/installed experience.
- **API rate limiting**: there was none. Added `@nestjs/throttler` with a
  300 req/min global ceiling and a 10 req/min limit specifically on
  `POST /auth/login` (the password-guessing surface). `POST
  /auth/google/member` stays on the global limit only — the "secret" there is
  a Google-signed token, not a guessable password, so tight per-route
  throttling doesn't add real protection and did conflict with legitimate
  rapid re-auth. Both limits are relaxed via `DISABLE_RATE_LIMIT=true`, set
  only in the test webServer configs, not in production.
- **HTTP security headers**: added `helmet` (CSP disabled — this is a pure
  JSON API with a separately-hosted client, not an HTML origin) to the API,
  and `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a
  `Permissions-Policy` that explicitly keeps camera and geolocation allowed
  (the app depends on both for QR check-in and geofencing) to the web app.
- **CORS**: was `origin: '*', credentials: true`, an invalid combination
  under the fetch spec once credentials are involved, and misleading since
  the client authenticates with a bearer token, not cookies. Now
  `credentials` is dropped and `origin` is configurable via `CORS_ORIGIN`.
- **`/health` endpoint**: added a plain `GET /health` returning `200`. Both
  Dockerfiles' `HEALTHCHECK` and `docker-compose.yml`'s healthcheck switched
  to it from the previous "expect 401 from `/auth/me`" trick, which worked
  for Docker's own healthcheck but can't be Render's `healthCheckPath` (Render
  expects a plain 200).
- **Render deployment**: added `render.yaml` — a Postgres database plus two
  Docker-runtime web services (API, web). Cross-service URLs
  (`NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`) are pre-filled with the
  name-predicted `*.onrender.com` URLs; verify these against what Render
  actually assigns after the first deploy and update+redeploy if they differ.
- **ESLint**: neither app had it configured at all. Added `next lint`
  wiring for web and a `.eslintrc.js` + `eslint` script for the API, fixed
  every error it found (unused imports/vars, an unused guard parameter), and
  wrapped two admin-page data loaders in `useCallback` to satisfy
  `react-hooks/exhaustive-deps` cleanly rather than suppressing it.
- Fixed a `next`/`eslint-config-next` monorepo hoisting mismatch (member-mobile
  pinned React 19 while web uses React 18, which was keeping `next` nested
  under `apps/web/node_modules` only) by adding `next` to the root
  `devDependencies` so lint tooling can resolve it.

### Confirmed fixes (carried over from the same-day baseline before Pass 1)

- Credentials and QR signing secrets are removed recursively from API responses.
- Missing login fields, invalid meeting dates/statuses, negative GPS accuracy and check-ins outside the attendance window produce client errors.
- Member history requires a member identity; requests cannot supply another member's identity for check-in.
- Existing attendance records with a null arrival timestamp no longer crash duplicate check-in handling.
- Profile updates work when celebration dates are omitted.
- Approved attendance corrections recalculate points and create a missing attendance record.
- Manual attendance requires an audit reason; manual meeting closure processes absences and writes the summary.
- Leaderboard date filters affect the queried records.
- Protected web pages validate account access, and the home page routes administrators correctly.
- Check-in reads the actual active-meeting response and uses camera decoding with the API's location/QR field names.
- Excuse submission selects a real meeting and includes the required category; bottom navigation no longer covers its submit button.
- Excel downloads use the configured API URL.
- Attendance summaries and leaderboards use API metrics instead of demo fallback records; notifications and milestone screens read account data.
- Notifications can be marked read persistently and only for the authenticated member.
- Authenticated API responses are no longer cached by the service worker.
- Dockerfiles use the repository's Yarn workspace setup; web assets and health checks point to the correct locations.
