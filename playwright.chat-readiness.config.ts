import base from './playwright.config';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ ...base, retries: 0, timeout: 90000,
  projects: [
    { name: 'chat-desktop', testMatch: ['chat-readiness.spec.ts', 'chat-reliability.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'chat-mobile-safari', testMatch: ['chat-readiness.spec.ts'], use: { ...devices['iPhone 13'] } },
  ], reporter: [['list']],
});
