import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/sends/.gemini/antigravity/brain/b2d4bc6e-5464-4afa-98e2-79af60da3047';
const ADMIN_EMAIL = 'portal-admin@tfhc.org';
const ADMIN_PASSWORD = 'E2ePassword!123';
const MEMBER_EMAIL = 'member-browser@tfhc.org';
const MEMBER_PASSWORD = 'E2ePassword!123';

test.describe('TFHC Timetable End-to-End Browser Flow & UI Specification Verification', () => {

  test('Admin Timetable Dashboard: 6 Summary Cards, 8 Tabs, 4 Approvers, Monthly Rotation, Chair Teams', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

    // 1. Admin Login
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15000 });
    await page.getByLabel('Member ID / Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Sign In/ }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 2. Navigate to Admin Timetable
    await page.goto('/admin/timetable', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Ushering Timetable Management' })).toBeVisible({ timeout: 10000 });

    // 3. Verify Summary Metric Cards
    const main = page.getByRole('main');
    await expect(main.getByText('Services', { exact: true })).toBeVisible();
    await expect(main.getByText('Positions', { exact: true })).toBeVisible();
    await expect(main.getByText('Members', { exact: true })).toBeVisible();
    await expect(main.getByText('Eligible Pool', { exact: true })).toBeVisible();
    await expect(main.getByText('Approvals', { exact: true })).toBeVisible();
    await expect(main.getByText('Status', { exact: true })).toBeVisible();

    // 4. Verify All Navigation Tabs (including Monthly Rotation & Chair Teams)
    const tabs = main.getByTestId('timetable-tabs');
    await expect(tabs.getByRole('button', { name: /Current Timetable/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Member Eligibility/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Reviewer Management/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Monthly Rotation/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Saturday Chair Teams/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Version History/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Analytics & Reports/ })).toBeVisible();
    await expect(tabs.getByRole('button', { name: /Special Events/ })).toBeVisible();

    // If there is a "Generate Now" button because no timetable exists yet, click it
    const generateBtn = main.getByRole('button', { name: /Generate Now/ });
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      await page.waitForTimeout(4000);
    }

    // Capture Full Admin Timetable Dashboard Screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_timetable_admin.png'), fullPage: true });

    // 5. Inspect Services on Current Timetable
    const viewDetailsButtons = main.getByRole('button', { name: 'View Details' });
    const count = await viewDetailsButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // 6. Click First "View Details" to enter Service Detail View
    await viewDetailsButtons.first().click();
    await expect(main.getByText('Service Detail View')).toBeVisible({ timeout: 5000 });
    await expect(main.getByText('Date & Time')).toBeVisible();
    await expect(main.getByText('Staffing Status')).toBeVisible();
    await expect(main.getByText('Supervising Minister')).toBeVisible();
    await expect(main.getByText(/Assigned Ushering Team/)).toBeVisible();

    // Capture Service Detail Screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_service_detail.png'), fullPage: true });

    // Back to Weekly Timetable
    await main.getByRole('button', { name: 'Back to Weekly Timetable' }).first().click();
    await expect(main.getByText(/Scheduled Services & Assigned Ushers/)).toBeVisible();

    // 7. Verify Reviewer Management Tab (4 Required Approvers)
    await tabs.getByRole('button', { name: /Reviewer Management/ }).click();
    await expect(main.getByText('Official TFHC Timetable Reviewers & Required Approvers')).toBeVisible({ timeout: 5000 });
    await expect(main.getByText('Aanu Oyeniran', { exact: true })).toBeVisible();
    await expect(main.getByText('Daniel Oguamanam', { exact: true })).toBeVisible();
    await expect(main.getByText('Paseda Oluwafemi', { exact: true })).toBeVisible();
    await expect(main.getByText('Glory Eseosa', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: /Notify Approvers/ })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_reviewers_tab.png'), fullPage: true });

    // 8. Verify Monthly Rotation Tab
    await tabs.getByRole('button', { name: /Monthly Rotation/ }).click();
    await expect(main.getByText(/Monthly Member Rotation/)).toBeVisible({ timeout: 5000 });
    await expect(main.getByText('Target Met (≥ 2)', { exact: true })).toBeVisible();
    await expect(main.getByText('1 More Needed', { exact: true })).toBeVisible();
    await expect(main.getByText('Not Yet Scheduled', { exact: true })).toBeVisible();
    await expect(main.getByText('Compliance Rate', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_monthly_rotation_tab.png'), fullPage: true });

    // 9. Verify Saturday Chair Teams Tab
    await tabs.getByRole('button', { name: /Saturday Chair Teams/ }).click();
    await expect(main.getByText(/Saturday Chair Arrangement/)).toBeVisible({ timeout: 5000 });
    await expect(main.getByText(/Group A Team/)).toBeVisible();
    await expect(main.getByText(/Group B Team/)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_chair_groups_tab.png'), fullPage: true });

    // 10. Verify Analytics & Reports Tab
    await tabs.getByRole('button', { name: /Analytics & Reports/ }).click();
    await expect(main.getByText('Timetable Analytics & Management Reports')).toBeVisible({ timeout: 5000 });
    await expect(main.getByText('Executive PDF Report')).toBeVisible();
    await expect(main.getByText('Excel Workbook Export')).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_analytics_tab.png'), fullPage: true });

    // 11. Verify Special Events Tab
    await tabs.getByRole('button', { name: /Special Events/ }).click();
    await expect(main.getByText('Special-Event Timetable Management')).toBeVisible({ timeout: 5000 });
    await expect(main.getByRole('button', { name: /Create Special Event Timetable/ })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_special_events_tab.png'), fullPage: true });
  });

  test('Member Timetable Experience: Clean Schedule View and Service Details Modal', async ({ page }) => {
    // 1. Member Login
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15000 });
    await page.getByLabel('Member ID / Email').fill(MEMBER_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(MEMBER_PASSWORD);
    await page.getByRole('button', { name: /Sign In/ }).click();
    await expect(page).toHaveURL(/\/member/);

    // 2. Navigate to Member Timetable
    await page.goto('/member/timetable', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: "This Week's Ushering Timetable" })).toBeVisible({ timeout: 10000 });

    // Verify WhatsApp share and Print buttons are accessible
    await expect(page.getByRole('button', { name: /Share WhatsApp Roster/ })).toBeVisible();

    // Capture Member Timetable Schedule Screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_member_duty_assigned.png'), fullPage: true });

    // 3. Click "View Full Details" to open Service Details Modal Popup
    const viewDetailButtons = page.getByRole('button', { name: /View Full Details/ });
    if (await viewDetailButtons.count() > 0) {
      await viewDetailButtons.first().click();
      await page.waitForTimeout(1000);
      await expect(page.locator('.fixed.inset-0').getByRole('heading').first()).toBeVisible({ timeout: 5000 });
      // Capture Member Service Details Modal Popup Screenshot
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_member_service_modal.png'), fullPage: true });
    }
  });

});
