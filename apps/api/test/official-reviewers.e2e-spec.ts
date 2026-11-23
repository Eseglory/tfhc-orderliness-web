import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ConflictException, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';
import { TimetableReviewService, OFFICIAL_TIMETABLE_REVIEWERS } from '../src/modules/timetable/timetable-review.service';
import { RbacService } from '../src/common/rbac/rbac.service';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableReviewDecision,
  TimetableGenerationType,
} from '@prisma/client';

describe('Official TFHC Timetable Reviewers Configuration E2E Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let timetableService: TimetableService;
  let reviewService: TimetableReviewService;
  let rbacService: RbacService;

  let superAdminUser: any;
  let danielUser: any;
  let testPeriodId: string;
  let testVersionId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    timetableService = app.get(TimetableService);
    reviewService = app.get(TimetableReviewService);
    rbacService = app.get(RbacService);

    // Fetch an admin user
    superAdminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          email: `admin_${Date.now()}@tfhc.test`,
          passwordHash: '$2b$10$hashedtestpassword1234567890',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }

    // Identify Daniel Oguamanam's existing account
    danielUser = await prisma.user.findFirst({
      where: { email: { equals: 'danoguamanam@gmail.com', mode: 'insensitive' } },
      include: { member: true },
    });

    if (!danielUser) {
      danielUser = await prisma.user.create({
        data: {
          email: 'danoguamanam@gmail.com',
          passwordHash: '$2b$10$hashedtestpassword1234567890',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('Requirement 1: Official reviewers definition and account identity lookup', async () => {
    // Verify the 3 designated reviewers are codified
    expect(OFFICIAL_TIMETABLE_REVIEWERS).toHaveLength(3);
    expect(OFFICIAL_TIMETABLE_REVIEWERS.map((r) => r.name)).toEqual([
      'Aanu Oyeniran',
      'Daniel Oguamanam',
      'Paseda Oluwafemi',
    ]);
    expect(OFFICIAL_TIMETABLE_REVIEWERS.map((r) => r.email)).toEqual([
      'aanuoyeniran@gmail.com',
      'danoguamanam@gmail.com',
      'folashadeogunlade86@gmail.com',
    ]);

    // Check status
    const status = await reviewService.getOfficialReviewersStatus();
    expect(status.officialReviewers).toHaveLength(3);

    // Daniel Oguamanam must match to existing user account
    const danielStatus = status.officialReviewers.find((r) => r.name === 'Daniel Oguamanam');
    expect(danielStatus).toBeDefined();
    expect(danielStatus?.matched).toBe(true);
    expect(danielStatus?.userId).toBe(danielUser.id);
    expect(danielStatus?.officialEmail).toBe('danoguamanam@gmail.com');

    // Aanu Oyeniran & Paseda Oluwafemi must NOT match to non-existent accounts
    const aanuStatus = status.officialReviewers.find((r) => r.name === 'Aanu Oyeniran');
    expect(aanuStatus?.matched).toBe(false);
    expect(aanuStatus?.notes).toContain('Account not yet registered in application');

    const pasedaStatus = status.officialReviewers.find((r) => r.name === 'Paseda Oluwafemi');
    expect(pasedaStatus?.matched).toBe(false);
    expect(pasedaStatus?.notes).toContain('Account not yet registered in application');

    // Verify NO duplicate member accounts were created
    const aanuUsers = await prisma.user.findMany({
      where: { email: { equals: 'aanuoyeniran@gmail.com', mode: 'insensitive' } },
    });
    expect(aanuUsers).toHaveLength(0);

    const pasedaUsers = await prisma.user.findMany({
      where: { email: { equals: 'folashadeogunlade86@gmail.com', mode: 'insensitive' } },
    });
    expect(pasedaUsers).toHaveLength(0);
  });

  it('Requirement 2: Official reviewers synchronization and permission assignment', async () => {
    const syncRes = await reviewService.syncOfficialReviewers(superAdminUser.id);
    expect(syncRes.matchedCount).toBeGreaterThanOrEqual(1);

    // Verify Daniel is active in TimetableReviewer
    const danielReviewer = await prisma.timetableReviewer.findFirst({
      where: { userId: danielUser.id, active: true },
    });
    expect(danielReviewer).toBeDefined();
    expect(danielReviewer?.orderIndex).toBe(2);

    // Verify Daniel has TIMETABLE_REVIEWER access role
    const reviewerRole = await prisma.accessRole.findUnique({
      where: { key: 'TIMETABLE_REVIEWER' },
    });
    expect(reviewerRole).toBeDefined();

    const userGrant = await prisma.userAccessRole.findUnique({
      where: {
        userId_roleId: {
          userId: danielUser.id,
          roleId: reviewerRole!.id,
        },
      },
    });
    expect(userGrant).toBeDefined();

    // Verify RBAC access resolution grants timetable.read and timetable.review
    const resolved = await rbacService.resolveAccess(danielUser.id, danielUser.role);
    expect(resolved.permissions).toContain('timetable.read');
    expect(resolved.permissions).toContain('timetable.review');
  });

  it('Requirement 3: Notification dispatch when timetable is ready for review', async () => {
    // Create a test period and version
    const randSuffix = Math.floor(Math.random() * 900000 + 100000);
    const futureDate = new Date(Date.UTC(2027, 2, 1, 0, 0, 0));
    futureDate.setUTCDate(futureDate.getUTCDate() + (randSuffix % 50) * 7);

    const period = await prisma.timetablePeriod.create({
      data: {
        weekStart: futureDate,
        label: `Official Reviewers Test Week ${randSuffix}`,
        status: TimetablePeriodStatus.PENDING_REVIEW,
      },
    });
    testPeriodId = period.id;

    const version = await prisma.timetableVersion.create({
      data: {
        periodId: period.id,
        versionNumber: 1,
        status: TimetableVersionStatus.PENDING_REVIEW,
        generationType: TimetableGenerationType.MANUAL_INITIAL,
        metadata: { test: true },
      },
    });
    testVersionId = version.id;

    // Trigger reviewer notification
    await timetableService.notifyReviewers(period, version, superAdminUser.id);

    // Verify audit log for notification was recorded
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'TIMETABLE_REVIEW_NOTIFICATION_SENT',
        entityId: version.id,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.action).toBe('TIMETABLE_REVIEW_NOTIFICATION_SENT');
  });

  it('Requirement 4: Reviewer inspects timetable and submits independent review', async () => {
    // Daniel views current timetable
    const adminView = await timetableService.getAdminCurrentTimetable(danielUser.id);
    expect(adminView.isDesignatedReviewer).toBe(true);
    expect(adminView.officialReviewersStatus).toBeDefined();
    expect(adminView.officialReviewersStatus.officialReviewers).toHaveLength(3);

    // Daniel submits independent APPROVAL review with comment
    const reviewResult = await reviewService.submitReview({
      versionId: testVersionId,
      reviewerUserId: danielUser.id,
      decision: TimetableReviewDecision.APPROVED,
      comments: 'Schedule verified and approved by Daniel Oguamanam.',
    });

    expect(reviewResult.review).toBeDefined();
    expect(reviewResult.review.decision).toBe('APPROVED');
    expect(reviewResult.review.reviewerUserId).toBe(danielUser.id);
    expect(reviewResult.review.comments).toBe('Schedule verified and approved by Daniel Oguamanam.');
    expect(reviewResult.approvedCount).toBe(1);
    expect(reviewResult.isFullyApproved).toBe(false); // Requires 3 approvals!
    expect(reviewResult.isPublished).toBe(false);

    // Verify decision and timestamp recorded in DB
    const savedReview = await prisma.timetableReview.findUnique({
      where: {
        versionId_reviewerUserId: {
          versionId: testVersionId,
          reviewerUserId: danielUser.id,
        },
      },
    });
    expect(savedReview).toBeDefined();
    expect(savedReview?.reviewedAt).toBeDefined();
  });

  it('Requirement 5: Duplicate review prevention', async () => {
    // Attempting duplicate review by Daniel for the same version must fail
    await expect(
      reviewService.submitReview({
        versionId: testVersionId,
        reviewerUserId: danielUser.id,
        decision: TimetableReviewDecision.APPROVED,
        comments: 'Duplicate attempt',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('Requirement 6: Publication strictly requires approval from all 3 reviewers', async () => {
    // With only 1 approval out of 3, publication must be rejected
    await expect(
      reviewService.publishTimetable(testVersionId, superAdminUser.id),
    ).rejects.toThrow(BadRequestException);

    // Error message must explicitly state only 1 of 3 required approvals received
    try {
      await reviewService.publishTimetable(testVersionId, superAdminUser.id);
      fail('Expected publishTimetable to throw');
    } catch (err: any) {
      expect(err.message).toContain('Only 1 of 3 required reviewer approvals have been received');
    }

    // Verify version is NOT published
    const ver = await prisma.timetableVersion.findUnique({ where: { id: testVersionId } });
    expect(ver?.status).not.toBe(TimetableVersionStatus.PUBLISHED);
  });

  it('Requirement 7: Super Admins and Platform Owner full visibility across history and reviews', async () => {
    const history = await timetableService.listHistory();
    const periodInHistory = history.find((p) => p.id === testPeriodId);
    expect(periodInHistory).toBeDefined();
    expect(periodInHistory?.versions[0].reviews).toHaveLength(1);
    expect(periodInHistory?.versions[0].reviews[0].reviewerUser.email).toBe('danoguamanam@gmail.com');
  });
});
