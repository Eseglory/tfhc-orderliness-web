# Automated testing

Use Yarn 4.5.3 and Node 22.13 or later. Test databases must be local and named `tfhc_e2e`; the suites refuse other database URLs. Do not use a production database. Browser accounts and integration fixtures are created only in this database.

```sh
yarn install
yarn build:shared
yarn exec playwright install chromium
docker compose -f docker-compose.e2e.yml up -d --wait
export TEST_DATABASE_URL=postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e
DATABASE_URL="$TEST_DATABASE_URL" yarn workspace @tfhc/api exec prisma migrate deploy
yarn test
yarn workspace @tfhc/api test:e2e
yarn test:e2e
```

`yarn test` runs the API and shared domain unit tests. The API integration suite uses the real Nest application, guards, services, migrations and PostgreSQL. `test:e2e` explicitly requires `TEST_DATABASE_URL`; the unit command does not run database integration tests.

Playwright starts its own API on port 4100 and Next.js on 3100. These ports must be free. It runs three projects: `chromium` and `mobile-web` (functional + PWA coverage at desktop and iPhone-13-sized viewports), and `viewports` (horizontal-overflow audits across every required mobile/tablet/desktop breakpoint — 320 through 1920px). Member browser sessions use locally signed test identities backed by real database users because Google OAuth requires an external interactive account. API tests separately verify that members cannot use password login.

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

The Google Fonts route mock some tests still carry (`page.route('https://fonts.googleapis.com/**', ...)`) is a no-op now that both app fonts (Inter, Material Symbols Outlined) are self-hosted from `/public` — kept only because it's harmless, not because it's load-bearing. It blocks service workers during most functional scenarios. Dedicated service-worker tests enable registration and verify that authenticated responses are not cached and static assets remain available offline. Camera scanning uses the [Html5Qrcode API](https://scanapp.org/html5-qrcode-docs/docs/apis/classes/Html5Qrcode); physical camera decoding is outside the automated browser suite.

## Built-container smoke tests

After building and starting API/web test containers against the isolated database with the browser fixtures seeded:

```sh
docker exec -i -e TEST_TARGET=web tfhc-e2e-web-image node < tests/container-smoke.cjs
docker exec -i -e TEST_TARGET=api tfhc-e2e-api-image node < tests/container-smoke.cjs
```

These verify web assets, authenticated API reads, credential filtering, Excel downloads and 100 dashboard reads at concurrency 20. This small local workload is not a production capacity benchmark.
