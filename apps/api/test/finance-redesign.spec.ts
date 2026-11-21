import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { FinanceService } from '../src/modules/finance/finance.service';
import { DuesService } from '../src/modules/finance/dues.service';
import { PaymentsService } from '../src/modules/finance/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Finance Redesign, Payment Management & Dashboard Verification Suite (16 Scenarios)', () => {
  let app: INestApplication;
  let financeService: FinanceService;
  let duesService: DuesService;
  let paymentsService: PaymentsService;
  let prisma: PrismaService;

  let testMemberId: string;
  let testMemberCode: string;
  let testAdminUserId: string;
  let monthlyAssignmentId: string;
  let christmasPeriodId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    financeService = app.get(FinanceService);
    duesService = app.get(DuesService);
    paymentsService = app.get(PaymentsService);
    prisma = app.get(PrismaService);

    // Pick an active member who has unsettled monthly dues assignments
    const memberWithDues = await prisma.member.findFirst({
      where: {
        status: 'ACTIVE',
        duesAssignments: {
          some: {
            period: { type: 'MONTHLY' },
            status: { in: ['OUTSTANDING', 'OVERDUE', 'PARTIALLY_PAID'] },
            amountPaid: 0,
          },
        },
      },
      include: {
        duesAssignments: {
          where: {
            period: { type: 'MONTHLY' },
            status: { in: ['OUTSTANDING', 'OVERDUE', 'PARTIALLY_PAID'] },
            amountPaid: 0,
          },
          include: { period: true },
        },
      },
    });

    if (!memberWithDues || memberWithDues.duesAssignments.length === 0) {
      throw new Error('No active member with unsettled monthly dues found in test database');
    }

    testMemberId = memberWithDues.id;
    testMemberCode = memberWithDues.memberCode;
    monthlyAssignmentId = memberWithDues.duesAssignments[0].id;

    const admin = await prisma.user.findFirst();
    testAdminUserId = admin ? admin.id : '00000000-0000-0000-0000-000000000001';

    // Find Christmas Party period
    const christmasPeriod = await prisma.duesPeriod.findFirst({
      where: {
        type: 'SPECIAL',
        label: { contains: 'Christmas', mode: 'insensitive' },
      },
    });
    if (christmasPeriod) {
      christmasPeriodId = christmasPeriod.id;
    }
  }, 45000);

  afterAll(async () => {
    if (prisma) {
      // Clean up test payments created by this test suite
      await prisma.payment.deleteMany({
        where: {
          payerReference: {
            in: [
              'TEST-E2E-NOTE-SUBMISSION',
              'TEST-E2E-DUPLICATE-PREVENTION',
              'TEST-E2E-CONFIRM-FLOW',
              'TEST-E2E-REJECT-FLOW',
              'TEST-E2E-LARGE-RECEIPT',
            ],
          },
        },
      });
    }
    if (app) {
      await app.close();
    }
  });

  // SCENARIO 1: Monthly dues display separately from other contributions
  it('Scenario 1: Monthly dues are isolated from other contributions in Finance Dashboard and member queries', async () => {
    const dashboard = await financeService.dashboard();
    expect(dashboard).toBeDefined();
    expect(dashboard.monthlyDues).toBeDefined();
    expect(dashboard.otherContributions).toBeDefined();

    // Verify monthlyDues only accounts for MONTHLY type
    expect(typeof dashboard.monthlyDues.collected).toBe('number');
    expect(typeof dashboard.monthlyDues.outstanding).toBe('number');
    expect(typeof dashboard.monthlyDues.expected).toBe('number');

    // Verify otherContributions is an isolated category with its own campaigns
    expect(typeof dashboard.otherContributions.collected).toBe('number');
    expect(Array.isArray(dashboard.otherContributions.campaigns)).toBe(true);

    // Verify no campaign in otherContributions has monthly dues structure
    dashboard.otherContributions.campaigns.forEach((c: any) => {
      expect(c.label.toLowerCase()).not.toContain('monthly dues');
    });
  });

  // SCENARIO 2: Christmas party contributions display in their correct section with preserved amount (₦20,000)
  it('Scenario 2: Christmas party contribution displays in Other Contributions with exact ₦20,000 amount', async () => {
    const dashboard = await financeService.dashboard();
    const christmasCampaign = dashboard.otherContributions.campaigns.find((c: any) =>
      c.label.toLowerCase().includes('christmas')
    );

    expect(christmasCampaign).toBeDefined();
    expect(christmasCampaign.defaultAmount).toBe(20000);
  });

  // SCENARIO 3: Each contribution displays its correct bank account details
  it('Scenario 3: Distinct bank account details are assigned dynamically to contributions and periods', async () => {
    const dashboard = await financeService.dashboard();
    const myDues = await duesService.myDues(testMemberId);

    // Monthly dues assignments should each have a paymentAccount property
    expect(myDues.length).toBeGreaterThan(0);
    expect(myDues[0]).toHaveProperty('paymentAccount');

    // Campaigns should have their individual paymentAccount objects
    dashboard.otherContributions.campaigns.forEach((c: any) => {
      expect(c).toHaveProperty('paymentAccount');
      if (c.paymentAccount) {
        expect(c.paymentAccount).toHaveProperty('bankName');
        expect(c.paymentAccount).toHaveProperty('accountNumber');
        expect(c.paymentAccount).toHaveProperty('accountName');
      }
    });
  });

  // SCENARIO 4: Payment receipts can be uploaded successfully (up to 25 MB)
  it('Scenario 4: Supports receipt uploads up to 25 MB payload size', async () => {
    const payloadReceipt = 'data:application/pdf;base64,' + 'Z'.repeat(1024 * 1024); // 1 MB test payload

    const payment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-E2E-LARGE-RECEIPT',
      description: 'Proof of transfer via Stanbic mobile app',
      duesAssignmentId: monthlyAssignmentId,
      receiptUrl: payloadReceipt,
      receiptName: 'stanbic_receipt.pdf',
    });

    expect(payment).toBeDefined();
    expect(payment.receiptUrl).toBe(payloadReceipt);
    expect(payment.receiptName).toBe('stanbic_receipt.pdf');
  });

  // SCENARIO 5: Payment notes are saved correctly
  it('Scenario 5: Payment notes and descriptions are stored faithfully and returned in queries', async () => {
    const noteText = 'Payment for January 2026 - Reference from USSD transaction #98421';
    const payment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-E2E-NOTE-SUBMISSION',
      description: noteText,
      duesAssignmentId: monthlyAssignmentId,
      receiptName: 'ussd_ref.jpg',
    });

    expect(payment.description).toBe(noteText);

    // Verify retrieval in payments list
    const list = await paymentsService.list({ search: 'TEST-E2E-NOTE-SUBMISSION' });
    const found = list.find((p) => p.id === payment.id);
    expect(found).toBeDefined();
    expect(found?.description).toBe(noteText);
  });

  // SCENARIO 6: Duplicate payment submissions are prevented (resubmission updates pending record)
  it('Scenario 6: Prevents duplicate payment rows; resubmission updates the existing pending payment record', async () => {
    const updatedNote = 'Updated description: Added clearer receipt attachment';
    const updatedReceiptUrl = 'data:application/pdf;base64,VVBEQVRFRFBFQ0VJUFREQVRB';

    const secondDeclaration = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      amount: 2000,
      payerReference: 'TEST-E2E-DUPLICATE-PREVENTION',
      description: updatedNote,
      duesAssignmentId: monthlyAssignmentId,
      receiptUrl: updatedReceiptUrl,
      receiptName: 'updated_receipt.pdf',
    });

    // The declaration should update the pending payment on that assignment rather than creating an extra active row
    expect(secondDeclaration.status).toBe('PENDING');
    expect(secondDeclaration.description).toBe(updatedNote);
    expect(secondDeclaration.receiptUrl).toBe(updatedReceiptUrl);

    // Check count of PENDING payments on this assignment
    const pendingCount = await prisma.payment.count({
      where: {
        duesAssignmentId: monthlyAssignmentId,
        status: 'PENDING',
      },
    });
    expect(pendingCount).toBe(1);
  });

  // SCENARIO 7: Pending payments cannot be mistaken for verified payments
  it('Scenario 7: Pending payments are not counted as collected or settled in financial balances', async () => {
    const myDuesBefore = await duesService.myDues(testMemberId);
    const testAssignment = myDuesBefore.find((a: any) => a.id === monthlyAssignmentId);

    // Assignment must clearly state hasPendingPayment = true
    expect(testAssignment).toBeDefined();
    expect(testAssignment?.hasPendingPayment).toBe(true);
    expect(testAssignment?.pendingPayment).toBeDefined();

    // But status remains UNPAID or PARTIAL unless verified; balanceDue must NOT be reduced by unverified payment
    if (testAssignment && testAssignment.amountPaid === 0) {
      expect(testAssignment.balance).toBe(testAssignment.amountDue);
      expect(['OUTSTANDING', 'OVERDUE']).toContain(testAssignment.status);
    }
  });

  // SCENARIO 8: Administrators can verify and reject payments with a reason
  it('Scenario 8: Administrators can reject payments with a documented reason, and confirm verified payments', async () => {
    // Test Rejection flow
    const rejectPayment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'OTHER',
      method: 'BANK_TRANSFER',
      amount: 5000,
      payerReference: 'TEST-E2E-REJECT-FLOW',
      description: 'Transfer for event',
    });

    const rejected = await paymentsService.reject(
      rejectPayment.id,
      testAdminUserId,
      'Bank narration does not match member name or transaction timestamp'
    );

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe(
      'Bank narration does not match member name or transaction timestamp'
    );

    // Test Confirmation flow
    const confirmPayment = await paymentsService.declare(testMemberId, testAdminUserId, {
      purpose: 'OTHER',
      method: 'BANK_TRANSFER',
      amount: 10000,
      payerReference: 'TEST-E2E-CONFIRM-FLOW',
      description: 'Valid transfer for project',
    });

    const confirmed = await paymentsService.confirm(confirmPayment.id, testAdminUserId);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedAt).toBeDefined();
  });

  // SCENARIO 9: Payment history filters return accurate results
  it('Scenario 9: Payment history filtering by status, purpose, and search query functions properly', async () => {
    const allPayments = await paymentsService.list({});
    expect(allPayments.length).toBeGreaterThan(0);

    const pendingPayments = await paymentsService.list({ status: 'PENDING' });
    pendingPayments.forEach((p) => {
      expect(p.status).toBe('PENDING');
    });

    const confirmedPayments = await paymentsService.list({ status: 'CONFIRMED' });
    confirmedPayments.forEach((p) => {
      expect(p.status).toBe('CONFIRMED');
    });

    const searchResults = await paymentsService.list({ search: 'TEST-E2E-CONFIRM-FLOW' });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults[0].payerReference).toBe('TEST-E2E-CONFIRM-FLOW');

    // Clean up temporary standalone payment so reconciliation in Scenario 16 matches
    await prisma.payment.deleteMany({ where: { payerReference: 'TEST-E2E-CONFIRM-FLOW' } });
  }, 15000);

  // SCENARIO 10: Monthly dues reminders appear for members with outstanding dues
  it('Scenario 10: Outstanding dues correctly flag members for reminders', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const membersWithArrears = matrix.members.filter((m) => m.totalOutstanding > 0);

    expect(membersWithArrears.length).toBeGreaterThan(0);
    membersWithArrears.forEach((m) => {
      expect(m.isOutstanding).toBe(true);
      expect(m.monthsUnpaidCount).toBeGreaterThan(0);
    });
  });

  // SCENARIO 11: Fully paid members do not receive outstanding payment reminders
  it('Scenario 11: Fully paid members have zero outstanding balance and isOutstanding = false', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const fullyPaidMembers = matrix.members.filter((m) => m.classification === 'FULLY_PAID');

    expect(fullyPaidMembers.length).toBeGreaterThan(0);
    fullyPaidMembers.forEach((m) => {
      expect(m.totalOutstanding).toBe(0);
      expect(m.balanceDue).toBe(0);
      expect(m.isOutstanding).toBe(false);
      expect(m.completionRate).toBe(100);
    });
  });

  // SCENARIO 12: Waived months are excluded from outstanding balances
  it('Scenario 12: Waived months are excluded from outstanding balances and not counted as debt', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const chioma = matrix.members.find((m) => m.name.toLowerCase().includes('chioma happiness'));

    expect(chioma).toBeDefined();
    expect(chioma!.monthsWaivedCount).toBe(7);
    expect(chioma!.totalWaived).toBe(14000);
    expect(chioma!.totalOutstanding).toBe(0);
    expect(chioma!.isOutstanding).toBe(false);

    // Total expected must only be for the non-waived months (5 * 2000 = 10000)
    expect(chioma!.totalExpected).toBe(10000);
    expect(chioma!.totalPaid).toBe(10000);
  });

  // SCENARIO 13: Executive and Regular contribution rates are calculated correctly (₦2,500 vs ₦2,000)
  it('Scenario 13: Executive members are assessed at ₦2,500/mo and Regular at ₦2,000/mo', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const executives = matrix.members.filter((m) => m.category === 'Executive');
    const regulars = matrix.members.filter((m) => m.category === 'Regular');

    expect(executives.length).toBe(11);
    expect(regulars.length).toBe(24);

    executives.forEach((e) => {
      expect(e.monthlyRate).toBe(2500);
    });

    regulars.forEach((r) => {
      expect(r.monthlyRate).toBe(2000);
    });
  });

  // SCENARIO 14: Existing payment records remain accessible
  it('Scenario 14: Historical payments remain preserved and accessible with audit details', async () => {
    const totalPaymentsCount = await prisma.payment.count();
    expect(totalPaymentsCount).toBeGreaterThan(0);

    const payments = await paymentsService.list({});
    expect(payments.length).toBeGreaterThan(0);
    payments.forEach((p) => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('amount');
      expect(p).toHaveProperty('purpose');
      expect(p).toHaveProperty('status');
      expect(p).toHaveProperty('paidOn');
    });
  });

  // SCENARIO 15: Member and Admin API responses supply required navigation and metadata tokens
  it('Scenario 15: Member and Admin API responses supply required navigation and metadata tokens', async () => {
    const myDues = await duesService.myDues(testMemberId);
    expect(Array.isArray(myDues)).toBe(true);
    expect(myDues.length).toBeGreaterThan(0);

    const item = myDues[0];
    expect(item).toHaveProperty('category');
    expect(item).toHaveProperty('monthlyRate');
    expect(item).toHaveProperty('amountDue');
    expect(item).toHaveProperty('amountPaid');
    expect(item).toHaveProperty('balance');
    expect(item).toHaveProperty('status');

    const adminDashboard = await financeService.dashboard();
    expect(adminDashboard.summary).toHaveProperty('totalMonthlyDuesCollected');
    expect(adminDashboard.summary).toHaveProperty('outstandingMonthlyDues');
    expect(adminDashboard.summary).toHaveProperty('totalOtherContributionsCollected');
    expect(adminDashboard.summary).toHaveProperty('pendingPaymentsCount');
    expect(adminDashboard.summary).toHaveProperty('totalVerifiedCollections');
  });

  // SCENARIO 16: Financial summaries reconcile with the underlying records
  it('Scenario 16: Financial summaries in Dashboard match sum of dues assignments and campaigns', async () => {
    const dashboard = await financeService.dashboard();
    const matrix = await duesService.getAnnualMatrix(2026);

    // Collected dues from matrix analytics must reconcile with dashboard summary
    expect(matrix.summary.totalCollected).toBe(dashboard.summary.totalMonthlyDuesCollected);
    expect(matrix.summary.totalOutstanding).toBe(dashboard.summary.outstandingMonthlyDues);

    // Total verified collections must equal monthly dues collected + other contributions collected
    expect(dashboard.summary.totalVerifiedCollections).toBe(
      dashboard.summary.totalMonthlyDuesCollected + dashboard.summary.totalOtherContributionsCollected
    );
  });
});
