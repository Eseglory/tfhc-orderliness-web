import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/modules/finance/payments.service';
import { DuesService } from '../src/modules/finance/dues.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, DuesPeriodType, DuesPeriodStatus, DuesAssignmentStatus, PaymentPurpose, FinancePaymentMethod, PaymentStatus } from '@prisma/client';

describe('Payment Review, Amount Correction, Approval & Outstanding Balance Management E2E Test Suite', () => {
  let app: INestApplication;
  let paymentsService: PaymentsService;
  let duesService: DuesService;
  let prisma: PrismaService;

  let testAdminUser: any;
  let testMember: any;
  let campaignPeriod: any;
  let assignment: any;

  const validReceiptUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 Valid Bank Transfer Receipt Confirmation').toString('base64')}`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    paymentsService = app.get(PaymentsService);
    duesService = app.get(DuesService);
    prisma = app.get(PrismaService);

    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toContain('127.0.0.1:55498/tfhc_e2e');

    const timestamp = Date.now();

    // 1. Seed Admin User
    testAdminUser = await prisma.user.create({
      data: {
        email: `admin_fin_${timestamp}@orderliness.test`,
        passwordHash: 'dummy-hashed-pwd',
        role: Role.ADMIN,
      },
    });

    // 2. Seed Test Member
    testMember = await prisma.member.create({
      data: {
        firstName: 'Chukwudi',
        lastName: 'Eze',
        phoneNumber: '+2348011111111',
        memberCode: `TFHC-M-${timestamp.toString().slice(-6)}`,
        status: 'ACTIVE',
        user: {
          create: {
            email: `chukwudi_${timestamp}@orderliness.test`,
            passwordHash: 'dummy-hashed-pwd',
            role: Role.MEMBER,
          },
        },
      },
      include: { user: true },
    });

    // 3. Seed Special Contribution Campaign Period (Amount Payable: ₦20,000)
    campaignPeriod = await prisma.duesPeriod.create({
      data: {
        label: `Christmas Party Contribution ${timestamp}`,
        type: DuesPeriodType.SPECIAL,
        year: 2026,
        month: 12,
        defaultAmount: 20000,
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: DuesPeriodStatus.OPEN,
      },
    });

    // 4. Seed Member Obligation / Assignment (Payable: ₦20,000)
    assignment = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember.id,
        periodId: campaignPeriod.id,
        amountDue: 20000,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = [testAdminUser?.id, testMember?.userId].filter(Boolean);
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entity: 'Payment' },
            { actorUserId: { in: userIds } },
          ],
        },
      });
      if (assignment) {
        await prisma.memberNotification.deleteMany({
          where: { memberId: testMember?.id },
        });
        await prisma.payment.deleteMany({
          where: { duesAssignmentId: assignment.id },
        });
        await prisma.memberDuesAssignment.deleteMany({
          where: { id: assignment.id },
        });
      }
      if (campaignPeriod) {
        await prisma.duesPeriod.deleteMany({
          where: { id: campaignPeriod.id },
        });
      }
      if (testMember) {
        await prisma.member.deleteMany({
          where: { id: testMember.id },
        });
        if (testMember.userId) {
          await prisma.user.deleteMany({
            where: { id: testMember.userId },
          });
        }
      }
      if (testAdminUser) {
        await prisma.user.deleteMany({
          where: { id: testAdminUser.id },
        });
      }
    }
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // TEST 5 & 6: Pending & Rejected Payments do NOT affect balance
  // -------------------------------------------------------------------------
  it('Test 5 – Pending payment: Payable: 20k, Submitted pending: 10k -> Approved paid: 0, Outstanding: ₦20,000', async () => {
    // Member submits a payment claim of ₦10,000
    const pendingPmt = await paymentsService.declare(testMember.id, testMember.user.id, {
      purpose: PaymentPurpose.SPECIAL_CONTRIBUTION,
      duesAssignmentId: assignment.id,
      amount: 10000,
      method: FinancePaymentMethod.BANK_TRANSFER,
      paidOn: new Date().toISOString(),
      receiptUrl: validReceiptUrl,
    });

    expect(pendingPmt.status).toBe(PaymentStatus.PENDING);
    expect(pendingPmt.amount).toBe(10000);

    // Verify obligation balance is strictly unchanged
    const asgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(asgn.amountDue).toBe(20000);
    expect(asgn.amountPaid).toBe(0);
    expect(asgn.status).toBe(DuesAssignmentStatus.OUTSTANDING);
    const outstanding = asgn.amountDue - asgn.amountPaid;
    expect(outstanding).toBe(20000);
  });

  it('Test 6 – Rejected payment: Payable: 20k, Submitted rejected: 10k with reason -> Approved paid: 0, Outstanding: ₦20,000', async () => {
    // Find the pending payment from Test 5
    const pending = await prisma.payment.findFirstOrThrow({
      where: { duesAssignmentId: assignment.id, status: PaymentStatus.PENDING },
    });

    // Admin rejects the submission with a clear reason
    const rejectedPmt = await paymentsService.reject(pending.id, testAdminUser.id, 'Invalid transfer receipt provided');
    expect(rejectedPmt.status).toBe(PaymentStatus.REJECTED);
    expect(rejectedPmt.rejectionReason).toBe('Invalid transfer receipt provided');

    // Verify obligation balance remains completely unaffected
    const asgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(asgn.amountDue).toBe(20000);
    expect(asgn.amountPaid).toBe(0);
    expect(asgn.status).toBe(DuesAssignmentStatus.OUTSTANDING);
    const outstanding = asgn.amountDue - asgn.amountPaid;
    expect(outstanding).toBe(20000);
  });

  // -------------------------------------------------------------------------
  // TEST 2 & 8: Incorrect amount declared & Administrative Audit
  // -------------------------------------------------------------------------
  it('Test 2 – Incorrect amount declared: Payable: 20k, Declared: 20k, Receipt confirms: 10k -> Admin corrects to 10k with note -> Outstanding: ₦10,000, Partially Paid', async () => {
    // Member declares full ₦20,000
    const declaredPmt = await paymentsService.declare(testMember.id, testMember.user.id, {
      purpose: PaymentPurpose.SPECIAL_CONTRIBUTION,
      duesAssignmentId: assignment.id,
      amount: 20000,
      method: FinancePaymentMethod.BANK_TRANSFER,
      paidOn: new Date().toISOString(),
      receiptUrl: validReceiptUrl,
    });

    expect(declaredPmt.status).toBe(PaymentStatus.PENDING);
    expect(declaredPmt.amount).toBe(20000);

    const adminNote = 'The uploaded receipt confirms a payment of ₦10,000, not ₦20,000 as declared.';

    // Admin corrects to ₦10,000 and approves
    const confirmedPmt = await paymentsService.confirm(declaredPmt.id, testAdminUser.id, {
      confirmedAmount: 10000,
      adminNote,
    });

    expect(confirmedPmt.status).toBe(PaymentStatus.CONFIRMED);
    expect(confirmedPmt.amount).toBe(10000);
    expect(confirmedPmt.isAdjusted).toBe(true);
    expect(confirmedPmt.claimedAmount).toBe(20000);
    expect(confirmedPmt.confirmedAmount).toBe(10000);
    expect(confirmedPmt.adminNote).toBe(adminNote);

    // Verify automatic recalculation of member obligation
    const updatedAsgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(updatedAsgn.amountDue).toBe(20000);
    expect(updatedAsgn.amountPaid).toBe(10000);
    expect(updatedAsgn.status).toBe(DuesAssignmentStatus.PARTIALLY_PAID);
    const outstandingBalance = updatedAsgn.amountDue - updatedAsgn.amountPaid;
    expect(outstandingBalance).toBe(10000);
  });

  it('Test 8 – Administrative audit: Correct and approve -> declared, corrected, admin, note, timestamp retained', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'Payment',
        actorUserId: testAdminUser.id,
        action: 'PAYMENT_CONFIRMED_ADJUSTED',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    const log = auditLogs[0];
    const data = log.newData as Record<string, unknown>;

    expect(data.originalClaimedAmount).toBe(20000);
    expect(data.confirmedAmount).toBe(10000);
    expect(data.isAdjusted).toBe(true);
    expect(data.adminNote).toContain('confirms a payment of ₦10,000, not ₦20,000');
    expect(log.actorUserId).toBe(testAdminUser.id);
  });

  // -------------------------------------------------------------------------
  // TEST 7: Duplicate approval prevention
  // -------------------------------------------------------------------------
  it('Test 7 – Duplicate approval prevention: Attempt to approve same payment twice throws BadRequestException', async () => {
    // Find the confirmed payment from Test 2
    const confirmed = await prisma.payment.findFirstOrThrow({
      where: { duesAssignmentId: assignment.id, status: PaymentStatus.CONFIRMED },
    });

    // Attempt second approval
    await expect(
      paymentsService.confirm(confirmed.id, testAdminUser.id, {
        confirmedAmount: 10000,
        adminNote: 'Attempting duplicate approval',
      }),
    ).rejects.toThrow(BadRequestException);

    // Verify member obligation balance was NOT double credited
    const asgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(asgn.amountPaid).toBe(10000);
    expect(asgn.amountDue - asgn.amountPaid).toBe(10000);
  });

  // -------------------------------------------------------------------------
  // TEST 3: Subsequent payment accumulation
  // -------------------------------------------------------------------------
  it('Test 3 – Subsequent payment: Existing approved: 10k, New approved: 5k, Payable: 20k -> Total paid: 15k, Outstanding: ₦5,000', async () => {
    // Member submits second installment of ₦5,000
    const installment2 = await paymentsService.declare(testMember.id, testMember.user.id, {
      purpose: PaymentPurpose.SPECIAL_CONTRIBUTION,
      duesAssignmentId: assignment.id,
      amount: 5000,
      method: FinancePaymentMethod.BANK_TRANSFER,
      paidOn: new Date().toISOString(),
      receiptUrl: validReceiptUrl,
    });

    // Admin verifies receipt shows ₦5,000 and approves
    const confirmed2 = await paymentsService.confirm(installment2.id, testAdminUser.id, {
      confirmedAmount: 5000,
      adminNote: 'Second installment verified at ₦5,000',
    });

    expect(confirmed2.status).toBe(PaymentStatus.CONFIRMED);
    expect(confirmed2.amount).toBe(5000);

    // Verify total accumulation on obligation
    const asgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(asgn.amountDue).toBe(20000);
    expect(asgn.amountPaid).toBe(15000);
    expect(asgn.status).toBe(DuesAssignmentStatus.PARTIALLY_PAID);
    const remainingBalance = asgn.amountDue - asgn.amountPaid;
    expect(remainingBalance).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // TEST 4: Final outstanding payment
  // -------------------------------------------------------------------------
  it('Test 4 – Final outstanding payment: Existing approved: 15k, New approved: 5k -> Total paid: 20k, Outstanding: ₦0, Fully Paid', async () => {
    // Member submits final installment of ₦5,000
    const installment3 = await paymentsService.declare(testMember.id, testMember.user.id, {
      purpose: PaymentPurpose.SPECIAL_CONTRIBUTION,
      duesAssignmentId: assignment.id,
      amount: 5000,
      method: FinancePaymentMethod.BANK_TRANSFER,
      paidOn: new Date().toISOString(),
      receiptUrl: validReceiptUrl,
    });

    // Admin approves final installment
    const confirmed3 = await paymentsService.confirm(installment3.id, testAdminUser.id, {
      confirmedAmount: 5000,
    });

    expect(confirmed3.status).toBe(PaymentStatus.CONFIRMED);
    expect(confirmed3.amount).toBe(5000);

    // Verify obligation is marked Fully Paid with ₦0 outstanding
    const asgn = await prisma.memberDuesAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(asgn.amountDue).toBe(20000);
    expect(asgn.amountPaid).toBe(20000);
    expect(asgn.status).toBe(DuesAssignmentStatus.PAID);
    const outstanding = asgn.amountDue - asgn.amountPaid;
    expect(outstanding).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TEST 9: Dashboard synchronisation
  // -------------------------------------------------------------------------
  it('Test 9 – Dashboard synchronisation: Member dashboard queries reflect exact approved figures and notes', async () => {
    // Query campaigns as member
    const myCampaigns = await duesService.myCampaigns(testMember.id);
    const campaignItem = myCampaigns.find((c: any) => c.periodId === campaignPeriod.id);

    expect(campaignItem).toBeDefined();
    expect(campaignItem.amountDue).toBe(20000);
    expect(campaignItem.amountPaid).toBe(20000);
    expect(campaignItem.balance).toBe(0);
    expect(campaignItem.status).toBe(DuesAssignmentStatus.PAID);
    expect(campaignItem.confirmedInstallmentsCount).toBe(3);
    expect(campaignItem.canSubmitInstallment).toBe(false);

    // Verify payment history shows adjusted metadata
    const adjustedPayment = campaignItem.payments.find((p: any) => p.isAdjusted);
    expect(adjustedPayment).toBeDefined();
    expect(adjustedPayment.claimedAmount).toBe(20000);
    expect(adjustedPayment.confirmedAmount).toBe(10000);
    expect(adjustedPayment.adminNote).toContain('confirms a payment of ₦10,000, not ₦20,000');

    // Query member payments list
    const myPayments = await paymentsService.myPayments(testMember.id);
    expect(myPayments.length).toBeGreaterThanOrEqual(3);
    const pmtItem = myPayments.find((p: any) => p.id === adjustedPayment.id);
    expect(pmtItem).toBeDefined();
    expect(pmtItem.amountPayable).toBe(20000);
    expect(pmtItem.confirmedAmount).toBe(10000);
    expect(pmtItem.isAdjusted).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 1: Full single payment on clean obligation
  // -------------------------------------------------------------------------
  it('Test 1 – Full payment: Payable: 20k, Declared: 20k, Approved: 20k -> Outstanding: ₦0, Fully Paid', async () => {
    // Create a new separate campaign obligation to test single full payment
    const newPeriod = await prisma.duesPeriod.create({
      data: {
        label: `Test 1 Campaign ${Date.now()}`,
        type: DuesPeriodType.SPECIAL,
        year: 2026,
        month: 12,
        defaultAmount: 20000,
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: DuesPeriodStatus.OPEN,
      },
    });

    const newAsgn = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember.id,
        periodId: newPeriod.id,
        amountDue: 20000,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });

    try {
      // Member declares full ₦20,000
      const declared = await paymentsService.declare(testMember.id, testMember.user.id, {
        purpose: PaymentPurpose.SPECIAL_CONTRIBUTION,
        duesAssignmentId: newAsgn.id,
        amount: 20000,
        method: FinancePaymentMethod.BANK_TRANSFER,
        paidOn: new Date().toISOString(),
        receiptUrl: validReceiptUrl,
      });

      // Admin approves full ₦20,000 without adjustment
      const approved = await paymentsService.confirm(declared.id, testAdminUser.id, {
        confirmedAmount: 20000,
      });

      expect(approved.status).toBe(PaymentStatus.CONFIRMED);
      expect(approved.amount).toBe(20000);
      expect(approved.isAdjusted).toBe(false);

      // Verify obligation is marked Fully Paid with ₦0 outstanding
      const updated = await prisma.memberDuesAssignment.findUniqueOrThrow({
        where: { id: newAsgn.id },
      });
      expect(updated.amountDue).toBe(20000);
      expect(updated.amountPaid).toBe(20000);
      expect(updated.status).toBe(DuesAssignmentStatus.PAID);
      expect(updated.amountDue - updated.amountPaid).toBe(0);
    } finally {
      await prisma.payment.deleteMany({ where: { duesAssignmentId: newAsgn.id } });
      await prisma.memberDuesAssignment.deleteMany({ where: { id: newAsgn.id } });
      await prisma.duesPeriod.deleteMany({ where: { id: newPeriod.id } });
    }
  });

  // -------------------------------------------------------------------------
  // TEST 10: Existing functionality regression test
  // -------------------------------------------------------------------------
  it('Test 10 – Existing functionality regression: Monthly dues payment submission, review, approval & dues list intact', async () => {
    // Create a regular monthly dues period
    const monthly = await prisma.duesPeriod.create({
      data: {
        label: `Regression June ${Date.now()}`,
        type: DuesPeriodType.MONTHLY,
        year: 2026,
        month: 6,
        defaultAmount: 2500,
        dueDate: new Date(Date.now() + 10 * 86400000),
        status: DuesPeriodStatus.OPEN,
      },
    });

    const mAssignment = await prisma.memberDuesAssignment.create({
      data: {
        memberId: testMember.id,
        periodId: monthly.id,
        amountDue: 2500,
        amountPaid: 0,
        status: DuesAssignmentStatus.OUTSTANDING,
      },
    });

    try {
      // Member submits monthly dues
      const submitted = await paymentsService.declare(testMember.id, testMember.user.id, {
        purpose: PaymentPurpose.MONTHLY_DUES,
        duesAssignmentId: mAssignment.id,
        amount: 2500,
        method: FinancePaymentMethod.BANK_TRANSFER,
        paidOn: new Date().toISOString(),
      });

      expect(submitted.status).toBe(PaymentStatus.PENDING);
      expect(submitted.purpose).toBe(PaymentPurpose.MONTHLY_DUES);

      // Verify list endpoint
      const list = await paymentsService.list({ memberId: testMember.id });
      expect(list.length).toBeGreaterThanOrEqual(1);

      // Admin confirms payment
      const confirmed = await paymentsService.confirm(submitted.id, testAdminUser.id);
      expect(confirmed.status).toBe(PaymentStatus.CONFIRMED);
      expect(confirmed.amount).toBe(2500);

      // Verify dues assignment is PAID
      const updated = await prisma.memberDuesAssignment.findUniqueOrThrow({
        where: { id: mAssignment.id },
      });
      expect(updated.amountPaid).toBe(2500);
      expect(updated.status).toBe(DuesAssignmentStatus.PAID);

      // Verify myDues returns updated status
      const dues = await duesService.myDues(testMember.id);
      const myItem = dues.find((d: any) => d.id === mAssignment.id);
      expect(myItem).toBeDefined();
      expect(myItem.status).toBe(DuesAssignmentStatus.PAID);
    } finally {
      await prisma.payment.deleteMany({ where: { duesAssignmentId: mAssignment.id } });
      await prisma.memberDuesAssignment.deleteMany({ where: { id: mAssignment.id } });
      await prisma.duesPeriod.deleteMany({ where: { id: monthly.id } });
    }
  });
});
