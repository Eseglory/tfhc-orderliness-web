import { defineConfig, devices } from '@playwright/test';
const apiPort = process.env.E2E_API_PORT || '4100';
const webPort = process.env.E2E_WEB_PORT || '3100';
const database = process.env.TEST_DATABASE_URL;
if (!database || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Set TEST_DATABASE_URL to an isolated local tfhc_e2e database');
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', testMatch: ['web.spec.ts', 'pwa.spec.ts', 'device.spec.ts', 'auth.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', testMatch: ['web.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'webkit', testMatch: ['web.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', testMatch: ['web.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['iPhone 13'] } },
    { name: 'firefox', testMatch: ['web.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['Desktop Firefox'] } },
    { name: 'viewports', testMatch: ['viewport.spec.ts'], use: { ...devices['Desktop Chrome'] } },
  ],
  globalSetup: './tests/e2e/setup.ts',
  webServer: [
    { command: 'yarn build:api && yarn workspace @tfhc/api start', url: `http://127.0.0.1:${apiPort}/auth/me`, env: { DATABASE_URL: database, JWT_SECRET: 'e2e-local-only-secret', PORT: apiPort, GOOGLE_OAUTH_CLIENT_IDS: 'e2e-test.apps.googleusercontent.com', DISABLE_RATE_LIMIT: 'true', DISABLE_SCHEDULED_JOBS: 'true', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', APP_WEB_URL: `http://127.0.0.1:${webPort}` }, timeout: 120000 },
    { command: `yarn workspace @tfhc/web exec next build && yarn workspace @tfhc/web exec next start -p ${webPort}`, url: `http://127.0.0.1:${webPort}/login`, env: { NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'e2e-test.apps.googleusercontent.com', NEXT_DIST_DIR: `.next-e2e-${webPort}` }, timeout: 240000 },
  ],
});
