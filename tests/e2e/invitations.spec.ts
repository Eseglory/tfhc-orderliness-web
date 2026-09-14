import { test, expect } from '@playwright/test';

test.describe('Invitation Workflows (Team/Admin & Member Lookup Table)', () => {
  const adminEmail = 'portal-admin@tfhc.org';
  const adminPassword = 'E2ePassword!123';

  test.beforeEach(async ({ page }) => {
    // Sign in as Admin
    await page.goto('/login');
    await page.locator('form[data-hydrated="true"]').waitFor();
    await page.getByLabel('Member ID / Email').fill(adminEmail);
    await page.fill('input[type="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/(admin|member)/);
  });

  test('1. Admin can navigate to Team Management and invite a new team member/admin', async ({ page }) => {
    await page.goto('/admin/administration/team');
    await expect(page.locator('h1')).toContainText(/User Management & Administrative Team/i);

    // Click Invite Team Member
    const inviteBtn = page.locator('button:has-text("Invite Administrator")').first();
    await expect(inviteBtn).toBeVisible();
    await inviteBtn.click();

    // Fill invitation modal
    const timestamp = Date.now();
    const testEmail = `newadmin_${timestamp}@tfhc.org`;
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/First name/).fill('Portal');
    await dialog.getByLabel(/Last name/).fill('Invitee');
    await dialog.getByLabel(/Email/).fill(testEmail);
    await dialog.getByLabel(/Phone number/).fill('08012345678');
    await dialog.getByRole('checkbox', { name: 'Administration', exact: true }).check();

    const submitBtn = dialog.getByRole('button', { name: 'Send Invitation', exact: true });
    await submitBtn.click();

    // Verify success toast or list entry
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 });
  });

  test('2. Admin can navigate to Member Lookup Table and view eligibility statuses', async ({ page }) => {
    await page.goto('/admin/administration/lookups?tab=approved-members');
    await expect(page.locator('h1')).toContainText(/System Classifications & Lookups/i);

    // Verify Member Lookup Table tab is selected
    const tabBtn = page.locator('button:has-text("Member Lookup Table")');
    await expect(tabBtn).toBeVisible();

    // Verify actions bar
    await expect(page.locator('button:has-text("Invite All Eligible Users")')).toBeVisible();
  });

  test('3. Option C: Invite All Eligible Users button opens confirmation and processes bulk invitations', async ({ page }) => {
    await page.goto('/admin/administration/lookups?tab=approved-members');

    // Click Invite All Eligible Users
    const inviteAllBtn = page.locator('button:has-text("Invite All Eligible Users")');
    await inviteAllBtn.click();

    // Verify confirmation modal
    await expect(page.locator('text=Invite All Eligible Users?')).toBeVisible();

    // Click confirm
    const confirmBtn = page.locator('button:has-text("Invite Everyone")');
    await confirmBtn.click();

    // Verify result summary modal appears
    await expect(page.locator('text=Invitation Processing Results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=PROCESSED')).toBeVisible();
  });
});
