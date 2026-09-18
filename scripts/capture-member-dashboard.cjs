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

  // Mobile Context - iPhone 14
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

  const mobilePage = await mobileContext.newPage(); // 1. Member mobile
  console.log('Navigating mobile to http://localhost:3000/member ...');
  await mobilePage.goto('http://localhost:3000/member', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Member mobile goto error:', e.message));
  await mobilePage.waitForTimeout(4000);
  const remindBtnMobile = await mobilePage.$('text=Remind me tomorrow');
  if (remindBtnMobile) await remindBtnMobile.click().catch(() => {});
  await mobilePage.keyboard.press('Escape').catch(() => {});
  await mobilePage.waitForTimeout(1000);

  const mobileFullPagePath = path.join(artifactDir, 'member_dashboard_mobile_fullpage.png');
  await mobilePage.screenshot({ path: mobileFullPagePath, fullPage: true });
  console.log('Member mobile fullpage saved to:', mobileFullPagePath);

  const mobileScreenPath = path.join(artifactDir, 'member_dashboard_mobile_screen.png');
  await mobilePage.screenshot({ path: mobileScreenPath, fullPage: false });
  console.log('Member mobile screen saved to:', mobileScreenPath);

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

  // 2. Member desktop
  console.log('Navigating desktop to http://localhost:3000/member ...');
  await desktopPage.goto('http://localhost:3000/member', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('Member desktop goto error:', e.message));
  await desktopPage.waitForTimeout(4000);
  const remindBtnDesktop = await desktopPage.$('text=Remind me tomorrow');
  if (remindBtnDesktop) await remindBtnDesktop.click().catch(() => {});
  await desktopPage.keyboard.press('Escape').catch(() => {});
  await desktopPage.waitForTimeout(1000);

  const desktopFullPagePath = path.join(artifactDir, 'member_dashboard_desktop_fullpage.png');
  await desktopPage.screenshot({ path: desktopFullPagePath, fullPage: true });
  console.log('Member desktop fullpage saved to:', desktopFullPagePath);

  await browser.close();
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
