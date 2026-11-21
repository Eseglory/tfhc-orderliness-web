import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/modules/finance/payments.service';
import { DuesService } from '../src/modules/finance/dues.service';
import { ExcusesService } from '../src/modules/excuses/excuses.service';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SYSTEM_ROLE } from '@tfhc/shared';
import { ApprovalDecision, Role, DuesPeriodType, DuesPeriodStatus, DuesAssignmentStatus, PaymentPurpose, FinancePaymentMethod, PaymentStatus } from '@prisma/client';

describe('Payment Adjustments, Installment Tracking & Disciplinary Committee Approvals E2E Test Suite', () => {
  let app: INestApplication;
  let paymentsService: PaymentsService;
  let duesService: DuesService;
  let excusesService: ExcusesService;
  let approvalsService: ApprovalsService;
  let prisma: PrismaService;

  // Test entities created in local isolated Docker DB
  let testMember1: any;
  let testMember2: any;
  let testAdminUser: any;
  let testCommitteeUser: any;
  let testDanielUser: any;
  let testJacobUser: any;
  let testJacobMember: any;
  let testOrdinaryUser: any;

  let christmasPeriod: any;
  let monthlyPeriod: any;
  let christmasAssignment1: any;
  let christmasAssignment2: any;
  let monthlyAssignment1: any;
  let absenceWorkflow: any;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    paymentsService = app.get(PaymentsService);
    duesService = app.get(DuesService);
    excusesService = app.get(ExcusesService);
    approvalsService = app.get(ApprovalsService);
    prisma = app.get(PrismaService);

    // Verify we are strictly in test environment using isolated local Docker DB
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toContain('127.0.0.1:55498/tfhc_e2e');

    // 1. Seed Test Users and Members in local Docker DB
    const timestamp = Date.now();

    // Admin user (role: ADMIN)
    testAdminUser = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@orderliness.test`,
        passwordHash: 'dummy-hashed-pwd',
        role: Role.ADMIN,
      },
    });

    // Disciplinary Committee Member (with access role DISCIPLINARY_COMMITTEE and APPROVAL_MANAGER)
    testCommitteeUser = await prisma.user.create({
      data: {
        email: `committee_${timestamp}@orderliness.test`,
        passwordHash: 'dummy-hashed-pwd',
        role: Role.LEADER,
        accessRoles: {
          create: [
            { role: { connect: { key: SYSTEM_ROLE.DISCIPLINARY_COMMITTEE } } },
            { role: { connect: { key: SYSTEM_ROLE.APPROVAL_MANAGER } } },
          ],
        },
      },
    });

    // Daniel Oguamanam (Authorized to approve Jacob)
    testDanielUser = await prisma.user.upsert({
      where: { email: 'danoguamanam@gmail.com' },
      create: {
        email: 'danoguamanam@gmail.com',
        passwordHash: 'dummy-hashed-pwd',
        role: Role.ADMIN,
        accessRoles: {
          create: [{ role: { connect: { key: SYSTEM_ROLE.ADMINISTRATION } } }],
        },
      },
      update: {},
    });

    // Jacob Onoja
    testJacobUser = await prisma.user.upsert({
      where: { email: 'onojamonday123@gmail.com' },
      create: {
        email: 'onojamonday123@gmail.com',
        passwordHash: 'dummy-hashed-pwd',
        role: Role.LEADER,
        accessRoles: {
          create: [{ role: { connect: { key: SYSTEM_ROLE.DISCIPLINARY_COMMITTEE } } }],
        },
      },
      update: {},
    });

    // Ordinary Member (no approval permissions)
    testOrdinaryUser = await prisma.user.create({
      data: {
        email: `ordinary_${timestamp}@orderliness.test`,
        passwordHash: 'dummy-hashed-pwd',
        role: Role.MEMBER,
      },
    });

    // Member 1
    testMember1 = await prisma.member.create({
      data: {
        userId: testOrdinaryUser.id,
        memberCode: `T-M1-${timestamp.toString().slice(-4)}`,
        firstName: 'Chinedu',
        lastName: 'Eze',
        phoneNumber: '+2348011111111',
      },
    });

    // Member 2
    testMember2 = await prisma.member.create({
      data: {
        memberCode: `T-M2-${timestamp.toString().slice(-4)}`,
        firstName: 'Amina',
        lastName: 'Bello',
        phoneNumber: '+2348022222222',
      },
    });

    // Jacob's Member Profile
    testJacobMember = await prisma.member.upsert({
      where: { userId: testJacobUser.id },
      create: {
        userId: testJacobUser.id,
        memberCode: `T-JB-${timestamp.toString().slice(-4)}`,
        firstName: 'Jacob',
        lastName: 'Onoja',
        phoneNumber: '+2348033333333',
      },
      update: {},
    });

    // 2. Seed Campaigns: Christmas Party 2026 (₦20,000) and Monthly Dues (₦2,500)
    christmasPeriod = await prisma.duesPeriod.create({
      data: {
        label: `Christmas Party Contribution ${timestamp}`,
        type: DuesPeriodType.SPECIAL,
        defaultAmount: 20000,
        year: 2026,
        month: 12,
        dueDate: new Date('2026-12-25'),
        status: DuesPeriodStatus.OPEN,
      },
    });

    monthlyPeriod = await prisma.duesPeriod.create({
      data: {
        label: `November 2026 Monthly Dues ${timestamp}`,
        type: DuesPeriodType.MONTHLY,
        defaultAmount: 2500,
        year: 2026,
        month: 11,
        dueDate: new Date('2026-11-30'),
        status: DuesPeriodStatus.OPEN,
      },
    });

    // Assignments
    christmasAssignment1 = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember1.id,
        periodId: christmasPeriod.id,
        amountDue: 20000,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });

    christmasAssignment2 = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember2.id,
        periodId: christmasPeriod.id,
        amountDue: 20000,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });

    monthlyAssignment1 = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember1.id,
        periodId: monthlyPeriod.id,
        amountDue: 2500,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });

    // 3. Seed Approval Workflow for Absence Requests (matching production workflow SEC_WF_*)
    absenceWorkflow = await prisma.approvalWorkflow.create({
      data: {
        key: `SEC_WF_${timestamp}`,
        name: 'Absence Leave Verification Workflow',
        requestType: 'ABSENCE',
        active: true,
        steps: {
          create: [
            {
              order: 1,
              name: 'Disciplinary Committee Review',
              approverMode: 'ROLE',
              roleKey: 'ADMIN', // Production pattern: legacy roleKey ADMIN
            },
          ],
        },
      },
    });
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      await prisma.approvalAction.deleteMany({
        where: { request: { workflowId: absenceWorkflow?.id } },
      }).catch(() => {});
      await prisma.approvalRequest.deleteMany({
        where: { workflowId: absenceWorkflow?.id },
      }).catch(() => {});
      await prisma.approvalStep.deleteMany({
        where: { workflowId: absenceWorkflow?.id },
      }).catch(() => {});
      await prisma.approvalWorkflow.deleteMany({
        where: { id: absenceWorkflow?.id },
      }).catch(() => {});
      await prisma.absenceExcuse.deleteMany({
        where: { memberId: { in: [testMember1?.id, testMember2?.id, testJacobMember?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.payment.deleteMany({
        where: { memberId: { in: [testMember1?.id, testMember2?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.memberDuesAssignment.deleteMany({
        where: { memberId: { in: [testMember1?.id, testMember2?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.duesPeriod.deleteMany({
        where: { id: { in: [christmasPeriod?.id, monthlyPeriod?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.member.deleteMany({
        where: { id: { in: [testMember1?.id, testMember2?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.userAccessRole.deleteMany({
        where: { userId: { in: [testAdminUser?.id, testCommitteeUser?.id, testOrdinaryUser?.id].filter(Boolean) } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: [testAdminUser?.id, testCommitteeUser?.id, testOrdinaryUser?.id].filter(Boolean) } },
      }).catch(() => {});
    }
    await app.close();
  });

  // ==========================================================================
  // TASK 1: PAYMENT VERIFICATION, AMOUNT ADJUSTMENT & INSTALLMENT TRACKING
  // ==========================================================================

  describe('Task 1: Payment Verification, Amount Adjustment and Installment Tracking', () => {
    it('Scenario 1: Member submits declaration claiming ₦20,000 for Christmas contribution', async () => {
      const payment = await paymentsService.declare(testMember1.id, testOrdinaryUser.id, {
        purpose: 'SPECIAL_CONTRIBUTION',
        amount: 20000,
        method: 'BANK_TRANSFER',
        duesAssignmentId: christmasAssignment1.id,
        payerReference: 'Transfer Ref #123456',
        description: 'Payment for 2026 Christmas Party',
      });

      expect(payment).toBeDefined();
      expect(payment.status).toBe('PENDING');
      expect(payment.amount).toBe(20000);
      expect((payment.metadata as any)?.claimedAmount).toBe(20000);

      // Verify shape returns distinct amount fields
      const shaped = (paymentsService as any).shape({
        ...payment,
        member: { firstName: 'Chinedu', lastName: 'Eze', memberCode: 'T-M1-0001' },
        duesAssignment: {
          period: { label: 'Christmas Party' },
          amountDue: 20000,
          amountPaid: 0,
          status: 'OUTSTANDING',
        },
      });
      expect(shaped.amountPayable).toBe(20000);
      expect(shaped.claimedAmount).toBe(20000);
      expect(shaped.isAdjusted).toBe(false);
    });

    it('Scenario 2: Administrator discovers receipt shows only ₦10,000, adjusts verified amount to ₦10,000 with admin note, and confirms', async () => {
      // Find the pending payment
      const pendingPayment = await prisma.payment.findFirst({
        where: { duesAssignmentId: christmasAssignment1.id, status: 'PENDING' },
      });
      expect(pendingPayment).toBeDefined();

      const adminNote = 'Your receipt confirms a payment of ₦10,000, not ₦20,000. Your remaining balance is ₦10,000.';
      const confirmed = await paymentsService.confirm(pendingPayment!.id, testAdminUser.id, {
        confirmedAmount: 10000,
        adminNote,
      });

      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.amount).toBe(10000); // Amount paid is 10,000
      expect((confirmed.metadata as any).claimedAmount).toBe(20000); // Preserves original claimed amount
      expect((confirmed.metadata as any).confirmedAmount).toBe(10000);
      expect((confirmed.metadata as any).isAdjusted).toBe(true);
      expect((confirmed.metadata as any).adminNote).toBe(adminNote);
      expect((confirmed.metadata as any).adjustedByUserId).toBe(testAdminUser.id);

      // Verify member dues assignment is PARTIALLY_PAID with ₦10,000 balance remaining
      const updatedAssignment = await prisma.memberDuesAssignment.findUnique({
        where: { id: christmasAssignment1.id },
      });
      expect(updatedAssignment!.status).toBe(DuesAssignmentStatus.PARTIALLY_PAID);
      expect(updatedAssignment!.amountPaid).toBe(10000);
      expect(updatedAssignment!.amountDue - updatedAssignment!.amountPaid).toBe(10000);

      // Verify financial audit trail log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityId: pendingPayment!.id,
          action: 'PAYMENT_CONFIRMED_ADJUSTED',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog!.newData).toMatchObject({
        originalClaimedAmount: 20000,
        confirmedAmount: 10000,
        isAdjusted: true,
        adminNote,
      });
    });

    it('Scenario 3: Member views contribution dashboard: sees Total ₦20,000, Confirmed ₦10,000, Balance ₦10,000, status Partially Paid, and admin note', async () => {
      const myCampaigns = await duesService.myCampaigns(testMember1.id);
      const campaign = myCampaigns.find((c) => c.id === christmasAssignment1.id);
      expect(campaign).toBeDefined();
      expect(campaign!.amountDue).toBe(20000);
      expect(campaign!.amountPaid).toBe(10000);
      expect(campaign!.balance).toBe(10000);
      expect(campaign!.status).toBe('PARTIALLY_PAID');
      expect(campaign!.isPartiallyPaid).toBe(true);
      expect(campaign!.confirmedInstallmentsCount).toBe(1);
      expect(campaign!.maxInstallments).toBe(2);
      expect(campaign!.canSubmitInstallment).toBe(true);

      // Check payments list attached to campaign
      expect(campaign!.payments).toHaveLength(1);
      const p = campaign!.payments![0];
      expect(p.amount).toBe(10000);
      expect(p.claimedAmount).toBe(20000);
      expect(p.isAdjusted).toBe(true);
      expect(p.adminNote).toContain('Your receipt confirms a payment of ₦10,000');
    });

    it('Scenario 4: Member pays second installment of ₦10,000: confirmed -> status becomes Fully Paid (PAID)', async () => {
      // Declare 2nd installment
      const secondPayment = await paymentsService.declare(testMember1.id, testOrdinaryUser.id, {
        purpose: 'SPECIAL_CONTRIBUTION',
        amount: 10000,
        method: 'BANK_TRANSFER',
        duesAssignmentId: christmasAssignment1.id,
        payerReference: 'Installment #2 Ref',
      });
      expect(secondPayment.status).toBe('PENDING');

      // Admin confirms 2nd installment of 10,000
      await paymentsService.confirm(secondPayment.id, testAdminUser.id, {
        confirmedAmount: 10000,
        adminNote: 'Second installment verified in full.',
      });

      // Verify dues assignment is now PAID
      const updatedAssignment = await prisma.memberDuesAssignment.findUnique({
        where: { id: christmasAssignment1.id },
      });
      expect(updatedAssignment!.status).toBe(DuesAssignmentStatus.PAID);
      expect(updatedAssignment!.amountPaid).toBe(20000);
      expect(updatedAssignment!.amountDue - updatedAssignment!.amountPaid).toBe(0);

      // Member views campaigns: canSubmitInstallment is false, confirmedInstallmentsCount is 2
      const myCampaigns = await duesService.myCampaigns(testMember1.id);
      const campaign = myCampaigns.find((c) => c.id === christmasAssignment1.id);
      expect(campaign!.status).toBe('PAID');
      expect(campaign!.confirmedInstallmentsCount).toBe(2);
      expect(campaign!.canSubmitInstallment).toBe(false);
    });

    it('Scenario 5: Attempting a 3rd installment is strictly blocked', async () => {
      await expect(
        paymentsService.declare(testMember1.id, testOrdinaryUser.id, {
          purpose: 'SPECIAL_CONTRIBUTION',
          amount: 5000,
          method: 'BANK_TRANSFER',
          duesAssignmentId: christmasAssignment1.id,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 6: Member 2 declares full ₦20,000 in one transaction -> confirmed as Fully Paid in 1 installment', async () => {
      const payment = await paymentsService.declare(testMember2.id, testAdminUser.id, {
        purpose: 'SPECIAL_CONTRIBUTION',
        amount: 20000,
        method: 'BANK_TRANSFER',
        duesAssignmentId: christmasAssignment2.id,
      });

      await paymentsService.confirm(payment.id, testAdminUser.id, {
        confirmedAmount: 20000,
      });

      const updatedAssignment = await prisma.memberDuesAssignment.findUnique({
        where: { id: christmasAssignment2.id },
      });
      expect(updatedAssignment!.status).toBe(DuesAssignmentStatus.PAID);
      expect(updatedAssignment!.amountPaid).toBe(20000);
      expect(updatedAssignment!.amountDue - updatedAssignment!.amountPaid).toBe(0);
    });

    it('Scenario 7: Attempted overpayment exceeding contribution amount is blocked', async () => {
      // Create a fresh period and assignment
      const extraPeriod = await prisma.duesPeriod.create({
        data: {
          label: `Extra Drive ${Date.now()}`,
          type: DuesPeriodType.SPECIAL,
          defaultAmount: 20000,
          year: 2026,
          month: 12,
          dueDate: new Date('2026-12-31'),
          status: DuesPeriodStatus.OPEN,
        },
      });
      const extraAssignment = await prisma.memberDuesAssignment.create({
        data: {
          memberId: testMember1.id,
          periodId: extraPeriod.id,
          amountDue: 20000,
          amountPaid: 0,
          status: DuesAssignmentStatus.OUTSTANDING,
        },
      });

      // Attempt declaring 25,000
      await expect(
        paymentsService.declare(testMember1.id, testOrdinaryUser.id, {
          purpose: 'SPECIAL_CONTRIBUTION',
          amount: 25000,
          method: 'BANK_TRANSFER',
          duesAssignmentId: extraAssignment.id,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 8: Rejected payment does not consume installment count or alter balance', async () => {
      const rejectPeriod = await prisma.duesPeriod.create({
        data: {
          label: `Christmas Drive Reject Test ${Date.now()}`,
          type: DuesPeriodType.SPECIAL,
          defaultAmount: 20000,
          year: 2026,
          month: 12,
          dueDate: new Date('2026-12-31'),
          status: DuesPeriodStatus.OPEN,
        },
      });
      const testAssign = await prisma.memberDuesAssignment.create({
        data: {
          memberId: testMember2.id,
          periodId: rejectPeriod.id,
          amountDue: 20000,
          amountPaid: 0,
          status: DuesAssignmentStatus.OUTSTANDING,
        },
      });

      const p = await paymentsService.declare(testMember2.id, testAdminUser.id, {
        purpose: 'SPECIAL_CONTRIBUTION',
        amount: 10000,
        method: 'BANK_TRANSFER',
        duesAssignmentId: testAssign.id,
      });

      // Admin rejects payment
      await paymentsService.reject(p.id, testAdminUser.id, 'Fake receipt image attached');

      const rejectedP = await prisma.payment.findUnique({ where: { id: p.id } });
      expect(rejectedP!.status).toBe(PaymentStatus.REJECTED);
      expect(rejectedP!.rejectionReason).toBe('Fake receipt image attached');

      // Installment count is still 0
      const myCampaigns = await duesService.myCampaigns(testMember2.id);
      const camp = myCampaigns.find((c) => c.id === testAssign.id);
      expect(camp!.confirmedInstallmentsCount).toBe(0);
      expect(camp!.canSubmitInstallment).toBe(true);
      expect(camp!.balance).toBe(20000);
    });
  });

  // ==========================================================================
  // TASK 2: DISCIPLINARY COMMITTEE APPROVAL WORKFLOW FIX
  // ==========================================================================

  describe('Task 2: Disciplinary Committee Approval Functionality Fix', () => {
    let absenceExcuse1: any;
    let approvalRequest1: any;
    let absenceExcuseJacob: any;
    let approvalRequestJacob: any;

    beforeAll(async () => {
      // 1. Ordinary member submits an absence excuse
      absenceExcuse1 = await prisma.absenceExcuse.create({
        data: {
          memberId: testMember1.id,
          reason: 'Severe fever and malaria symptoms',
          category: 'SICKNESS',
          status: 'PENDING',
        },
      });

      // Corresponding approval request for member1
      approvalRequest1 = await prisma.approvalRequest.create({
        data: {
          workflowId: absenceWorkflow.id,
          requestType: 'ABSENCE',
          entityType: 'ABSENCE_EXCUSE',
          entityId: absenceExcuse1.id,
          summary: 'Absence Leave: Chinedu Eze - Severe fever',
          status: 'PENDING',
          currentStepOrder: 1,
          requestedByUserId: testOrdinaryUser.id,
          requestedByMemberId: testMember1.id,
        },
      });

      // 2. Jacob Onoja submits an absence excuse (Special Rule)
      absenceExcuseJacob = await prisma.absenceExcuse.create({
        data: {
          memberId: testJacobMember.id,
          reason: 'Family engagement outside Lagos',
          category: 'FAMILY_EVENT',
          status: 'PENDING',
        },
      });

      approvalRequestJacob = await prisma.approvalRequest.create({
        data: {
          workflowId: absenceWorkflow.id,
          requestType: 'ABSENCE',
          entityType: 'ABSENCE_EXCUSE',
          entityId: absenceExcuseJacob.id,
          summary: 'Absence Leave: Jacob Onoja - Family engagement',
          status: 'PENDING',
          currentStepOrder: 1,
          requestedByUserId: testJacobUser.id,
          requestedByMemberId: testJacobMember.id,
        },
      });
    });

    it('Scenario 9: Disciplinary Committee member sees Member 1 pending request in their approval queue', async () => {
      const pendingList = await approvalsService.pendingFor(testCommitteeUser.id);
      const req = pendingList.find((r) => r.id === approvalRequest1.id);
      expect(req).toBeDefined();
      expect(req!.summary).toContain('Chinedu Eze');
    });

    it('Scenario 10: Disciplinary Committee member successfully approves Member 1 request', async () => {
      const result = await approvalsService.act(
        approvalRequest1.id,
        testCommitteeUser.id,
        ApprovalDecision.APPROVED,
        'Approved by Disciplinary Committee'
      );

      expect(result.status).toBe('APPROVED');

      // Verify the approval action was persisted
      const actions = await prisma.approvalAction.findMany({
        where: { requestId: approvalRequest1.id },
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].decision).toBe(ApprovalDecision.APPROVED);
      expect(actions[0].actorUserId).toBe(testCommitteeUser.id);
      expect(actions[0].comment).toBe('Approved by Disciplinary Committee');
    });

    it('Scenario 11: Attempting duplicate approval on an already decided request throws ConflictException', async () => {
      await expect(
        approvalsService.act(
          approvalRequest1.id,
          testCommitteeUser.id,
          ApprovalDecision.APPROVED,
          'Second approval'
        )
      ).rejects.toThrow(ConflictException);
    });

    it('Scenario 12: Ordinary member cannot approve any requests (403 Forbidden)', async () => {
      // Create a fresh pending request
      const freshExcuse = await prisma.absenceExcuse.create({
        data: {
          memberId: testMember2.id,
          reason: 'Work obligation',
          category: 'WORK',
          status: 'PENDING',
        },
      });

      const freshReq = await prisma.approvalRequest.create({
        data: {
          workflowId: absenceWorkflow.id,
          requestType: 'ABSENCE',
          entityType: 'ABSENCE_EXCUSE',
          entityId: freshExcuse.id,
          summary: 'Absence Leave: Amina Bello',
          status: 'PENDING',
          currentStepOrder: 1,
          requestedByMemberId: testMember2.id,
        },
      });

      await expect(
        approvalsService.act(
          freshReq.id,
          testOrdinaryUser.id,
          ApprovalDecision.APPROVED,
          'Unauthorized'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('Scenario 13: Committee member cannot approve their own absence request (Self-Approval Forbidden)', async () => {
      const committeeExcuse = await prisma.absenceExcuse.create({
        data: {
          memberId: testMember1.id,
          reason: 'Personal leave',
          category: 'PERSONAL',
          status: 'PENDING',
        },
      });

      const committeeReq = await prisma.approvalRequest.create({
        data: {
          workflowId: absenceWorkflow.id,
          requestType: 'ABSENCE',
          entityType: 'ABSENCE_EXCUSE',
          entityId: committeeExcuse.id,
          summary: 'Absence Leave: Committee user self request',
          status: 'PENDING',
          currentStepOrder: 1,
          requestedByUserId: testCommitteeUser.id,
        },
      });

      await expect(
        approvalsService.act(
          committeeReq.id,
          testCommitteeUser.id,
          ApprovalDecision.APPROVED,
          'Self approving'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('Scenario 14: Jacob Onoja request CANNOT be approved by Disciplinary Committee member (Restricted to Daniel)', async () => {
      await expect(
        approvalsService.act(
          approvalRequestJacob.id,
          testCommitteeUser.id,
          ApprovalDecision.APPROVED,
          'Committee trying to approve Jacob'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('Scenario 15: Daniel Oguamanam CAN successfully approve Jacob Onoja request', async () => {
      const result = await approvalsService.act(
        approvalRequestJacob.id,
        testDanielUser.id,
        ApprovalDecision.APPROVED,
        'Daniel approved Jacob'
      );
      expect(result.status).toBe('APPROVED');
    });

    it('Scenario 16: Disciplinary Committee member rejects a request with reason -> reason recorded', async () => {
      const rejectExcuse = await prisma.absenceExcuse.create({
        data: {
          memberId: testMember2.id,
          reason: 'Overslept',
          category: 'PERSONAL',
          status: 'PENDING',
        },
      });

      const rejectReq = await prisma.approvalRequest.create({
        data: {
          workflowId: absenceWorkflow.id,
          requestType: 'ABSENCE',
          entityType: 'ABSENCE_EXCUSE',
          entityId: rejectExcuse.id,
          summary: 'Absence Leave: Amina Bello - Overslept',
          status: 'PENDING',
          currentStepOrder: 1,
          requestedByMemberId: testMember2.id,
        },
      });

      // Rejecting without reason is rejected
      await expect(
        approvalsService.act(
          rejectReq.id,
          testCommitteeUser.id,
          ApprovalDecision.REJECTED,
          ''
        )
      ).rejects.toThrow(BadRequestException);

      // Rejecting with valid reason succeeds
      const result = await approvalsService.act(
        rejectReq.id,
        testCommitteeUser.id,
        ApprovalDecision.REJECTED,
        'Oversleeping is not an approved ground for service exemption under Section 4.2.'
      );
      expect(result.status).toBe('REJECTED');

      const action = await prisma.approvalAction.findFirst({
        where: { requestId: rejectReq.id, decision: ApprovalDecision.REJECTED },
      });
      expect(action!.comment).toContain('Oversleeping is not an approved ground');
    });
  });

  // ==========================================================================
  // REGRESSION TESTS
  // ==========================================================================

  describe('Regression: Dues & Standard Finance Workflows', () => {
    it('Scenario 17: Monthly membership dues payment & verification works without regression', async () => {
      const monthlyPayment = await paymentsService.declare(testMember1.id, testOrdinaryUser.id, {
        purpose: 'MONTHLY_DUES',
        amount: 2500,
        method: 'BANK_TRANSFER',
        duesAssignmentId: monthlyAssignment1.id,
        payerReference: 'Monthly Dues Nov 2026',
      });

      expect(monthlyPayment.status).toBe('PENDING');

      const confirmed = await paymentsService.confirm(monthlyPayment.id, testAdminUser.id, {
        confirmedAmount: 2500,
      });

      expect(confirmed.status).toBe('CONFIRMED');

      const updatedAssignment = await prisma.memberDuesAssignment.findUnique({
        where: { id: monthlyAssignment1.id },
      });
      expect(updatedAssignment!.status).toBe(DuesAssignmentStatus.PAID);
      expect(updatedAssignment!.amountDue - updatedAssignment!.amountPaid).toBe(0);
    });
  });

  afterAll(async () => {
    // Clean up all test records created in this suite
    try {
      const memberIds = [testMember1?.id, testMember2?.id].filter(Boolean);
      if (memberIds.length > 0) {
        await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
        await prisma.memberDuesAssignment.deleteMany({ where: { memberId: { in: memberIds } } });
        await prisma.memberNotification.deleteMany({ where: { memberId: { in: memberIds } } });
        await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
      }

      const periodIds = [christmasPeriod?.id, monthlyPeriod?.id].filter(Boolean);
      if (periodIds.length > 0) {
        await prisma.memberDuesAssignment.deleteMany({ where: { periodId: { in: periodIds } } });
        await prisma.duesPeriod.deleteMany({ where: { id: { in: periodIds } } });
      }

      const userIds = [testOrdinaryUser?.id, testCommitteeUser?.id, testAdminUser?.id].filter(Boolean);
      if (userIds.length > 0) {
        const requests = await prisma.approvalRequest.findMany({ where: { requestedByUserId: { in: userIds } } });
        const requestIds = requests.map(r => r.id);
        if (requestIds.length > 0) {
          await prisma.approvalAction.deleteMany({ where: { requestId: { in: requestIds } } });
          await prisma.approvalRequest.deleteMany({ where: { id: { in: requestIds } } });
        }
        await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
        await prisma.userAccessRole.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch (e) {
      console.warn('afterAll cleanup error (non-fatal):', e);
    }
  });
});
