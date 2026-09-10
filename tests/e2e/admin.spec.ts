const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const ADMIN_EMAIL = 'engreseglory@gmail.com';
const ADMIN_PASSWORD = 'E2ePassword!123';

function db() {
  return new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
}

function realError(message: string) {
  return !/due to access control checks\.?$/.test(message) && !/_rsc=/.test(message);
}

async function getAdminToken() {
  const prisma = db();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    return jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await prisma.$disconnect();
  }
}

async function getMemberToken() {
  const prisma = db();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'member-browser@example.test' } });
    return jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await prisma.$disconnect();
  }
}

async function loginAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Member ID / Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Sign In/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Unit Leadership Overview' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

test.describe('Admin E2E Suite: engreseglory@gmail.com', () => {

  test('admin authentication: signs in with engreseglory@gmail.com, verifies session and /auth/me payload', async ({ page, request }) => {
    await loginAdmin(page);

    // Verify localStorage has valid token
    const token = await page.evaluate(() => localStorage.getItem('tfhc_token'));
    expect(token).toBeTruthy();

    // Verify /auth/me returns Ese Glory with ADMIN role and super admin privileges
    const meRes = await request.get(`${apiURL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(meRes.ok()).toBeTruthy();
    const meData = await meRes.json();
    expect(meData.email).toBe(ADMIN_EMAIL);
    expect(meData.role).toBe('ADMIN');
    expect(meData.isSuperAdmin).toBe(true);
    expect(meData.firstName).toBe('Glory');
    expect(meData.lastName).toBe('Eseosa');

    // Verify navbar admin branding and member app switcher
    await expect(page.getByText('Admin').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Member app' })).toBeVisible();
  });

  const ADMIN_ROUTES = [
    '/admin',
    '/admin/calendar',
    '/admin/meetings',
    '/admin/meetings/dashboard',
    '/admin/services',
    '/admin/members',
    '/admin/finance',
    '/admin/finance/dues',
    '/admin/finance/payments',
    '/admin/finance/expenses',
    '/admin/finance/accounts',
    '/admin/chat',
    '/admin/approvals',
    '/admin/absence-requests',
    '/admin/leaderboard',
    '/admin/follow-up',
    '/admin/reports',
    '/admin/administration/team',
    '/admin/administration/roles',
    '/admin/administration/lookups',
    '/admin/settings',
    '/admin/audit',
  ];

  for (const route of ADMIN_ROUTES) {
    test(`admin route verification: ${route}`, async ({ page }) => {
      const token = await getAdminToken();
      await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

      const errors: string[] = [];
      page.on('pageerror', (e) => {
        if (realError(e.message)) errors.push(e.message);
      });
      page.on('response', (r) => {
        if (r.url().startsWith(`${apiURL}`) && r.status() >= 400) {
          errors.push(`${r.status()} ${r.url()}`);
        }
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
      await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
      expect(errors).toEqual([]);
    });
  }

  test('event lifecycle: create event, inspect calendar, and live meeting monitoring', async ({ page, request }) => {
    test.setTimeout(60000);
    const token = await getAdminToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Get or create category
    const catsRes = await request.get(`${apiURL}/meetings/categories`, { headers });
    const categories = await catsRes.json();
    const category = categories[0] || (await (await request.post(`${apiURL}/meetings/categories`, { headers, data: { name: 'Sunday Service' } })).json());

    const title = `Admin E2E Event ${Date.now()}`;
    const future = (m: number) => new Date(Date.now() + m * 60000).toISOString();

    const createdRes = await request.post(`${apiURL}/meetings`, {
      headers,
      data: {
        title,
        description: 'E2E Admin service demonstration',
        categoryId: category.id,
        meetingDate: future(10),
        startTime: future(30),
        expectedArrivalTime: future(15),
        attendanceOpenTime: future(5),
        attendanceCloseTime: future(90),
        locationName: 'Main Sanctuary',
        latitude: 6.6697906,
        longitude: 3.3581822,
        isCompulsory: true,
      },
    });
    expect(createdRes.ok()).toBeTruthy();
    const meeting = await createdRes.json();

    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    // Check meetings page
    await page.goto('/admin/meetings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15000 });

    // Check calendar page
    await page.goto('/admin/calendar', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'agenda', exact: true }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });

    // Open live meeting
    await request.put(`${apiURL}/meetings/${meeting.id}/status`, { headers, data: { status: 'ACTIVE' } });
    await page.goto(`/admin/live-meeting/${meeting.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Venue: Main Sanctuary/)).toBeVisible();
  });

  test('recurring services series: create, configure, edit and toggle status', async ({ page, request }) => {
    const token = await getAdminToken();
    const headers = { Authorization: `Bearer ${token}` };

    const venueConfig = {
      venue: { name: 'TFHC Main Center', latitude: 6.6697906, longitude: 3.3581822, radiusMeters: 150 },
      arrivalMinutesBefore: 30,
      reminderMinutes: [60],
      recipients: 'all',
      remindersEnabled: false,
    };
    await request.put(`${apiURL}/service-schedules/config`, { headers, data: venueConfig });

    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
    await page.goto('/admin/services', { waitUntil: 'domcontentloaded' });

    const seriesName = `Midweek Service ${Date.now()}`;
    await page.getByRole('button', { name: '+ New series' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Series name/).fill(seriesName);
    await dialog.getByLabel(/Start time/).fill('18:00');
    await dialog.getByLabel('End time (optional)').fill('20:00');
    await dialog.getByRole('button', { name: 'Create series' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: seriesName, exact: true }) });
    await expect(card).toBeVisible();

    // Edit series
    await card.getByRole('button', { name: 'Edit series' }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.getByLabel('End time (optional)').fill('20:30');
    await editDialog.getByLabel(/^Active/).uncheck();
    await editDialog.getByRole('button', { name: 'Save series' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(card).toContainText('Paused');
    await expect(card).toContainText('18:00–20:30');
  });

  test('member directory management: add member, search, edit details, and toggle access', async ({ page }) => {
    test.setTimeout(60000);
    await loginAdmin(page);
    await page.goto('/admin/members', { waitUntil: 'domcontentloaded' });

    const first = `EseTest${Date.now()}`;
    const email = `${first.toLowerCase()}@example.test`;

    await page.getByRole('button', { name: /Add New Member/ }).click();
    await page.getByLabel('First Name', { exact: true }).fill(first);
    await page.getByLabel('Last Name', { exact: true }).fill('Member');
    await page.getByLabel('Phone Number', { exact: true }).fill('08098765432');
    await page.getByLabel('Google email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Save Member', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add New Unit Member' })).not.toBeVisible();

    // Search
    await page.getByPlaceholder(/Search/).fill(first);
    await expect(page.getByRole('cell').filter({ hasText: `${first} Member` })).toBeVisible();

    // Edit member
    await page.getByRole('button', { name: `Edit ${first} Member`, exact: true }).click();
    await page.getByLabel('Profession', { exact: true }).fill('Systems Architect');
    await page.getByRole('button', { name: 'Save Member', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Member' })).not.toBeVisible();

    // Manage Google access
    const accessBtn = page.getByRole('button', { name: `Manage Google access for ${first} Member` });
    await expect(accessBtn).toHaveText('ACTIVE');
    await accessBtn.click();
    await page.getByLabel('Access status').selectOption('REVOKED');
    await page.getByRole('button', { name: 'Save Google access', exact: true }).click();
    await expect(accessBtn).toHaveText('REVOKED');
  });

  test('approvals queue: admin reviews and approves absence excuses and corrections', async ({ browser, request }) => {
    test.setTimeout(60000);
    const adminToken = await getAdminToken();
    const memberToken = await getMemberToken();
    const headers = { Authorization: `Bearer ${adminToken}` };

    const categories = await (await request.get(`${apiURL}/meetings/categories`, { headers })).json();
    const future = (m: number) => new Date(Date.now() + m * 60000).toISOString();
    const meetingRes = await request.post(`${apiURL}/meetings`, {
      headers,
      data: {
        title: `Approval Test Meeting ${Date.now()}`,
        categoryId: categories[0].id,
        meetingDate: future(10),
        startTime: future(30),
        expectedArrivalTime: future(15),
        attendanceOpenTime: future(5),
        attendanceCloseTime: future(60),
        locationName: 'Sanctuary',
        latitude: 6.5,
        longitude: 3.3,
      },
    });
    const meeting = await meetingRes.json();

    // Member submits excuse
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.addInitScript((t) => localStorage.setItem('tfhc_token', t), memberToken);
    await memberPage.goto('/member/submit-excuse', { waitUntil: 'domcontentloaded' });
    await memberPage.getByLabel('Meeting', { exact: true }).selectOption(meeting.id);
    await memberPage.getByLabel('Reason for Absence').selectOption('illness');
    await memberPage.getByLabel('Detailed Explanation').fill('Medical appointment during service time');
    await memberPage.getByRole('button', { name: 'Submit Excuse for Review' }).click();
    await expect(memberPage.getByText('Excuse submitted for review.')).toBeVisible();
    await memberContext.close();

    // Admin reviews in /admin/absence-requests
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.addInitScript((t) => localStorage.setItem('tfhc_token', t), adminToken);
    await adminPage.goto('/admin/absence-requests', { waitUntil: 'domcontentloaded' });
    const excuseCard = adminPage.getByRole('article').filter({ hasText: meeting.title });
    await expect(excuseCard).toBeVisible();
    await excuseCard.getByLabel('Review note (optional)').fill('Approved medical excuse');
    await excuseCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(excuseCard).toHaveCount(0);
    await adminContext.close();
  });

  test('finance administration: overview, accounts, expenses and payments', async ({ page, request }) => {
    test.setTimeout(60000);
    const token = await getAdminToken();
    const headers = { Authorization: `Bearer ${token}` };

    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    // 1. Finance dashboard
    await page.goto('/admin/finance', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();

    // 2. Payment accounts
    await page.goto('/admin/finance/accounts', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();

    // 3. Expenses
    await page.goto('/admin/finance/expenses', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();

    // 4. Monthly dues
    await page.goto('/admin/finance/dues', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();

    // 5. Payments
    await page.goto('/admin/finance/payments', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
  });

  test('admin chat and communication channels', async ({ page }) => {
    const token = await getAdminToken();
    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    await page.goto('/admin/chat', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('General', { exact: true })).toBeVisible();
  });

  test('administration tools: team management, roles & permissions, lookups and audit log', async ({ page }) => {
    const token = await getAdminToken();
    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    // Team management
    await page.goto('/admin/administration/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Admin Team/i })).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();

    // Roles & permissions
    await page.goto('/admin/administration/roles', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Roles & Permissions/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Super Admin', exact: true })).toBeVisible();

    // Lookup tables
    await page.goto('/admin/administration/lookups', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Lookup Tables/i })).toBeVisible();

    // Audit logs
    await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Audit Log/i })).toBeVisible();
  });

  test('reports, scoring settings and file exports (XLSX & CSV)', async ({ page }) => {
    test.setTimeout(60000);
    const token = await getAdminToken();
    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    // Settings
    await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Scoring and follow-up settings/i })).toBeVisible();
    await page.getByLabel('Attendance weight (0–1)', { exact: true }).fill('0.6');
    await page.getByLabel('Punctuality weight (0–1)', { exact: true }).fill('0.4');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Settings saved');

    // Reports export XLSX
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
    const xlsxPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Excel (.xlsx)', exact: true }).click();
    const xlsxFile = await xlsxPromise;
    expect(xlsxFile.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(await xlsxFile.failure()).toBeNull();

    // Reports export CSV
    await page.getByLabel('Export format').selectOption('csv');
    const csvPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV (.csv)', exact: true }).click();
    const csvFile = await csvPromise;
    expect(csvFile.suggestedFilename()).toMatch(/\.csv$/);
    expect(await csvFile.failure()).toBeNull();
  });

});
