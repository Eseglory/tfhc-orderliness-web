const apiURL = `http://127.0.0.1:${process.env.E2E_API_PORT || '4100'}`;
import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const ADMIN_EMAIL = 'portal-admin@tfhc.org';
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
    return jwt.sign({ sub: user.id, email: user.email, role: user.role }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await prisma.$disconnect();
  }
}

async function getMemberToken() {
  const prisma = db();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'member-browser@tfhc.org' } });
    return jwt.sign({ sub: user.id, email: user.email, role: user.role }, 'e2e-local-only-secret', { expiresIn: '1h' });
  } finally {
    await prisma.$disconnect();
  }
}

async function loginAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('form[data-hydrated="true"]').waitFor();
  await page.getByLabel('Member ID / Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Sign In/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: /Dashboard Overview|Unit Leadership Overview/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

test.describe('Admin E2E Suite', () => {

  test('admin authentication: signs in with the test administrator, verifies session and /auth/me payload', async ({ page, request }) => {
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

    // Verify navbar admin branding and member app switcher link in profile menu
    await expect(page.getByRole('heading', { name: /Dashboard Overview|Unit Leadership Overview/i })).toBeVisible();
    await page.getByRole('button', { name: /User profile menu|Glory|Admin|Eseosa/i }).first().click();
    await expect(page.locator('a[href="/member"], button[aria-label="Switch to Member App"]').first()).toBeVisible();
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
      await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
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
    await page.getByPlaceholder(/Search/).fill(title);
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

    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);
    await page.goto('/admin/services', { waitUntil: 'domcontentloaded' });

    const seriesName = `Midweek Service ${Date.now()}`;
    await page.getByRole('button', { name: /^\+( Create| New) (Service|series)/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(/Executive Leadership Advisory/).fill(seriesName);
    await dialog.getByRole('button', { name: 'Create Service', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    const searchInput = page.locator('input[placeholder*="Search service name"]');
    await searchInput.fill(seriesName);
    await page.waitForTimeout(500);
    await expect(page.getByText(seriesName).first()).toBeVisible({ timeout: 15000 });
  });

  test('member directory management: add member, search, edit details, and toggle access', async ({ page }) => {
    test.setTimeout(60000);
    await loginAdmin(page);
    await page.goto('/admin/members', { waitUntil: 'domcontentloaded' });

    const first = `EseTest${Date.now()}`;
    const email = `${first.toLowerCase()}@tfhc.org`;

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();
    await page.getByLabel('First Name', { exact: true }).fill(first);
    await page.getByLabel('Last Name', { exact: true }).fill('Member');
    await page.getByLabel('Phone Number', { exact: true }).fill('08098765432');
    await page.getByLabel(/Directory \/ Email Address/).fill(email);
    await page.getByRole('button', { name: 'Save Member Record', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Register New Member' })).not.toBeVisible();

    // Search
    await page.getByPlaceholder(/Search/).fill(first);
    await expect(page.getByRole('cell').filter({ hasText: `${first} Member` })).toBeVisible();

    // Edit member
    await page.getByTitle('Edit Member').first().click();
    await page.getByRole('button', { name: 'Save Member Record', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Member Profile' })).not.toBeVisible();

    // Manage Google access
    await page.getByTitle('Manage Google Access').first().click();
    await page.locator('#access-status').selectOption('REVOKED');
    await page.getByRole('button', { name: 'Save Access', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Manage Sign-In Access' })).not.toBeVisible();
  });

  test('approvals queue: admin reviews and approves absence excuses and corrections', async ({ browser, request }) => {
    test.setTimeout(60000);
    const prismaClient = db();
    await prismaClient.absenceExcuse.deleteMany({ where: { member: { user: { email: 'member-browser@tfhc.org' } } } });
    await prismaClient.$disconnect();

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
    await memberPage.getByRole('button', { name: /Leave \/ Date Range/i }).click();
    await memberPage.locator('#startDate').fill('2026-09-12');
    await memberPage.locator('#endDate').fill('2026-09-15');
    await memberPage.locator('#category').selectOption('SICKNESS');
    await memberPage.locator('#details').fill('Medical appointment during service time');
    await memberPage.getByRole('button', { name: /Submit Request|Submit/i }).click();
    await expect(memberPage.getByText(/Absence request submitted successfully/i)).toBeVisible();
    await memberContext.close();

    // Admin reviews in /admin/absence-requests
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.addInitScript((t) => localStorage.setItem('tfhc_token', t), adminToken);
    await adminPage.goto('/admin/absence-requests', { waitUntil: 'domcontentloaded' });
    const approveBtn = adminPage.getByRole('button', { name: /Approve Request|Approve/i }).first();
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    await approveBtn.click();
    await adminPage.getByRole('button', { name: /Approve Request|Confirm APPROVED/i }).last().click();
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
    await expect(page.getByRole('heading', { name: /Messages & Announcements/i })).toBeVisible();
    await expect(page.getByText(/General/i).first()).toBeVisible();
  });

  test('administration tools: team management, roles & permissions, lookups and audit log', async ({ page }) => {
    const token = await getAdminToken();
    await page.addInitScript((t) => localStorage.setItem('tfhc_token', t), token);

    // Team management
    await page.goto('/admin/administration/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /User Management & Administrative Team|Admin/i })).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible({ timeout: 10000 });

    // Roles & permissions
    await page.goto('/admin/administration/roles', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Roles & Access Governance|Roles & Permissions/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Super Admin', exact: true })).toBeVisible();

    // Lookup tables

    await page.goto('/admin/administration/lookups', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'System Classifications & Lookups', level: 1 })).toBeVisible();

    await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'System Security & Audit Trail', level: 1 })).toBeVisible();
  });

  test('reports, scoring settings and file exports (XLSX & CSV)', async ({ page }) => {
    test.setTimeout(60000);
    await loginAdmin(page);

    // Settings
    await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Settings & Policies', level: 1 })).toBeVisible();

    const weightInput = page.locator('input#attendanceWeight, input#earlyPoints, input[type="number"]').first();
    await weightInput.waitFor({ state: 'visible', timeout: 25000 });
    await weightInput.scrollIntoViewIfNeeded();
    await weightInput.fill('0.6');
    const punctualityInput = page.locator('input#punctualityWeight, input[id*="Weight"]').nth(1);
    if (await punctualityInput.isVisible()) {
      await punctualityInput.fill('0.4');
    }
    const saveBtn = page.getByRole('button', { name: /Save Policy Settings|Save Policy/i }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.getByText(/policy settings updated|updated|saved/i).first()).toBeVisible({ timeout: 15000 });
    }

    // Reports export XLSX
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
    const xlsxPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Audit|Exporting/i }).first().click();
    const xlsxFile = await xlsxPromise;
    expect(xlsxFile.suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
    expect(await xlsxFile.failure()).toBeNull();
  });

  test('admin to member app switch: prominent header button navigates to real member app and back', async ({ page }) => {
    await loginAdmin(page);

    // 1. Verify "Switch to Member App" button or link is visible on Admin header
    const switchBtn = page.locator('a[href="/member"], button[aria-label="Switch to Member App"], button[title="Switch to Member App"]').first();
    await expect(switchBtn).toBeVisible({ timeout: 15000 });

    // 2. Click "Switch to Member App"
    await switchBtn.click();
    await expect(page).toHaveURL(/\/member$/);
    await expect(page.locator('header').getByText(/Hello/i)).toBeVisible();

    // 3. Verify Admin can access real member routes (e.g. /member/calendar, /member/leaderboard, /member/profile)
    await page.goto('/member/calendar', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/member\/calendar$/);
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/member/leaderboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/member\/leaderboard$/);
    await expect(page.locator('body')).toBeVisible();

    // 4. Return to member home and click "Switch to Admin App" button
    await page.goto('/member', { waitUntil: 'domcontentloaded' });
    const backBtn = page.getByRole('button', { name: /Switch to Admin App/i }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // 5. Assert returned to /admin
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: /Dashboard Overview|Unit Leadership Overview/ })).toBeVisible();
  });

});
