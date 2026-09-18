const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'TMSyBPWSCvtJ31QOnQU8Zk2WADoS-KPnwLFyBtdC6zNwDw1GGXYolnkBh1pp4sTb';
const artifactDir = '/Users/eseglory/.gemini/antigravity-ide/brain/62d5028e-bfed-4e98-9d83-5975968ab253';

async function loginAdmin() {
  const res = await fetch('http://localhost:4000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'engreseglory@gmail.com',
      password: 'adm1ngL01$lEtSgO',
    }),
  });
  if (!res.ok) throw new Error('Login failed: ' + res.statusText);
  const data = await res.json();
  return { token: data.accessToken, user: data.user };
}

async function main() {
  const { token, user: adminUser } = await loginAdmin();
  console.log('Successfully authenticated as admin:', adminUser.email);
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  const executablePath = possiblePaths.find(p => fs.existsSync(p));
  console.log('Using browser at:', executablePath);

  const browser = await chromium.launch({
    executablePath,
    headless: true
  });

  // Setup desktop context
  const desktopContext = await browser.newContext({
    viewport: { width: 1366, height: 860 },
    deviceScaleFactor: 2
  });

  await desktopContext.addInitScript(({ token, user }) => {
    localStorage.setItem('tfhc_token', token);
    localStorage.setItem('tfhc_user_profile', JSON.stringify(user));
  }, { token, user: adminUser });

  const desktopPage = await desktopContext.newPage();

  // 1. Admin Dashboard (Desktop)
  console.log('Navigating to http://localhost:3000/admin ...');
  await desktopPage.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Admin goto error:', e.message));
  await desktopPage.waitForTimeout(4500);
  const adminDesktopPath = path.join(artifactDir, 'admin_dashboard_desktop.png');
  await desktopPage.screenshot({ path: adminDesktopPath, fullPage: false });
  console.log('Admin dashboard (desktop) saved to:', adminDesktopPath);

  // 2. Member Dashboard (Desktop)
  console.log('Navigating to http://localhost:3000/member ...');
  await desktopPage.goto('http://localhost:3000/member', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Member desktop goto error:', e.message));
  await desktopPage.waitForTimeout(4000);
  const memberDesktopPath = path.join(artifactDir, 'member_dashboard_desktop.png');
  await desktopPage.screenshot({ path: memberDesktopPath, fullPage: false });
  console.log('Member dashboard (desktop) saved to:', memberDesktopPath);

  // Setup mobile context
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  await mobileContext.addInitScript(({ token, user }) => {
    localStorage.setItem('tfhc_token', token);
    localStorage.setItem('tfhc_user_profile', JSON.stringify(user));
  }, { token, user: adminUser });

  const mobilePage = await mobileContext.newPage();

  // 3. Member Dashboard (Mobile)
  console.log('Navigating mobile to http://localhost:3000/member ...');
  await mobilePage.goto('http://localhost:3000/member', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Member mobile goto error:', e.message));
  await mobilePage.waitForTimeout(4000);
  const memberMobilePath = path.join(artifactDir, 'member_dashboard_mobile.png');
  await mobilePage.screenshot({ path: memberMobilePath, fullPage: false });
  console.log('Member dashboard (mobile) saved to:', memberMobilePath);

  // 4. Admin Dashboard (Mobile)
  console.log('Navigating mobile to http://localhost:3000/admin ...');
  await mobilePage.goto('http://localhost:3000/admin', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Admin mobile goto error:', e.message));
  await mobilePage.waitForTimeout(4000);
  const adminMobilePath = path.join(artifactDir, 'admin_dashboard_mobile.png');
  await mobilePage.screenshot({ path: adminMobilePath, fullPage: false });
  console.log('Admin dashboard (mobile) saved to:', adminMobilePath);

  await browser.close();
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
