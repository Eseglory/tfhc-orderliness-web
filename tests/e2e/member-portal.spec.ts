import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

test.use({ serviceWorkers: 'allow' });

const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
let db: PrismaClient;
let memberId: string;
let token: string;
test.beforeAll(async ({ request }) => {
  db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const response = await request.post(`${apiURL}/auth/login`, { data: { email: 'member-browser@tfhc.org', password: 'E2ePassword!123' } });
  expect(response.status()).toBe(201);
  const auth = await response.json();
  token = auth.accessToken;
  memberId = auth.user.member.id;
});
test.afterAll(async () => { await db?.$disconnect(); });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(t => localStorage.setItem('tfhc_token', t), token);
});

for (const [path, heading, endpoint] of [
  ['dues', 'Monthly Dues', '/me/finance/dues'],
  ['welfare', 'Welfare Fund', '/welfare-requests/mine'],
  ['calendar', 'Member Calendar', '/calendar/feed'],
  ['files', 'File inbox', '/auth/me'],
  ['offline', 'Offline and device settings', '/auth/me'],
]) {
  test(`member ${path} loads with authenticated data and no runtime errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(apiURL) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const loaded = page.waitForResponse(r => r.url().startsWith(`${apiURL}${endpoint}`) && r.status() === 200);
    await page.goto(`/member/${path}`);
    await loaded;
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('profile changes survive a reload', async ({ page }) => {
  const profession = `QA Engineer ${randomUUID().slice(0, 8)}`;
  await page.goto('/member/profile');
  await page.getByRole('button', { name: /Edit profile/ }).click();
  await page.getByLabel('Profession', { exact: true }).fill(profession);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Profile updated.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(profession, { exact: true })).toBeVisible();
  expect((await db.member.findUniqueOrThrow({ where: { id: memberId } })).profession).toBe(profession);
});

test('welfare submission persists as pending without self-approval', async ({ page }) => {
  const purpose = `Automated welfare request ${randomUUID()}`;
  await page.goto('/member/welfare');
  await page.getByLabel(/Amount/).fill('2500');
  await page.getByLabel(/Purpose/).fill(purpose);
  await page.getByLabel('Details', { exact: true }).fill('Local test fixture, no disbursement.');
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('Request submitted');
  await page.reload();
  await expect(page.locator('article').filter({ hasText: purpose })).toContainText('PENDING');
  const row = await db.welfareRequest.findFirstOrThrow({ where: { requestedByMemberId: memberId, purpose } });
  expect(row.amount).toBe(2500);
  expect(row.status).toBe('PENDING');
});

test('dues payment declaration remains pending until finance confirms it', async ({ page, request }, info) => {
  const month = ['chromium', 'mobile-web', 'webkit', 'mobile-safari', 'firefox'].indexOf(info.project.name) + 1;
  const label = `Portal dues ${info.project.name}`;
  const period = await db.duesPeriod.upsert({ where: { year_month: { year: 2098, month } }, update: {}, create: { year: 2098, month, label, defaultAmount: 2000, dueDate: new Date('2098-12-01') } });
  const assignment = await db.memberDuesAssignment.upsert({ where: { periodId_memberId: { periodId: period.id, memberId } }, update: {}, create: { periodId: period.id, memberId, amountDue: 2000 } });
  const reference = randomUUID();
  await page.goto('/member/dues');
  await page.locator('article').filter({ hasText: label }).getByRole('button', { name: 'I’ve paid', exact: true }).click();
  await page.getByLabel(/Amount/).fill('1000');
  await page.getByLabel('Transfer reference (optional)', { exact: true }).fill(reference);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('Payment submitted');
  const payment = await db.payment.findFirstOrThrow({ where: { memberId, payerReference: reference } });
  expect(payment.status).toBe('PENDING');
  expect((await db.memberDuesAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).amountPaid).toBe(0);
  const attempt = await request.post(`${apiURL}/finance/payments/${payment.id}/confirm`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
  expect(attempt.status()).toBe(403);
  await page.reload();
  await expect(page.getByText(payment.reference, { exact: true })).toBeVisible();
});

test('chat text is delivered and survives reloading the conversation', async ({ page }) => {
  const text = `Portal chat regression ${randomUUID()}`;
  await page.goto('/member/chat');
  await page.getByRole('button').filter({ hasText: 'General' }).first().click();
  await page.getByPlaceholder('Write a message…').fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('p').filter({ hasText: text })).toBeVisible();
  await expect.poll(() => db.chatMessage.count({ where: { body: text } })).toBe(1);
  await page.reload();
  await page.getByRole('button').filter({ hasText: 'General' }).first().click();
  await expect(page.locator('p').filter({ hasText: text })).toBeVisible();
});
