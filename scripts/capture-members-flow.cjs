const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

async function main() {
  const prisma = new PrismaClient();
  const glory = await prisma.member.findFirst({
    where: {
      OR: [
        { firstName: { contains: 'Glory', mode: 'insensitive' } },
        { user: { email: { contains: 'engreseglory', mode: 'insensitive' } } },
        { approvedMember: { email: { contains: 'engreseglory', mode: 'insensitive' } } }
      ]
    },
    include: {
      user: true,
      approvedMember: true
    }
  });

  console.log('Found Glory member record:', glory?.id, glory?.firstName, glory?.lastName, glory?.roleInUnit);

  const artifactDir = '/Users/eseglory/.gemini/antigravity-ide/brain/62d5028e-bfed-4e98-9d83-5975968ab253';
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
  ];
  const executablePath = possiblePaths.find(p => fs.existsSync(p));

  const secret = process.env.JWT_SECRET || 'tfhc-orderliness-secret-key-2026';
  const token = jwt.sign(
    {
      sub: glory?.userId || glory?.id || 'admin-id',
      email: 'engreseglory@gmail.com',
      role: 'ADMIN',
      firstName: 'Glory',
      lastName: 'Eseosa'
    },
    secret,
    { expiresIn: '7d' }
  );

  const userObj = {
    id: glory?.userId || glory?.id,
    email: 'engreseglory@gmail.com',
    role: 'ADMIN',
    firstName: 'Glory',
    lastName: 'Eseosa',
    status: 'ACTIVE'
  };

  const browser = await chromium.launch({
    executablePath,
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  // Set cookies and localStorage
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, userObj }) => {
    localStorage.setItem('tfhc_token', token);
    localStorage.setItem('tfhc_user_profile', JSON.stringify(userObj));
    document.cookie = `tfhc_token=${token}; path=/; max-age=604800`;
  }, { token, userObj });

  // 1. Members Directory List View
  console.log('Navigating to http://localhost:3000/admin/members ...');
  await page.goto('http://localhost:3000/admin/members', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2500);

  const membersListShot = path.join(artifactDir, 'admin_members_directory_list.png');
  await page.screenshot({ path: membersListShot, fullPage: false });
  console.log('Members list screenshot saved to:', membersListShot);

  // 2. Member Detail View
  if (glory) {
    const detailUrl = `http://localhost:3000/admin/members/${glory.id}`;
    console.log('Navigating to member detail:', detailUrl);
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Overview Tab Screenshot
    const overviewShot = path.join(artifactDir, 'member_detail_tab_overview.png');
    await page.screenshot({ path: overviewShot, fullPage: false });
    console.log('Overview tab screenshot saved to:', overviewShot);

    // Click Attendance History Tab
    console.log('Clicking Attendance History Tab...');
    const attendanceBtn = await page.waitForSelector('button:has-text("Attendance History")');
    await attendanceBtn.click();
    await page.waitForTimeout(1000);
    const attendanceShot = path.join(artifactDir, 'member_detail_tab_attendance.png');
    await page.screenshot({ path: attendanceShot, fullPage: false });
    console.log('Attendance tab screenshot saved to:', attendanceShot);

    // Click Member Notes Tab
    console.log('Clicking Member Notes Tab...');
    const notesBtn = await page.waitForSelector('button:has-text("Member Notes")');
    await notesBtn.click();
    await page.waitForTimeout(1000);
    const notesShot = path.join(artifactDir, 'member_detail_tab_notes.png');
    await page.screenshot({ path: notesShot, fullPage: false });
    console.log('Notes tab screenshot saved to:', notesShot);
  }

  await browser.close();
  await prisma.$disconnect();
  console.log('🎉 Verification screenshots completed successfully!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
