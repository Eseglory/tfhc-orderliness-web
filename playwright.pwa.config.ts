import { defineConfig, devices } from '@playwright/test';
const port = process.env.PWA_TEST_PORT || '3200';
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['pwa.spec.ts', 'pwa-queue.spec.ts', 'pwa-lifecycle.spec.ts', 'pwa-advanced.spec.ts'],
  outputDir: 'test-results-pwa',
  workers: 1, timeout: 30000, retries: 0, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, serviceWorkers: 'allow', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } }],
  // No application database, account credentials or API server needed.
  webServer: [{ command: 'node tests/pwa-api.cjs', url: 'http://127.0.0.1:4201/health', reuseExistingServer: false }, { command: `corepack yarn workspace @tfhc/web exec next start -p ${port}`,
    url: `http://127.0.0.1:${port}/login`, reuseExistingServer: false,
    env: { NEXT_DIST_DIR: process.env.PWA_TEST_DIST_DIR || '.next-pwa', PWA_API_URL: 'http://127.0.0.1:4201' }, timeout: 60000 }],
});
