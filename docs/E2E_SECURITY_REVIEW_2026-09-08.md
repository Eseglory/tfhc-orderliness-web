# Admin/member verification — 8 September 2026

## Changes

- Removed the hard-coded JWT fallback: an explicit signing secret is required.
- Restricted member updates to allowed fields and validated account/member inputs. Nested Prisma writes can no longer change an account role or member ownership through the member update endpoint.
- Prevented members from reading other members' detailed performance profiles and attendance/contact data through meeting details. Admin/leader access is preserved.
- Kept production rate limiting enabled even if the test bypass environment variable is set.
- Replaced four-digit random member codes with 48-bit random codes to greatly reduce directory-growth collisions.
- Removed prefilled demo login credentials. “Remember Me” now controls persistent versus session storage, and logout clears both. Excel downloads use either session type.
- Calculated dashboard averages in PostgreSQL and ran independent counts concurrently. Replaced leaderboard queries per member with bulk reads; regression tests compare individual and leaderboard results.
- Updated Next.js to 15.5.25 and NestJS to 11.2.3, updated supporting/test dependencies, removed unused vulnerable `xlsx`, and patched transitive PostCSS/UUID dependencies through root resolutions.
- Bundled Inter and its license locally so clean builds do not require Google Fonts. Preserved Apple PWA metadata after the Next.js upgrade.
- Isolated the E2E Compose project, made test ports configurable, and switched browser verification to a production web build.

## Verification

- API integration: **56 passed** against PostgreSQL, including Google provider-response simulations, role checks, token revocation, input validation, privacy regression tests, QR/geofence validation, concurrent duplicate check-ins, excuses/corrections, audit records, reports, and meeting closure.
- Unit tests: **17 passed**.
- Lint: passed.
- API and production web builds: passed. Web first-load JavaScript is 104–122 kB across routes.
- Browser tests: **252 passed** (39 desktop scenarios, 39 mobile scenarios, 174 viewport checks) against the production web build. Playwright HTML report: `playwright-report/index.html`.
- Dependency audit: no security advisories in the final tree; deprecated-package notices remain when not excluded from audit output.
- Development database restored and confirmed healthy on its original named volume following the discovered Compose project collision; no volume was removed.

## Local performance

`tests/performance-smoke.cjs` completed 300 requests without HTTP failures, using 20 concurrent requests per endpoint. Dataset at measurement: 80 members and 2,020 attendance records. Measurements ran alongside browser verification on this workstation.

| Endpoint | Requests | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Admin dashboard | 100 | 91 ms | 540 ms | 586 ms |
| Member leaderboard | 100 | 381 ms | 968 ms | 986 ms |
| Member performance | 100 | 75 ms | 132 ms | 138 ms |

These establish successful concurrent local operation, not production capacity or a before/after latency comparison. The leaderboard still reads historical attendance to compute rankings and streaks; larger production datasets need representative load testing.

## Boundaries

Browser coverage uses desktop Chromium and Chromium with an iPhone-sized viewport, plus layout audits from 320 to 1920 pixels. It does not establish Safari/WebKit or physical-device behavior. Google OAuth provider responses are simulated in API tests; browser member sessions use locally signed identities in the isolated database. Real Google account authorization, physical camera QR decoding, real GPS accuracy, installed-device behavior, production networking, and production-scale load remain external validation tasks. This review is not a guarantee of zero defects or a formal penetration test.

Existing development demo credentials remain in the documented seed/Compose configuration; those are not production credentials. Configure deployment secrets and OAuth client IDs for the target environment. No deployment was performed.

Framework migration references: [Next.js 15 guide](https://nextjs.org/docs/app/guides/upgrading/version-15) and [NestJS migration guide](https://docs.nestjs.com/migration-guide). See [E2E_TESTING.md](E2E_TESTING.md) for reproducible commands.
