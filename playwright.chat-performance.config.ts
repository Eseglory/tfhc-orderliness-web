import base from './playwright.config';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ ...base, retries: 0, timeout: 60000,
  projects: [{ name: 'chat-performance', testMatch: ['chat-performance.spec.ts'], use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list']],
});
