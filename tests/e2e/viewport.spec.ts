import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

async function memberToken() {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: 'member-browser@example.test' } });
    return jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await db.$disconnect();
  }
}

// Required breakpoints: mobile (320-430), tablet (768-1024), desktop (1280-1920).
const BREAKPOINTS = [
  { name: '320-mobile', width: 320, height: 720 },
  { name: '360-mobile', width: 360, height: 800 },
  { name: '375-mobile', width: 375, height: 812 },
  { name: '390-mobile', width: 390, height: 844 },
  { name: '412-mobile', width: 412, height: 915 },
  { name: '430-mobile', width: 430, height: 932 },
  { name: '768-tablet', width: 768, height: 1024 },
  { name: '820-tablet', width: 820, height: 1180 },
  { name: '1024-tablet', width: 1024, height: 1366 },
  { name: '1280-desktop', width: 1280, height: 800 },
  { name: '1440-desktop', width: 1440, height: 900 },
  { name: '1920-desktop', width: 1920, height: 1080 },
];

const MEMBER_ROUTES = [
  '/member',
  '/member/check-in',
  '/member/meetings',
  '/member/availability',
  '/member/my-attendance',
  '/member/leaderboard',
  '/member/profile',
  '/member/submit-excuse',
  '/member/analytics',
  '/member/notifications',
  '/member/rewards',
  '/member/correction-request',
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/members',
  '/admin/meetings',
  '/admin/leaderboard',
  '/admin/follow-up',
  '/admin/reports',
];

for (const bp of BREAKPOINTS) {
  test.describe(`viewport ${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });

    test('login page has no horizontal overflow', async ({ page }) => {
      await page.goto('/login');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `login page overflows by ${overflow}px at ${bp.width}px`).toBeLessThanOrEqual(1);
    });

    for (const route of MEMBER_ROUTES) {
      test(`member route ${route} has no horizontal overflow`, async ({ page }) => {
        const token = await memberToken();
        await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows by ${overflow}px at ${bp.width}px`).toBeLessThanOrEqual(1);
      });
    }
  });
}

// Admin routes only at a representative breakpoint per class, to keep runtime reasonable.
for (const bp of [{ name: '375-mobile', width: 375, height: 812 }, { name: '768-tablet', width: 768, height: 1024 }, { name: '1440-desktop', width: 1440, height: 900 }]) {
  test.describe(`admin viewport ${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });

    for (const route of ADMIN_ROUTES) {
      test(`admin route ${route} has no horizontal overflow`, async ({ page, request }) => {
        const signed = await request.post('http://127.0.0.1:4100/auth/login', { data: { email: 'admin-browser@example.test', password: 'E2ePassword!123' } });
        const { accessToken } = await signed.json();
        await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), accessToken);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows by ${overflow}px at ${bp.width}px`).toBeLessThanOrEqual(1);
      });
    }
  });
}
