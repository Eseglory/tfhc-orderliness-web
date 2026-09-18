const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
  const artifactDir = '/Users/eseglory/.gemini/antigravity-ide/brain/62d5028e-bfed-4e98-9d83-5975968ab253';
  
  // Try finding installed Chrome or Chromium
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

  // Mobile Viewport (iPhone 14 / modern smartphone)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await mobileContext.newPage();

  // Member Mobile Viewport
  console.log('Navigating to http://localhost:3000/member ...');
  await page.goto('http://localhost:3000/member', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('Goto error (proceeding):', e.message));
  await page.waitForTimeout(2000);
  const mobileShotPath = path.join(artifactDir, 'member_homepage_mobile.png');
  await page.screenshot({ path: mobileShotPath, fullPage: true });
  console.log('Mobile screenshot saved to:', mobileShotPath);

  // Desktop Member Viewport
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('http://localhost:3000/member', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('Desktop goto error:', e.message));
  await desktopPage.waitForTimeout(2000);
  const desktopShotPath = path.join(artifactDir, 'member_homepage_desktop.png');
  await desktopPage.screenshot({ path: desktopShotPath, fullPage: false });
  console.log('Desktop screenshot saved to:', desktopShotPath);

  // Landing Page (Public Homepage)
  console.log('Navigating to http://localhost:3000/ ...');
  await desktopPage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('Landing page goto error:', e.message));
  await desktopPage.waitForTimeout(2000);
  const landingShotPath = path.join(artifactDir, 'landing_homepage.png');
  await desktopPage.screenshot({ path: landingShotPath, fullPage: false });
  console.log('Landing homepage screenshot saved to:', landingShotPath);

  await browser.close();
}

main().catch(err => {
  console.error('Screenshot script error:', err);
  process.exit(1);
});
