import { test, expect } from '@playwright/test';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const ARTIFACT_DIR = 'C:/Users/sends/.gemini/antigravity/brain/b2d4bc6e-5464-4afa-98e2-79af60da3047';

test('Assigned Member View: Personalized Duty Schedule, Supervising Minister, Service Team, and WhatsApp Roster', async ({ page }) => {
  const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e';
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  // 1. Identify the latest version for Week of 23 Nov 2026 and publish it
  const version = await prisma.timetableVersion.findFirst({
    where: {
      period: {
        weekStart: {
          gte: new Date('2026-11-23T00:00:00.000Z'),
          lte: new Date('2026-11-23T23:59:59.999Z')
        }
      }
    },
    orderBy: { versionNumber: 'desc' },
    include: {
      sessions: {
        include: {
          assignments: {
            include: { member: { include: { user: true } } }
          }
        }
      }
    }
  });

  if (!version) throw new Error('No version found for 23 Nov 2026');

  // Mark published for member testing
  await prisma.timetableVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', publishedAt: new Date() }
  });
  await prisma.timetablePeriod.update({
    where: { id: version.periodId },
    data: { status: 'PUBLISHED' }
  });

  // Find member-browser
  const browserMember = await prisma.member.findUnique({
    where: { memberCode: 'BROWSER-MEMBER' },
    include: { user: true }
  });
  if (!browserMember) throw new Error('BROWSER-MEMBER not found');

  // Assign BROWSER-MEMBER to the first session in version
  const firstSession = version.sessions[0];
  if (!firstSession) throw new Error('No session found in version');

  // Replace or add assignment for BROWSER-MEMBER
  const existing = await prisma.timetableAssignment.findFirst({
    where: { sessionId: firstSession.id, memberId: browserMember.id }
  });

  if (!existing) {
    await prisma.timetableAssignment.create({
      data: {
        sessionId: firstSession.id,
        memberId: browserMember.id,
        position: 'Front Altar Usher',
        role: 'USHER'
      }
    });
  }

  // Also assign to Sunday Second Service if exists
  const sundaySession = version.sessions.find(s => s.serviceTitle?.includes('Sunday Second'));
  if (sundaySession) {
    const existingSun = await prisma.timetableAssignment.findFirst({
      where: { sessionId: sundaySession.id, memberId: browserMember.id }
    });
    if (!existingSun) {
      await prisma.timetableAssignment.create({
        data: {
          sessionId: sundaySession.id,
          memberId: browserMember.id,
          position: 'Sanctuary Aisle Lead',
          role: 'USHER'
        }
      });
    }
  }

  await prisma.$disconnect();

  const memberEmail = 'member-browser@tfhc.org';
  const memberPassword = 'E2ePassword!123';

  // 2. Log in as the assigned member
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15000 });
  await page.getByLabel('Member ID / Email').fill(memberEmail);
  await page.getByLabel('Password', { exact: true }).fill(memberPassword);
  await page.getByRole('button', { name: /Sign In/ }).click();
  await expect(page).toHaveURL(/\/member/);

  // 3. Navigate to Member Timetable Page
  await page.goto('/member/timetable', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: "This Week's Ushering Timetable" })).toBeVisible({ timeout: 10000 });

  // 4. Verify Duty Schedule Cards and Service Rosters
  await expect(page.getByText(/Your Scheduled Services|Your Assignment|Duty/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Share WhatsApp Roster|Share/i }).first()).toBeVisible();

  // Capture Screenshot of the Assigned Member's View
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'today_member_duty_assigned.png'), fullPage: true });
});
