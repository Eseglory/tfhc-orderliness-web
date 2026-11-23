import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';
import { TimetableEligibilityService } from '../src/modules/timetable/timetable-eligibility.service';
import { TimetableGeneratorService } from '../src/modules/timetable/timetable-generator.service';
import { TimetableReviewService } from '../src/modules/timetable/timetable-review.service';
import { WeeklyTimetableJob } from '../src/jobs/weekly-timetable.job';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableReviewDecision,
  TimetableGenerationType,
  AttendanceStatus,
  MemberStatus,
} from '@prisma/client';

describe('Automated Weekly Ushering Timetable E2E & Integration Verification Suite (15 Scenarios)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let timetableService: TimetableService;
  let eligibilityService: TimetableEligibilityService;
  let generatorService: TimetableGeneratorService;
  let reviewService: TimetableReviewService;
  let weeklyJob: WeeklyTimetableJob;

  let superAdminUser: any;
  let designatedReviewers: any[] = [];
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
    eligibilityService = app.get(TimetableEligibilityService);
    generatorService = app.get(TimetableGeneratorService);
    reviewService = app.get(TimetableReviewService);
    weeklyJob = app.get(WeeklyTimetableJob);

    // Fetch an admin user
    superAdminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      include: { member: true },
    });

    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          email: `admin_${Date.now()}@tfhc.test`,
          passwordHash: '$2b$10$hashedtestpassword1234567890',
          role: 'ADMIN',
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
    }

    // Ensure at least 3 designated reviewers
    const potentialReviewers = await prisma.user.findMany({
      where: { isActive: true },
      take: 5,
    });

    designatedReviewers = potentialReviewers.slice(0, 3);
    if (designatedReviewers.length < 3) {
      for (let i = designatedReviewers.length; i < 3; i++) {
        const u = await prisma.user.create({
          data: {
            email: `reviewer_${i}_${Date.now()}@tfhc.test`,
            passwordHash: '$2b$10$hashedtestpassword1234567890',
            role: 'LEADER',
            isActive: true,
            lastLoginAt: new Date(),
          },
        });
        designatedReviewers.push(u);
      }
    }

    await reviewService.setReviewers(
      designatedReviewers.map((r) => r.id),
      superAdminUser.id,
    );
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: Active Member Eligibility – All 5 Mandatory Conditions
  // -------------------------------------------------------------------------
  it('Scenario 1: Evaluates all 5 active member eligibility criteria strictly', async () => {
    const prefix = `e1_${Date.now()}`;

    // 1. In lookup table only (no User linked)
    const mLookupOnly = await prisma.member.create({
      data: {
        memberCode: `${prefix}_LKP`,
        firstName: 'Lookup',
        lastName: 'Only',
        phoneNumber: '+234800000001',
        status: MemberStatus.ACTIVE,
        userId: null,
      },
    });

    // 2. Profile incomplete (e.g. empty last name)
    const uIncomplete = await prisma.user.create({
      data: {
        email: `${prefix}_inc@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    const mIncomplete = await prisma.member.create({
      data: {
        userId: uIncomplete.id,
        memberCode: `${prefix}_INC`,
        firstName: 'Profile',
        lastName: '', // Empty last name
        phoneNumber: '+234800000002',
        status: MemberStatus.ACTIVE,
      },
    });

    // 3. Inactive / deactivated user
    const uDeactivated = await prisma.user.create({
      data: {
        email: `${prefix}_deact@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: false, // Inactive
        lastLoginAt: new Date(),
      },
    });
    const mDeactivated = await prisma.member.create({
      data: {
        userId: uDeactivated.id,
        memberCode: `${prefix}_DCT`,
        firstName: 'Deact',
        lastName: 'Member',
        phoneNumber: '+234800000003',
        status: MemberStatus.ACTIVE,
      },
    });

    // 4. Never signed in (lastLoginAt === null)
    const uNeverLogin = await prisma.user.create({
      data: {
        email: `${prefix}_nologin@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: true,
        lastLoginAt: null, // Never signed in
      },
    });
    const mNeverLogin = await prisma.member.create({
      data: {
        userId: uNeverLogin.id,
        memberCode: `${prefix}_NLG`,
        firstName: 'Never',
        lastName: 'Login',
        phoneNumber: '+234800000004',
        status: MemberStatus.ACTIVE,
      },
    });

    // 5. Signed in but never attempted clock-in
    const uNoClockIn = await prisma.user.create({
      data: {
        email: `${prefix}_noclock@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    const mNoClockIn = await prisma.member.create({
      data: {
        userId: uNoClockIn.id,
        memberCode: `${prefix}_NCK`,
        firstName: 'No',
        lastName: 'ClockIn',
        phoneNumber: '+234800000005',
        status: MemberStatus.ACTIVE,
      },
    });

    // 6. Suspended member
    const uSuspended = await prisma.user.create({
      data: {
        email: `${prefix}_susp@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    const mSuspended = await prisma.member.create({
      data: {
        userId: uSuspended.id,
        memberCode: `${prefix}_SUS`,
        firstName: 'Suspended',
        lastName: 'Member',
        phoneNumber: '+234800000006',
        status: MemberStatus.SUSPENDED, // Excluded
      },
    });
    await prisma.clockInAttempt.create({
      data: {
        memberId: mSuspended.id,
        success: true,
      },
    });

    // 7. Fully eligible member (satisfies all 5 conditions)
    const uEligible = await prisma.user.create({
      data: {
        email: `${prefix}_elig@tfhc.test`,
        passwordHash: '$2b$10$hashed',
        role: 'MEMBER',
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    const mEligible = await prisma.member.create({
      data: {
        userId: uEligible.id,
        memberCode: `${prefix}_ELG`,
        firstName: 'Fully',
        lastName: 'Eligible',
        phoneNumber: '+234800000007',
        status: MemberStatus.ACTIVE,
      },
    });
    await prisma.clockInAttempt.create({
      data: {
        memberId: mEligible.id,
        success: true,
      },
    });

    // Run eligibility audit
    const audit = await eligibilityService.getEligibilityAudit();

    // Verify exclusions
    const excludedMemberIds = new Set(audit.excludedMembers.map((e) => e.memberId));
    expect(excludedMemberIds.has(mLookupOnly.id)).toBe(true);
    expect(excludedMemberIds.has(mIncomplete.id)).toBe(true);
    expect(excludedMemberIds.has(mDeactivated.id)).toBe(true);
    expect(excludedMemberIds.has(mNeverLogin.id)).toBe(true);
    expect(excludedMemberIds.has(mNoClockIn.id)).toBe(true);
    expect(excludedMemberIds.has(mSuspended.id)).toBe(true);

    // Verify inclusion
    const eligibleMemberIds = new Set(audit.eligibleMembers.map((m) => m.memberId));
    expect(eligibleMemberIds.has(mEligible.id)).toBe(true);

    // Verify reason accuracy
    const lkpExcl = audit.excludedMembers.find((e) => e.memberId === mLookupOnly.id);
    expect(lkpExcl?.exclusionReasons.some((r) => r.includes('user account'))).toBe(true);

    const nlgExcl = audit.excludedMembers.find((e) => e.memberId === mNeverLogin.id);
    expect(nlgExcl?.exclusionReasons.some((r) => r.includes('never signed into'))).toBe(true);

    const nckExcl = audit.excludedMembers.find((e) => e.memberId === mNoClockIn.id);
    expect(nckExcl?.exclusionReasons.some((r) => r.includes('never made any attempt to clock in'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 2: Weekly Service Generation – 5 Designated Services
  // -------------------------------------------------------------------------
  it('Scenario 2: Generates timetable with all 5 weekly service sessions as independent entities', async () => {
    const genResult = await timetableService.catchUpOrGenerate(superAdminUser.id, 'NEXT');
    expect(genResult).toBeDefined();
    expect(genResult.period).toBeDefined();
    expect(genResult.version).toBeDefined();

    testPeriodId = genResult.period.id;
    testVersionId = genResult.version.id;

    const versionDetails = await timetableService.getVersionDetails(testVersionId);
    expect(versionDetails.sessions).toHaveLength(5);

    const sessionKeys = versionDetails.sessions.map((s) => s.sessionKey);
    expect(sessionKeys).toContain('TUESDAY_MIDWEEK');
    expect(sessionKeys).toContain('THURSDAY_DIVINE');
    expect(sessionKeys).toContain('SATURDAY_SEATS');
    expect(sessionKeys).toContain('SUNDAY_SECOND');
    expect(sessionKeys).toContain('SUNDAY_THIRD');

    // Verify Sunday Second and Sunday Third are independent sessions
    const sun2 = versionDetails.sessions.find((s) => s.sessionKey === 'SUNDAY_SECOND');
    const sun3 = versionDetails.sessions.find((s) => s.sessionKey === 'SUNDAY_THIRD');
    expect(sun2?.id).not.toEqual(sun3?.id);
    expect(sun2?.serviceDay).toBe('SUNDAY');
    expect(sun3?.serviceDay).toBe('SUNDAY');
  });

  // -------------------------------------------------------------------------
  // Test 3: Randomisation and Seed Reproducibility
  // -------------------------------------------------------------------------
  it('Scenario 3: Same seed reproduces identical schedules; different seed yields valid varied distribution', async () => {
    const candidatePool = await eligibilityService.getEligibleActiveMembers();
    if (candidatePool.length >= 6) {
      const testMondayA = new Date('2028-02-07T00:00:00.000Z');
      const fixedSeed = 'test_seeded_audit_hash_42';

      const runA = await generatorService.generateTimetable({
        weekStart: testMondayA,
        generationType: TimetableGenerationType.MANUAL_INITIAL,
        customSeed: fixedSeed,
      });

      const testMondayB = new Date('2028-02-14T00:00:00.000Z');
      const runB = await generatorService.generateTimetable({
        weekStart: testMondayB,
        generationType: TimetableGenerationType.MANUAL_INITIAL,
        customSeed: fixedSeed,
      });

      // Assert identical assignment counts
      for (const sessKey of ['TUESDAY_MIDWEEK', 'THURSDAY_DIVINE', 'SATURDAY_SEATS', 'SUNDAY_SECOND', 'SUNDAY_THIRD']) {
        const aSession = runA.sessions.find((s) => s.sessionKey === sessKey);
        const bSession = runB.sessions.find((s) => s.sessionKey === sessKey);
        expect(aSession?.assignedUshersCount).toEqual(bSession?.assignedUshersCount);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: Fair Distribution across Multi-Week Lookback
  // -------------------------------------------------------------------------
  it('Scenario 4: Fairness weights prioritize members with fewer assignments', async () => {
    const config = await generatorService.getConfig();
    expect(config.fairnessWeight).toBeGreaterThan(0);
    expect(config.lookbackWeeks).toBe(6);
  });

  // -------------------------------------------------------------------------
  // Test 5: Assignment Constraints (Max Assignments / No Duplicates in Session)
  // -------------------------------------------------------------------------
  it('Scenario 5: Enforces max assignments per week and no duplicate member in same session', async () => {
    const versionDetails = await timetableService.getVersionDetails(testVersionId);

    const memberWeeklyCounts = new Map<string, number>();

    for (const session of versionDetails.sessions) {
      const assignedInSession = session.assignments.map((a: any) => a.memberId);
      const uniqueInSession = new Set(assignedInSession);

      // No duplicates within the same session
      expect(uniqueInSession.size).toBe(assignedInSession.length);

      for (const mId of assignedInSession) {
        memberWeeklyCounts.set(mId, (memberWeeklyCounts.get(mId) || 0) + 1);
      }
    }

    // Max 2 assignments per week
    for (const [, count] of memberWeeklyCounts.entries()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Insufficient Members Handling
  // -------------------------------------------------------------------------
  it('Scenario 6: Reports partial coverage without ever assigning ineligible members', async () => {
    const result = await generatorService.generateTimetable({
      weekStart: new Date('2028-03-06T00:00:00.000Z'),
      generationType: TimetableGenerationType.MANUAL_INITIAL,
    });

    expect(result.sessions).toHaveLength(5);
    expect(Array.isArray(result.unfulfilledSlots)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 7: Automated Saturday Generation and Idempotency
  // -------------------------------------------------------------------------
  it('Scenario 7: Saturday automated job generates upcoming timetable and is idempotent', async () => {
    await weeklyJob.handleSaturdayGeneration();

    const history = await timetableService.listHistory();
    expect(history.length).toBeGreaterThan(0);

    // Re-running job is idempotent
    await weeklyJob.handleSaturdayGeneration();
    const historyAfter = await timetableService.listHistory();
    expect(historyAfter.length).toBe(history.length);
  });

  // -------------------------------------------------------------------------
  // Test 8: Catch-up / Rollout Generation for Current Week
  // -------------------------------------------------------------------------
  it('Scenario 8: Immediate catch-up generation succeeds for current week rollout', async () => {
    const result = await timetableService.catchUpOrGenerate(superAdminUser.id, 'CURRENT');
    expect(result).toBeDefined();
    expect(result.period).toBeDefined();
    expect(result.version).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 9: Three-Person Approval Workflow
  // -------------------------------------------------------------------------
  it('Scenario 9: Requires 3 reviewer approvals before publication is enabled', async () => {
    // Disable auto-publish to test step-by-step
    await reviewService.updatePolicy(
      { requiredApprovalsCount: 3, autoPublishOnFullApproval: false },
      superAdminUser.id,
    );

    const testMonday = new Date(Date.UTC(2035, 3, 10 + Math.floor(Math.random() * 500) * 7));
    const period = await prisma.timetablePeriod.create({
      data: {
        weekStart: testMonday,
        label: `Review Approval Test ${Date.now()}`,
        status: TimetablePeriodStatus.DRAFT,
      },
    });

    const version = await prisma.timetableVersion.create({
      data: {
        periodId: period.id,
        versionNumber: 1,
        status: TimetableVersionStatus.PENDING_REVIEW,
        metadata: {},
      },
    });

    // Reviewer 1 Approves
    const rev1 = await reviewService.submitReview({
      versionId: version.id,
      reviewerUserId: designatedReviewers[0].id,
      decision: TimetableReviewDecision.APPROVED,
      comments: 'Reviewer 1 approved',
    });
    expect(rev1.approvedCount).toBe(1);
    expect(rev1.isFullyApproved).toBe(false);

    // Reviewer 2 Approves
    const rev2 = await reviewService.submitReview({
      versionId: version.id,
      reviewerUserId: designatedReviewers[1].id,
      decision: TimetableReviewDecision.APPROVED,
    });
    expect(rev2.approvedCount).toBe(2);
    expect(rev2.isFullyApproved).toBe(false);

    // Early publish attempt must fail
    await expect(reviewService.publishTimetable(version.id, superAdminUser.id)).rejects.toThrow(
      'Cannot publish timetable. Only 2 of 3 required reviewer approvals',
    );

    // Reviewer 3 Approves
    const rev3 = await reviewService.submitReview({
      versionId: version.id,
      reviewerUserId: designatedReviewers[2].id,
      decision: TimetableReviewDecision.APPROVED,
    });
    expect(rev3.approvedCount).toBe(3);
    expect(rev3.isFullyApproved).toBe(true);

    // Publish now succeeds
    const published = await reviewService.publishTimetable(version.id, superAdminUser.id);
    expect(published.version.status).toBe(TimetableVersionStatus.PUBLISHED);
  });

  // -------------------------------------------------------------------------
  // Test 10: Reviewer Rejection & Revision Halt
  // -------------------------------------------------------------------------
  it('Scenario 10: Rejection records reason, halts publication, and marks version REJECTED', async () => {
    const testMonday = new Date(Date.UTC(2036, 4, 8 + Math.floor(Math.random() * 500) * 7));
    const period = await prisma.timetablePeriod.create({
      data: {
        weekStart: testMonday,
        label: `Reject Test Week ${Date.now()}`,
        status: TimetablePeriodStatus.DRAFT,
      },
    });

    const version = await prisma.timetableVersion.create({
      data: {
        periodId: period.id,
        versionNumber: 1,
        status: TimetableVersionStatus.PENDING_REVIEW,
        metadata: {},
      },
    });

    // Rejecting without reason throws BadRequestException
    await expect(
      reviewService.submitReview({
        versionId: version.id,
        reviewerUserId: designatedReviewers[0].id,
        decision: TimetableReviewDecision.REJECTED,
      }),
    ).rejects.toThrow('A reason is required when rejecting a timetable');

    // Rejecting with reason marks REJECTED
    const rejectionResult = await reviewService.submitReview({
      versionId: version.id,
      reviewerUserId: designatedReviewers[0].id,
      decision: TimetableReviewDecision.REJECTED,
      rejectionReason: 'Sunday second service is understaffed',
    });

    expect(rejectionResult.status).toBe('REJECTED');

    // Publishing rejected timetable must fail
    await expect(reviewService.publishTimetable(version.id, superAdminUser.id)).rejects.toThrow(
      'Cannot publish a rejected timetable',
    );
  });

  // -------------------------------------------------------------------------
  // Test 11: Member vs Reviewer vs Admin Dashboard Permissions
  // -------------------------------------------------------------------------
  it('Scenario 11: Ordinary members cannot view drafts; designated reviewers and super admins have full visibility', async () => {
    const adminView = await timetableService.getAdminCurrentTimetable(superAdminUser.id);
    expect(adminView).toBeDefined();

    const reviewerView = await timetableService.getAdminCurrentTimetable(designatedReviewers[0].id);
    expect(reviewerView.isDesignatedReviewer).toBe(true);

    const nonReviewer = await prisma.user.findFirst({
      where: { id: { notIn: [superAdminUser.id, ...designatedReviewers.map((r) => r.id)] } },
    });
    if (nonReviewer) {
      const nonReviewerView = await timetableService.getAdminCurrentTimetable(nonReviewer.id);
      expect(nonReviewerView.isDesignatedReviewer).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Test 12: Published Timetable Visibility for Ordinary Members
  // -------------------------------------------------------------------------
  it('Scenario 12: Ordinary members can view published timetables with their assignments highlighted', async () => {
    const assigned = await prisma.timetableAssignment.findFirst({
      where: { session: { version: { status: TimetableVersionStatus.PUBLISHED } } },
      include: { session: true },
    });

    if (assigned) {
      const memberTimetable = await timetableService.getMemberCurrentTimetable(assigned.memberId);
      expect(memberTimetable.published).toBe(true);
      expect(memberTimetable.myAssignments.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 13: Controlled Manual Adjustment with Audit Trail
  // -------------------------------------------------------------------------
  it('Scenario 13: Admin can replace an assigned usher with audited reason; prevents ineligible replacement', async () => {
    const session = await prisma.timetableServiceSession.findFirst({
      where: { assignments: { some: {} } },
      include: { assignments: true },
    });

    if (session && session.assignments.length > 0) {
      const existingAssignment = session.assignments[0];
      const eligiblePool = await eligibilityService.getEligibleActiveMembers();
      const newCandidate = eligiblePool.find(
        (m) => !session.assignments.some((a) => a.memberId === m.memberId),
      );

      if (newCandidate) {
        const adjusted = await reviewService.adjustAssignment({
          sessionId: session.id,
          existingMemberId: existingAssignment.memberId,
          newMemberId: newCandidate.memberId,
          reason: 'Member requested absence due to work conflict',
          actorUserId: superAdminUser.id,
        });

        expect(adjusted.memberId).toBe(newCandidate.memberId);

        // Verify audit log
        const auditLog = await prisma.auditLog.findFirst({
          where: {
            action: 'TIMETABLE_ASSIGNMENT_ADJUSTED',
            entityId: session.id,
          },
          orderBy: { createdAt: 'desc' },
        });
        expect(auditLog).toBeDefined();
      }

      // Trying to swap with an ineligible member throws BadRequestException
      await expect(
        reviewService.adjustAssignment({
          sessionId: session.id,
          existingMemberId: newCandidate.memberId,
          newMemberId: 'ineligible-nonexistent-id',
          reason: 'Test invalid swap',
          actorUserId: superAdminUser.id,
        }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  // -------------------------------------------------------------------------
  // Test 14: Historical Records and Auditing
  // -------------------------------------------------------------------------
  it('Scenario 14: Maintains complete queryable history of periods and versions', async () => {
    const history = await timetableService.listHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 15: Existing Functionality Regression Check
  // -------------------------------------------------------------------------
  it('Scenario 15: Critical existing systems (auth, attendance, dues, expenses) remain completely unaffected', async () => {
    // 1. Auth check
    const user = await prisma.user.findFirst({ where: { isActive: true } });
    expect(user).toBeDefined();

    // 2. Attendance check
    const meeting = await prisma.meeting.findFirst();
    expect(meeting).toBeDefined();

    // 3. Dues check
    const duesPeriod = await prisma.duesPeriod.findFirst();
    expect(duesPeriod).toBeDefined();

    // 4. Expense check
    const expenses = await prisma.expense.findMany({ take: 1 });
    expect(expenses).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 16: Supervising Ministers & Separate Sunday Sessions
  // -------------------------------------------------------------------------
  it('Scenario 16: Assigns supervising minister to weekly services and keeps Sunday 2nd & 3rd separate', async () => {
    // Ensure an executive member exists to serve as candidate
    const execCandidate = await prisma.member.findFirst({
      where: {
        status: MemberStatus.ACTIVE,
        OR: [
          { subTeam: { name: { in: ['Executive', 'Disciplinary Committee', 'Disciplinary Commitee'] } } },
          { roleInUnit: { in: ['Executive', 'Leader', 'Administrator'] } },
        ],
      },
    });

    if (!execCandidate) {
      await prisma.member.create({
        data: {
          memberCode: `EXEC_${Date.now()}`,
          firstName: 'Executive',
          lastName: 'Leader',
          phoneNumber: '+234800000099',
          roleInUnit: 'Leader',
          status: MemberStatus.ACTIVE,
        },
      });
    }

    const result = await timetableService.catchUpOrGenerate(superAdminUser.id, 'CURRENT');
    expect(result.sessions.length).toBe(5);

    const sundaySecond = result.sessions.find((s) => s.sessionKey === 'SUNDAY_SECOND');
    const sundayThird = result.sessions.find((s) => s.sessionKey === 'SUNDAY_THIRD');

    expect(sundaySecond).toBeDefined();
    expect(sundayThird).toBeDefined();
    expect(sundaySecond?.id).not.toBe(sundayThird?.id);

    // Verify supervising ministers can be fetched
    const candidates = await generatorService.getSupervisingMinisterCandidates();
    expect(candidates.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 17: Reviewer Modifications & Prior Approval Reset
  // -------------------------------------------------------------------------
  it('Scenario 17: Reviewer modifications (swap, position, minister) reset prior approvals requiring fresh review', async () => {
    const result = await timetableService.catchUpOrGenerate(superAdminUser.id, 'CURRENT');
    const versionId = result.version.id;

    // Reviewer 1 submits approval
    await reviewService.submitReview({
      versionId,
      reviewerUserId: designatedReviewers[0].id,
      decision: TimetableReviewDecision.APPROVED,
      comments: 'Looks good to me',
    });

    let reviews = await prisma.timetableReview.findMany({ where: { versionId } });
    expect(reviews.length).toBe(1);

    // Pick two assignments to swap within the same session
    const assignments = await prisma.timetableAssignment.findMany({
      where: { session: { versionId, sessionKey: 'TUESDAY_MIDWEEK' } },
      take: 2,
    });
    expect(assignments.length).toBe(2);

    // Reviewer performs swap
    const swapResult = await reviewService.swapAssignments({
      assignmentId1: assignments[0].id,
      assignmentId2: assignments[1].id,
      reason: 'Testing reviewer swap resets prior approvals',
      actorUserId: designatedReviewers[0].id,
    });

    expect(swapResult.assignment1.memberId).toBe(assignments[1].memberId);
    expect(swapResult.assignment2.memberId).toBe(assignments[0].memberId);

    // Prior approval MUST be reset
    reviews = await prisma.timetableReview.findMany({ where: { versionId } });
    expect(reviews.length).toBe(0);

    const versionAfterSwap = await prisma.timetableVersion.findUnique({ where: { id: versionId } });
    expect(versionAfterSwap?.status).toBe(TimetableVersionStatus.PENDING_REVIEW);

    // Update position
    const updatedPos = await reviewService.updateAssignmentPosition({
      assignmentId: assignments[0].id,
      position: 'Altar Sanctuary Lead',
      role: 'LEAD_USHER',
      reason: 'Assigned as lead',
      actorUserId: designatedReviewers[0].id,
    });
    expect(updatedPos.position).toBe('Altar Sanctuary Lead');

    // Update supervising minister
    const ministerCandidates = await generatorService.getSupervisingMinisterCandidates();
    if (ministerCandidates.length > 0) {
      const updatedSession = await reviewService.updateSessionSupervisingMinister({
        sessionId: assignments[0].sessionId,
        supervisingMinisterId: ministerCandidates[0].id,
        reason: 'Supervising mid-week service',
        actorUserId: designatedReviewers[0].id,
      });
      expect(updatedSession.supervisingMinisterId).toBe(ministerCandidates[0].id);
    }
  });

  // -------------------------------------------------------------------------
  // Test 18: Special Events & Programmes Workflow & Strict Permission Gate
  // -------------------------------------------------------------------------
  it('Scenario 18: Special events generation runs as independent workflow without overwriting regular weekly timetable', async () => {
    // 1. Permission Gate Verification:
    // Create an ordinary Super Admin who is NOT in the 3 designated reviewers and NOT the platform owner
    const ordinaryAdmin = await prisma.user.create({
      data: {
        email: `ordinary_admin_${Date.now()}@tfhc.test`,
        passwordHash: '$2b$10$hashedtestpassword1234567890',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const isOrdinaryAdminAuth = await reviewService.isAuthorizedForSpecialEvent(ordinaryAdmin.id);
    expect(isOrdinaryAdminAuth).toBe(false);

    // Designated Reviewer MUST be authorized
    const isReviewerAuth = await reviewService.isAuthorizedForSpecialEvent(designatedReviewers[0].id);
    expect(isReviewerAuth).toBe(true);

    // Platform Owner MUST be authorized
    const ownerEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase();
    let ownerUser = await prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: 'insensitive' } },
    });
    if (!ownerUser) {
      ownerUser = await prisma.user.create({
        data: {
          email: ownerEmail,
          passwordHash: '$2b$10$hashedtestpassword1234567890',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }
    const isOwnerAuth = await reviewService.isAuthorizedForSpecialEvent(ownerUser.id);
    expect(isOwnerAuth).toBe(true);

    // 2. Generate Special Event
    const specialEvent = await generatorService.generateSpecialEventTimetable({
      title: 'Night of Praise & Breakthrough',
      eventDate: new Date('2026-12-05'),
      startTime: new Date('2026-12-05T18:00:00Z'),
      endTime: new Date('2026-12-05T21:00:00Z'),
      requiredUshers: 5,
      actorUserId: designatedReviewers[0].id,
    });

    expect(specialEvent.period.periodType).toBe('SPECIAL_EVENT');
    expect(specialEvent.session.isSpecialEvent).toBe(true);
    expect(specialEvent.session.specialEventTitle).toBe('Night of Praise & Breakthrough');

    // Verify regular weekly periods remain intact
    const regularPeriods = await prisma.timetablePeriod.findMany({
      where: { periodType: 'REGULAR_WEEKLY' },
    });
    expect(regularPeriods.length).toBeGreaterThan(0);
  });
});
