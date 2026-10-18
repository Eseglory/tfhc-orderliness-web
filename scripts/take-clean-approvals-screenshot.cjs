const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = 'TMSyBPWSCvtJ31QOnQU8Zk2WADoS-KPnwLFyBtdC6zNwDw1GGXYolnkBh1pp4sTb';
const artifactDir = 'C:\\Users\\sends\\.gemini\\antigravity-ide\\brain\\ebbf5054-aca8-4fc1-9322-baa0cd58effe';

async function capture() {
  const adminToken = jwt.sign({
    userId: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4',
    sub: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4',
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    permissions: ['*']
  }, JWT_SECRET, { expiresIn: '1h' });

  const adminUser = {
    userId: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4',
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    isSuperAdmin: true,
    permissions: ['*'],
    accessRoles: ['SUPER_ADMIN']
  };

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    serviceWorkers: 'block'
  });

  await ctx.addInitScript(({ token, user }) => {
    localStorage.setItem('tfhc_token', token);
    localStorage.setItem('tfhc_user_profile', JSON.stringify(user));
    localStorage.setItem('tfhc_reminder_permission_decision', 'dismissed');
    localStorage.setItem('tfhc_alarm_prompt_dismissed', 'true');
    localStorage.setItem('tfhc_pwa_install_dismissed', 'true');
    sessionStorage.setItem('tfhc_pwa_update_dismissed', 'true');
  }, { token: adminToken, user: adminUser });

  const page = await ctx.newPage();

  console.log('Navigating to Approvals Queue...');
  await page.goto('https://tfhc-orderliness-web.vercel.app/admin/approvals?tab=queue', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const queuePath = path.join(artifactDir, 'approvals_queue_screen_updated.png');
  await page.screenshot({ path: queuePath, fullPage: false });
  console.log('Saved updated queue screen to:', queuePath);

  console.log('Navigating to Excuses tab...');
  await page.goto('https://tfhc-orderliness-web.vercel.app/admin/approvals?tab=excuses', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const excusesPath = path.join(artifactDir, 'approvals_excuses_screen_updated.png');
  await page.screenshot({ path: excusesPath, fullPage: false });
  console.log('Saved updated excuses screen to:', excusesPath);

  console.log('Navigating to Absence Requests...');
  await page.goto('https://tfhc-orderliness-web.vercel.app/admin/absence-requests', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const absencePath = path.join(artifactDir, 'absence_requests_screen_updated.png');
  await page.screenshot({ path: absencePath, fullPage: false });
  console.log('Saved updated absence requests screen to:', absencePath);

  await browser.close();
}

capture().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
