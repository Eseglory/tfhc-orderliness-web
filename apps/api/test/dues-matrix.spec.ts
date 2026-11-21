import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DuesService } from '../src/modules/finance/dues.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Dues Matrix & Comprehensive Financial Analytics (Isolated Test DB)', () => {
  let app: INestApplication;
  let duesService: DuesService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    duesService = app.get(DuesService);
    prisma = app.get(PrismaService);
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accurately parses 35-member roster with correct membership categories and rates', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    expect(matrix).toBeDefined();
    expect(matrix.members).toBeDefined();

    // Verify 35 distinct members from the authoritative source of truth list
    expect(matrix.members.length).toBe(35);

    // Verify exactly 11 Executive members and 24 Regular members
    const execMembers = matrix.members.filter((m) => m.category === 'Executive');
    const regularMembers = matrix.members.filter((m) => m.category === 'Regular');

    expect(execMembers.length).toBe(11);
    expect(regularMembers.length).toBe(24);

    // Verify rates
    execMembers.forEach((m) => {
      expect(m.monthlyRate).toBe(2500);
    });
    regularMembers.forEach((m) => {
      expect(m.monthlyRate).toBe(2000);
    });
  });

  it('correctly calculates Chioma Happiness Nwankwo with 7 waived months and 5 paid months', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const chioma = matrix.members.find((m) =>
      m.name.toLowerCase().includes('chioma happiness')
    );

    expect(chioma).toBeDefined();
    expect(chioma!.category).toBe('Regular');
    expect(chioma!.monthlyRate).toBe(2000);

    // 7 months waived (Jan-Jul)
    expect(chioma!.monthsWaivedCount).toBe(7);
    // 5 months paid (Aug-Dec)
    expect(chioma!.monthsPaidCount).toBe(5);
    expect(chioma!.monthsUnpaidCount).toBe(0);

    // Expected should only include the 5 actionable months (5 * 2000 = 10000)
    expect(chioma!.totalExpected).toBe(10000);
    expect(chioma!.totalPaid).toBe(10000);
    expect(chioma!.balanceDue).toBe(0);
    expect(chioma!.totalOutstanding).toBe(0);
    expect(chioma!.totalWaived).toBe(14000);
    expect(chioma!.completionRate).toBe(100);
    expect(chioma!.classification).toBe('FULLY_PAID');
    expect(chioma!.isOutstanding).toBe(false);

    // Verify individual month statuses
    for (let m = 1; m <= 7; m++) {
      const cell = chioma!.months.find((c) => c.month === m);
      expect(cell).toBeDefined();
      expect(['WAIVED', 'EXEMPT']).toContain(cell!.status);
      expect(cell!.amountPaid).toBe(0);
      expect(cell!.balance).toBe(0);
    }
    for (let m = 8; m <= 12; m++) {
      const cell = chioma!.months.find((c) => c.month === m);
      expect(cell).toBeDefined();
      expect(cell!.status).toBe('PAID');
      expect(cell!.amountPaid).toBe(2000);
      expect(cell!.balance).toBe(0);
    }
  });

  it('correctly calculates Martha John-Williams as Executive with Dec in arrears', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const martha = matrix.members.find((m) =>
      m.name.toLowerCase().includes('martha john')
    );

    expect(martha).toBeDefined();
    expect(martha!.category).toBe('Executive');
    expect(martha!.monthlyRate).toBe(2500);

    // Jan-Nov paid @ 2500 = 27500, Dec unpaid
    expect(martha!.monthsPaidCount).toBe(11);
    expect(martha!.monthsUnpaidCount).toBe(1);
    expect(martha!.monthsWaivedCount).toBe(0);

    expect(martha!.totalExpected).toBe(30000);
    expect(martha!.totalPaid).toBe(27500);
    expect(martha!.balanceDue).toBe(2500);
    expect(martha!.totalOutstanding).toBe(2500);
    expect(martha!.totalWaived).toBe(0);
    expect(martha!.completionRate).toBe(92);
    expect(martha!.classification).toBe('PARTIALLY_PAID');
    expect(martha!.isOutstanding).toBe(true);

    const decCell = martha!.months.find((c) => c.month === 12);
    expect(decCell).toBeDefined();
    expect(['OVERDUE', 'OUTSTANDING']).toContain(decCell!.status);
    expect(decCell!.balance).toBe(2500);
    expect(decCell!.amountPaid).toBe(0);
  });

  it('reconciles financial summary with individual member records without discrepancy', async () => {
    const matrix = await duesService.getAnnualMatrix(2026);
    const { summary, members } = matrix;

    // Total counts
    expect(summary.totalMembers).toBe(members.length);
    expect(summary.totalExecutiveMembers).toBe(11);
    expect(summary.totalRegularMembers).toBe(24);

    // Summing across all members
    const computedExpected = members.reduce((sum, m) => sum + m.totalExpected, 0);
    const computedCollected = members.reduce((sum, m) => sum + m.totalPaid, 0);
    const computedOutstanding = members.reduce((sum, m) => sum + m.balanceDue, 0);
    const computedWaived = members.reduce((sum, m) => sum + m.totalWaived, 0);

    expect(summary.totalExpected).toBe(computedExpected);
    expect(summary.totalCollected).toBe(computedCollected);
    expect(summary.totalOutstanding).toBe(computedOutstanding);
    expect(summary.totalWaived).toBe(computedWaived);

    // Fundamental accounting reconciliation equation:
    // Total Expected = Total Collected + Total Outstanding
    expect(summary.totalExpected).toBe(summary.totalCollected + summary.totalOutstanding);

    // Classification counts must sum exactly to total members
    const classificationSum =
      summary.fullyPaidMembersCount +
      summary.partiallyPaidMembersCount +
      summary.neverPaidMembersCount +
      summary.waivedMembersCount;
    expect(classificationSum).toBe(members.length);

    // Executive performance reconciliation
    expect(summary.executivePerformance).toBeDefined();
    expect(summary.executivePerformance.count).toBe(11);
    expect(summary.executivePerformance.expected).toBe(
      summary.executivePerformance.collected + summary.executivePerformance.outstanding
    );

    // Regular performance reconciliation
    expect(summary.regularPerformance).toBeDefined();
    expect(summary.regularPerformance.count).toBe(24);
    expect(summary.regularPerformance.expected).toBe(
      summary.regularPerformance.collected + summary.regularPerformance.outstanding
    );

    // 12-Month breakdown has all 12 months populated
    expect(summary.monthlyBreakdown).toBeDefined();
    expect(summary.monthlyBreakdown.length).toBe(12);

    // Monthly breakdown sums match totals
    const sumMonthlyCollected = summary.monthlyBreakdown.reduce((sum, mb) => sum + mb.collected, 0);
    expect(sumMonthlyCollected).toBe(summary.totalCollected);
  });
});
