# Automated testing

Use Yarn 4.5.3 and Node 22.13 or later. Test databases must be local and named `tfhc_e2e`; the suites refuse other database URLs. Do not use a production database. Browser accounts and integration fixtures are created only in this database.

```sh
yarn install
yarn build:shared
yarn exec playwright install chromium webkit firefox
docker compose -f docker-compose.e2e.yml up -d --wait
export TEST_DATABASE_URL=postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e
DATABASE_URL="$TEST_DATABASE_URL" yarn workspace @tfhc/api exec prisma migrate deploy
yarn test
yarn workspace @tfhc/api test:e2e
yarn test:e2e
```

`yarn test` runs the API and shared domain unit tests. The API integration suite uses the real Nest application, guards, services, migrations and PostgreSQL. `test:e2e` explicitly requires `TEST_DATABASE_URL`; the unit command does not run database integration tests.

Playwright builds and starts its own API on port 4100 and a production Next.js server on 3100. These ports must be free, or set `E2E_API_PORT` and `E2E_WEB_PORT` to unused local ports. The E2E Compose file uses a separate project name so it cannot replace the development database. It runs Chromium desktop/mobile, WebKit desktop/iPhone, Firefox desktop, and a separate viewport project auditing horizontal overflow from 320 through 1920px. Member browser sessions use locally signed test identities backed by real database users because Google OAuth requires an external interactive account. API tests separately verify that members cannot use password login.

The Playwright API server runs with SMTP disabled and `APP_WEB_URL` pinned to the e2e web port, so verification / reset flows return the link in the JSON body (`verifyUrl` / `devUrl`) instead of sending real email. `tests/e2e/auth.spec.ts` (chromium only) covers the member email-auth lifecycle and the three activeness popups; `tests/e2e/setup.ts` seeds its fixtures — `register-browser@example.test` (approved, no account — the registration target, detached before each test), `nudge-browser@example.test` (three `ABSENT` records for the engagement nudge), plus past closed meetings. `member-browser@example.test` has an incomplete profile on purpose, for the completion reminder.

Reports are generated in `playwright-report/`; failed browser tests preserve screenshots and traces in `test-results/`. Use `yarn exec playwright show-report` to inspect results.

Additional checks:

```sh
yarn build:api
yarn build:web
```

Remove the isolated database after testing:

```sh
docker compose -f docker-compose.e2e.yml down -v
```

## Coverage boundaries

Browser viewport emulation does not test physical camera/GPS accuracy, Apple/Google sign-in, real push delivery, production networking or load, or a physically installed home-screen PWA on a real device (installability is verified via the manifest/icon/service-worker contract a browser enforces, which is what "Add to Home Screen" also checks, but that's not the same as installing on a phone). Those require device and external-service validation. A passing suite establishes the tested scenarios, not a guarantee of zero defects.

The Google Fonts route mock some tests still carry (`page.route('https://fonts.googleapis.com/**', ...)`) is a no-op now that both app fonts (Inter, Material Symbols Outlined) are self-hosted from `/public` — kept only because it's harmless, not because it's load-bearing. It blocks service workers during most functional scenarios. Dedicated service-worker tests enable registration and verify that authenticated responses are not cached and static assets remain available offline. Camera scanning uses jsQR with browser media APIs. Synthetic camera frames exercise real QR decoding, signed-code validation, attendance persistence and camera cleanup. Permission-denial cases verify retry behavior. Offline navigation tests disconnect a local proxy to exercise actual network failure across browser engines; physical camera hardware remains outside this suite.

## Built-container smoke tests

After building and starting API/web test containers against the isolated database with the browser fixtures seeded:

```sh
docker exec -i -e TEST_TARGET=web tfhc-e2e-web-image node < tests/container-smoke.cjs
docker exec -i -e TEST_TARGET=api tfhc-e2e-api-image node < tests/container-smoke.cjs
```

These verify web assets, authenticated API reads, credential filtering, Excel downloads and 100 dashboard reads at concurrency 20. This small local workload is not a production capacity benchmark.

## Local performance smoke workload

While an isolated test API with the browser fixtures is running:

```sh
TEST_API_URL=http://127.0.0.1:4101 node tests/performance-smoke.cjs
```

Keep `TEST_DATABASE_URL` set to the isolated local database. This checks 100 authenticated requests each to the admin dashboard, member leaderboard, and member performance endpoint at concurrency 20. It fails on HTTP errors and reports p50/p95/max latency and fixture counts. Results describe this local workload, not production capacity.

For a larger isolated workload (1,000 additional members and 52,000 attendance records, cleaned up after execution):

```sh
TEST_API_URL=http://127.0.0.1:4101 node tests/performance-scale.cjs
```

Security dependency verification (includes development dependencies):

```sh
yarn npm audit --all --recursive --no-deprecations
```

`JWT_SECRET` must now be configured explicitly; the API no longer starts with a built-in signing secret. Next.js is on 15.5 and NestJS on 11; use Node 22.13+ as above. The root resolutions patch Next.js's PostCSS dependency and ExcelJS's UUID dependency; keep them until upstream dependencies include patched versions.
