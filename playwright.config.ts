import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.resolve(__dirname, 'apps/api/.env.test'), override: true, quiet: true });
config({ path: path.resolve(__dirname, '.env.test'), override: true, quiet: true });

const apiPort = process.env.E2E_API_PORT || '4100';
const webPort = process.env.E2E_WEB_PORT || '3100';
const LOCAL_TEST_DB = 'postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e';
const database = process.env.TEST_DATABASE_URL || LOCAL_TEST_DB;
process.env.TEST_DATABASE_URL = database;
process.env.DATABASE_URL = database;

if (!database || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database) || /supabase|aws|pooler|\.com|\.net|\.io/i.test(database)) {
  throw new Error(`[FATAL TEST ENVIRONMENT SECURITY VIOLATION] TEST_DATABASE_URL must point to an isolated local tfhc_e2e Docker database (received: ${database.replace(/:[^:@]+@/, ':***@')})`);
}
export default defineConfig({
  outputDir: 'test-results-member',
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  // One retry: WebKit in particular times out intermittently when the host is
  // under load (single worker, full Nest + Next builds). A test that only fails
  // that way is reported flaky, not failed.
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', testMatch: ['invitations.spec.ts', 'member-portal.spec.ts', 'web.spec.ts', 'admin.spec.ts', 'pwa.spec.ts', 'device.spec.ts', 'auth.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', testMatch: ['member-portal.spec.ts', 'web.spec.ts', 'admin.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'webkit', testMatch: ['member-portal.spec.ts', 'web.spec.ts', 'admin.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', testMatch: ['member-portal.spec.ts', 'web.spec.ts', 'admin.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['iPhone 13'] } },
    { name: 'firefox', testMatch: ['member-portal.spec.ts', 'web.spec.ts', 'admin.spec.ts', 'pwa.spec.ts', 'device.spec.ts'], use: { ...devices['Desktop Firefox'] } },
    { name: 'viewports', testMatch: ['viewport.spec.ts'], use: { ...devices['Desktop Chrome'] } },
  ],
  globalSetup: './tests/e2e/setup.ts',
  webServer: [
    { command: 'node apps/api/dist/apps/api/src/main.js', url: `http://127.0.0.1:${apiPort}/health`, reuseExistingServer: false, env: { DATABASE_URL: database, JWT_SECRET: 'e2e-local-only-secret', PORT: apiPort, GOOGLE_OAUTH_CLIENT_IDS: 'e2e-test.apps.googleusercontent.com', DISABLE_RATE_LIMIT: 'true', DISABLE_SCHEDULED_JOBS: 'true', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', CORS_ORIGIN: `http://127.0.0.1:${webPort}`, APP_WEB_URL: `http://127.0.0.1:${webPort}` }, timeout: 120000 },
    { command: `corepack yarn workspace @tfhc/web exec next start -p ${webPort}`, url: `http://127.0.0.1:${webPort}/login`, reuseExistingServer: false, env: { PWA_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'e2e-test.apps.googleusercontent.com', NEXT_DIST_DIR: `.next-e2e-${webPort}` }, timeout: 120000 },
  ],
});
