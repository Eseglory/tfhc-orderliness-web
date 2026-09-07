import { defineConfig, devices } from '@playwright/test';
const database = process.env.TEST_DATABASE_URL;
if (!database || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Set TEST_DATABASE_URL to an isolated local tfhc_e2e database');
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', testMatch: ['web.spec.ts', 'pwa.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', testMatch: ['web.spec.ts', 'pwa.spec.ts'], use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'viewports', testMatch: ['viewport.spec.ts'], use: { ...devices['Desktop Chrome'] } },
  ],
  globalSetup: './tests/e2e/setup.ts',
  webServer: [
    { command: 'yarn build:api && yarn workspace @tfhc/api start', url: 'http://127.0.0.1:4100/auth/me', env: { DATABASE_URL: database, JWT_SECRET: 'e2e-local-only-secret', PORT: '4100', DISABLE_RATE_LIMIT: 'true' }, timeout: 120000 },
    { command: 'yarn workspace @tfhc/web exec next dev -p 3100', url: 'http://127.0.0.1:3100/login', env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4100', NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'e2e-test.apps.googleusercontent.com', NEXT_DIST_DIR: '.next-e2e' }, timeout: 120000 },
  ],
});
