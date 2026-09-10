const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const REGISTER_EMAIL = 'register-browser@example.test';
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
  await page.getByPlaceholder('First name').fill('Reggie');
  await page.getByPlaceholder('Last name').fill('Ster');
  await page.getByPlaceholder(/approved list/).fill(email);
  await page.getByPlaceholder('Phone number').fill('08055550000');
  await page.getByPlaceholder(/^Password/).fill(password);
  await page.getByPlaceholder('Confirm password').fill(password);
  await page.getByRole('button', { name: /Create account/ }).click();
  // argon2 hashing + a DB transaction — generous on a loaded CI host.
  await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 30000 });
  const link = await page.locator('a[href*="/verify-email?token="]').getAttribute('href');
  expect(link).toBeTruthy();
  return link as string;
}

test('self-registration: approved email → verify link → member dashboard', async ({ page }) => {
  test.setTimeout(60000);
  const link = await completeRegistration(page, REGISTER_EMAIL, PASSWORD);
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/member$/);
  expect(await page.evaluate(() => localStorage.getItem('tfhc_token'))).toBeTruthy();
});

test('registration is refused for an email that is not approved', async ({ page }) => {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('First name').fill('No');
  await page.getByPlaceholder('Last name').fill('Body');
  await page.getByPlaceholder(/approved list/).fill('not-approved@example.test');
  await page.getByPlaceholder('Phone number').fill('08000000000');
  await page.getByPlaceholder(/^Password/).fill(PASSWORD);
  await page.getByPlaceholder('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create account/ }).click();
  await expect(page.getByText(/approved members list/)).toBeVisible();
});

test('forgot password shows a neutral confirmation and never reveals accounts', async ({ page }) => {
  await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Your email').fill('whoever@example.test');
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
  expect((await request.post(`${apiURL}/auth/login`, { data: { email: REGISTER_EMAIL, password: NEW_PW } })).status()).toBe(201);
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
  await otherPage.addInitScript((t) => localStorage.setItem('tfhc_token', t), stale);

  // Cross a second boundary so the change is unambiguously newer than the tokens.
  await page.waitForTimeout(1200);

  await page.goto('/member/profile', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByPlaceholder('Current password').fill(PASSWORD);
  await page.getByPlaceholder(/^New password/).fill('RotatedBrowser!pw789');
  await page.getByPlaceholder('Confirm new password').fill('RotatedBrowser!pw789');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();

  // The stale session is bounced to the sign-in screen.
  await otherPage.goto('/member', { waitUntil: 'domcontentloaded' });
  await expect(otherPage).toHaveURL(/\/login$/);
  await other.close();
});

test('idle-timeout modal warns and "Stay signed in" dismisses it', async ({ page }) => {
  const token = await tokenFor('member-browser@example.test');
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
  const token = await tokenFor('member-browser@example.test');
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
  const token = await tokenFor('nudge-browser@example.test');
  await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
  await page.goto('/member', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText("We've missed you")).toBeVisible();
});
