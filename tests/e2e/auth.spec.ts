const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const REGISTER_EMAIL = 'register-browser@tfhc.org';
const PASSWORD = 'BrowserAuth!pw123';

function db() {
  return new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
}

/** Detach any account from the registerable fixture so registration starts fresh. */
async function resetRegisterFixture() {
  const prisma = db();
  try {
    const user = await prisma.user.findUnique({ where: { email: REGISTER_EMAIL }, include: { member: true } });
    if (user) {
      if (user.member) await prisma.member.update({ where: { id: user.member.id }, data: { userId: null } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
}
test.beforeEach(resetRegisterFixture);

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

async function tokenFor(email: string) {
  const prisma = db();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await prisma.$disconnect();
  }
}

async function completeRegistration(page: Page, email: string, password: string) {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Church member email address').fill(email);
  await page.getByPlaceholder(/^Password/).fill(password);
  await page.getByRole('button', { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/member$/, { timeout: 30000 });
  return page.url();
}

test('self-registration: approved email links existing member and opens dashboard', async ({ page }) => {
  test.setTimeout(60000);
  const link = await completeRegistration(page, REGISTER_EMAIL, PASSWORD);
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/member$/);
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBeTruthy();
});

test('registration is refused for an email that is not approved', async ({ page }) => {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Church member email address').fill('not-approved@tfhc.org');
  await page.getByPlaceholder(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: /Create account/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not authorized' })).toContainText(/lookup/i);
});

test('forgot password shows a neutral confirmation and never reveals accounts', async ({ page }) => {
  await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Your email').fill('whoever@tfhc.org');
  await page.getByRole('button', { name: /Send reset link/ }).click();
  await expect(page.getByText(/on its way/)).toBeVisible();
});

test('password reset: emailed link → new password works, old one does not', async ({ page, request }) => {
  test.setTimeout(60000);
  // Ensure the account exists and is verified.
  const link = await completeRegistration(page, REGISTER_EMAIL, PASSWORD);
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/member$/);

  // Request a reset; the dev fallback returns the link in the JSON body.
  const res = await request.post(`${apiURL}/auth/forgot-password`, { data: { email: REGISTER_EMAIL } });
  const { devUrl } = await res.json();
  expect(devUrl).toContain('/reset-password?token=');

  const NEW_PW = 'FreshBrowser!pw456';
  await page.goto(devUrl, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/^New password/).fill(NEW_PW);
  await page.getByPlaceholder('Confirm new password').fill(NEW_PW);
  await page.getByRole('button', { name: /Update password/ }).click();
  await expect(page).toHaveURL(/\/member$/);

  // Old password rejected, new one accepted.
  expect((await request.post(`${apiURL}/auth/login`, { data: { email: REGISTER_EMAIL, password: PASSWORD } })).status()).toBe(401);
  expect((await request.post(`${apiURL}/auth/login`, { data: { email: REGISTER_EMAIL, password: NEW_PW } })).status()).toBe(200);
});

test('changing the password signs other sessions out', async ({ page, context, request }) => {
  test.setTimeout(60000);
  const link = await completeRegistration(page, REGISTER_EMAIL, PASSWORD);
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/member$/);

  // A second, independent session for the same account.
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  const stale = await tokenFor(REGISTER_EMAIL);
  await otherPage.addInitScript((t) => {
    if (!sessionStorage.getItem('test-stale-session-seeded')) {
      localStorage.setItem('tfhc_token', t);
      sessionStorage.setItem('test-stale-session-seeded', 'true');
    }
  }, stale);

  // Cross a second boundary so the change is unambiguously newer than the tokens.
  await page.waitForTimeout(1200);

  await page.goto('/member/profile', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByPlaceholder('Current password').fill(PASSWORD);
  await page.getByPlaceholder(/^New password/).fill('RotatedBrowser!pw789');
  await page.getByPlaceholder('Confirm new password').fill('RotatedBrowser!pw789');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();

  expect((await request.get(`${apiURL}/auth/me`, { headers: { Authorization: `Bearer ${stale}` } })).status()).toBe(401);
  // The stale session is bounced to the sign-in screen.
  await otherPage.goto('/member', { waitUntil: 'domcontentloaded' });
  await expect(otherPage).toHaveURL(/\/login(\?.*)?$/);
  await other.close();
});

test('idle-timeout modal warns and "Stay signed in" dismisses it', async ({ page }) => {
  const token = await tokenFor('member-browser@tfhc.org');
  await page.addInitScript((t) => {
    localStorage.setItem('tfhc_token', t);
    // Shrink the idle threshold so the warning is reachable in a test.
    (window as unknown as { __IDLE_WARNING_MS__: number }).__IDLE_WARNING_MS__ = 1500;
  }, token);
  await page.goto('/member', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alertdialog', { name: /Session about to end/ })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBeTruthy();
});

test('profile-completion reminder shows for an incomplete profile and stays dismissed', async ({ page }) => {
  const token = await tokenFor('member-browser@tfhc.org');
  await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
  await page.goto('/member', { waitUntil: 'domcontentloaded' });
  const banner = page.getByText('Complete your profile');
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).first().click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByText('Complete your profile')).toBeHidden();
});

test('engagement nudge appears for a member with recent absences', async ({ page }) => {
  const token = await tokenFor('nudge-browser@tfhc.org');
  await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
  await page.goto('/member', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText("We've missed you")).toBeVisible();
});

test('a delayed expired-session response cannot remove a newly signed-in session', async ({ page }) => {
  const delayed: import('@playwright/test').Route[] = [];
  await page.addInitScript(() => {
    if (!localStorage.getItem('tfhc_token')) localStorage.setItem('tfhc_token', 'expired-before-login');
  });
  await page.route('**/auth/me', async route => {
    if (route.request().headers().authorization === 'Bearer expired-before-login') delayed.push(route);
    else await route.continue();
  });
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor();
  await expect.poll(() => delayed.length).toBeGreaterThan(0);
  await page.getByLabel('Member ID / Email').fill('member-browser@tfhc.org');
  await page.getByLabel('Password', { exact: true }).fill('E2ePassword!123');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await expect(page).toHaveURL(/\/member$/);
  for (const route of delayed) await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Expired session' }) }).catch(() => undefined);
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token') || sessionStorage.getItem('tfhc_token'))).toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/member$/);
});
