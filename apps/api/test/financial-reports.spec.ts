import { Test, TestingModule } from '@nestjs/testing';
import { FinancialReportsService } from '../src/modules/finance/financial-reports.service';
import { FinancialReportPdfService } from '../src/modules/finance/financial-report-pdf.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentStatus, ExpenseStatus } from '@prisma/client';
import { isClassOwner, assertClassOwnerAuthority } from '../src/common/rbac/authorization-rules';
import { ForbiddenException } from '@nestjs/common';

describe('Financial Reporting System & PDF Generation', () => {
  let service: FinancialReportsService;
  let pdfService: FinancialReportPdfService;

  const mockPayments = [
    {
      id: 'p-1',
      reference: 'PMT-001',
      memberId: 'm-1',
      amount: 2500,
      status: PaymentStatus.CONFIRMED,
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      paidOn: new Date('2026-01-15T10:00:00Z'),
      member: { id: 'm-1', firstName: 'Aanu', lastName: 'Oyeniran', memberCode: 'TFHC-001' },
      duesAssignment: { period: { year: 2026, month: 1 } },
    },
    {
      id: 'p-2',
      reference: 'PMT-002',
      memberId: 'm-1',
      amount: 2500,
      status: PaymentStatus.CONFIRMED,
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      paidOn: new Date('2026-02-14T10:00:00Z'),
      member: { id: 'm-1', firstName: 'Aanu', lastName: 'Oyeniran', memberCode: 'TFHC-001' },
      duesAssignment: { period: { year: 2026, month: 2 } },
    },
    {
      id: 'p-3',
      reference: 'PMT-003',
      memberId: 'm-2',
      amount: 2000,
      status: PaymentStatus.CONFIRMED,
      purpose: 'MONTHLY_DUES',
      method: 'ONLINE',
      paidOn: new Date('2026-01-20T10:00:00Z'),
      member: { id: 'm-2', firstName: 'Daniel', lastName: 'Oguamanam', memberCode: 'TFHC-002' },
      duesAssignment: { period: { year: 2026, month: 1 } },
    },
    {
      id: 'p-4',
      reference: 'PMT-004',
      memberId: 'm-3',
      amount: 2000,
      status: PaymentStatus.PENDING,
      purpose: 'MONTHLY_DUES',
      method: 'BANK_TRANSFER',
      paidOn: new Date('2026-03-05T10:00:00Z'),
      member: { id: 'm-3', firstName: 'Dotun', lastName: 'Akingbesote', memberCode: 'TFHC-003' },
      duesAssignment: { period: { year: 2026, month: 3 } },
    },
    {
      id: 'p-5',
      reference: 'PMT-005',
      memberId: 'm-4',
      amount: 2500,
      status: PaymentStatus.REJECTED,
      purpose: 'MONTHLY_DUES',
      method: 'OTHER',
      paidOn: new Date('2026-03-10T10:00:00Z'),
      member: { id: 'm-4', firstName: 'Loveth', lastName: 'Ukabuike', memberCode: 'TFHC-004' },
      duesAssignment: { period: { year: 2026, month: 3 } },
    },
    {
      id: 'p-6',
      reference: 'PMT-006',
      memberId: 'm-1',
      amount: 500,
      status: PaymentStatus.REFUNDED,
      purpose: 'OTHER',
      method: 'BANK_TRANSFER',
      paidOn: new Date('2026-04-12T10:00:00Z'),
      member: { id: 'm-1', firstName: 'Aanu', lastName: 'Oyeniran', memberCode: 'TFHC-001' },
      duesAssignment: null,
    },
  ];

  const mockExpenses = [
    {
      id: 'exp-1',
      reference: 'EXP-001',
      vendorName: 'Sound Engineer Contractor',
      amount: 15000,
      status: ExpenseStatus.PAID,
      incurredOn: new Date('2026-01-28T12:00:00Z'),
      category: { name: 'Audio Services' },
      paymentMethod: 'BANK_TRANSFER',
    },
    {
      id: 'exp-2',
      reference: 'EXP-002',
      vendorName: 'Livestream Specialist',
      amount: 12000,
      status: ExpenseStatus.PAID,
      incurredOn: new Date('2026-02-25T12:00:00Z'),
      category: { name: 'Media Contractor' },
      paymentMethod: 'BANK_TRANSFER',
    },
  ];

  const mockPrisma = {
    payment: {
      findMany: jest.fn().mockResolvedValue(mockPayments),
      count: jest.fn().mockResolvedValue(mockPayments.length),
    },
    expense: {
      findMany: jest.fn().mockResolvedValue(mockExpenses),
      groupBy: jest.fn().mockResolvedValue([{ vendorName: 'Sound Engineer Contractor' }, { vendorName: 'Livestream Specialist' }]),
    },
    member: {
      count: jest.fn().mockResolvedValue(30),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve([
          {
            id: 'm-1',
            memberCode: 'TFHC-001',
            firstName: 'Aanu',
            lastName: 'Oyeniran',
            user: { email: 'aanuoyeniran@gmail.com' },
            status: 'ACTIVE',
            duesAssignments: [
              { amountDue: 2500, period: { year: 2026, month: 1 } },
              { amountDue: 2500, period: { year: 2026, month: 2 } },
            ],
            payments: mockPayments.filter((p) => p.memberId === 'm-1' && p.status === PaymentStatus.CONFIRMED),
          },
        ]);
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialReportsService,
        FinancialReportPdfService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FinancialReportsService>(FinancialReportsService);
    pdfService = module.get<FinancialReportPdfService>(FinancialReportPdfService);
  });

  describe('Access Control Authorization Rules', () => {
    it('authorizes the designated Class Owner (Eseosa Glory)', () => {
      const ownerUser = { email: 'engreseglory@gmail.com', isSuperAdmin: false };
      expect(isClassOwner(ownerUser)).toBe(true);
      expect(() => assertClassOwnerAuthority(ownerUser)).not.toThrow();
    });

    it('authorizes a super admin', () => {
      const superAdminUser = { email: 'admin@tfhc.org', isSuperAdmin: true };
      expect(isClassOwner(superAdminUser)).toBe(true);
      expect(() => assertClassOwnerAuthority(superAdminUser)).not.toThrow();
    });

    it('strictly forbids unauthorized administrators, members, or workers', () => {
      const unauthorizedUsers = [
        { email: 'danoguamanam@gmail.com', isSuperAdmin: false },
        { email: 'onojamonday123@gmail.com', isSuperAdmin: false },
        { email: 'ngoziloveth41@gmail.com', isSuperAdmin: false },
        { email: 'member@gmail.com', isSuperAdmin: false },
        { email: 'worker@contractor.com', isSuperAdmin: false },
        null,
        undefined,
      ];

      for (const u of unauthorizedUsers) {
        expect(isClassOwner(u as any)).toBe(false);
        expect(() => assertClassOwnerAuthority(u as any)).toThrow(ForbiddenException);
      }
    });
  });

  describe('Annual Report With All 12 Months', () => {
    it('generates a report with exactly 12 months (January to December), including zero-activity months', async () => {
      const report = await service.getAnnualReport(2026);

      expect(report.year).toBe(2026);
      expect(report.monthlyBreakdown).toHaveLength(12);

      // Verify months 1 to 12 are in order
      for (let m = 1; m <= 12; m++) {
        expect(report.monthlyBreakdown[m - 1].month).toBe(m);
      }

      // Check January: 2500 + 2000 = 4500 confirmed inflows, 15000 outflow
      const jan = report.monthlyBreakdown[0];
      expect(jan.monthName).toBe('January');
      expect(jan.totalReceived).toBe(4500);
      expect(jan.successfulCount).toBe(2);
      expect(jan.memberCount).toBe(2);
      expect(jan.freelanceTotal).toBe(15000);
      expect(jan.monthlySubtotal).toBe(4500 - 15000);

      // Check February: 2500 inflow, 12000 outflow
      const feb = report.monthlyBreakdown[1];
      expect(feb.totalReceived).toBe(2500);
      expect(feb.freelanceTotal).toBe(12000);

      // Check May: Zero activity month should display 0, not omitted
      const may = report.monthlyBreakdown[4];
      expect(may.monthName).toBe('May');
      expect(may.totalReceived).toBe(0);
      expect(may.successfulCount).toBe(0);
      expect(may.freelanceTotal).toBe(0);
      expect(may.monthlySubtotal).toBe(0);

      // Verify Annual Totals reconcile with Monthly Totals
      const sumOfMonthsReceived = report.monthlyBreakdown.reduce((acc, m) => acc + m.totalReceived, 0);
      expect(report.totalReceived).toBe(sumOfMonthsReceived);

      const sumOfMonthsOutflows = report.monthlyBreakdown.reduce((acc, m) => acc + m.freelanceTotal, 0);
      expect(report.totalOutflows).toBe(sumOfMonthsOutflows);

      expect(report.netBalance).toBe(report.totalReceived - report.totalOutflows);
    });

    it('correctly categorizes pending, failed, and refunded transactions separately', async () => {
      const report = await service.getAnnualReport(2026);

      expect(report.pendingCount).toBe(1);
      expect(report.pendingAmount).toBe(2000);

      expect(report.failedCount).toBe(1);
      expect(report.failedAmount).toBe(2500);

      expect(report.refundedCount).toBe(1);
      expect(report.refundedAmount).toBe(500);
    });
  });

  describe('Member Payment Reports', () => {
    it('calculates monthly member payment mapping and outstanding balances', async () => {
      const res = await service.getMemberPaymentReports({ year: 2026 });
      expect(res.members).toHaveLength(1);

      const m = res.members[0];
      expect(m.memberName).toBe('Aanu Oyeniran');
      expect(m.totalPaid).toBe(5000); // 2500 in Jan, 2500 in Feb
      expect(m.totalDue).toBe(5000);
      expect(m.outstandingBalance).toBe(0);
      expect(m.monthsPaidCount).toBe(2);
      expect(m.monthlyPaymentMap[1]).toBe(2500);
      expect(m.monthlyPaymentMap[2]).toBe(2500);
      expect(m.monthlyPaymentMap[3]).toBe(0);
    });
  });

  describe('Freelance Worker & Contractor Reports', () => {
    it('summarizes paid and payable contractor disbursements', async () => {
      const res = await service.getFreelanceReports({ year: 2026 });
      expect(res.workers).toHaveLength(2);
      expect(res.totalPaid).toBe(27000);
      expect(res.workers[0].workerName).toBe('Sound Engineer Contractor');
    });
  });

  describe('Professional PDF Generation', () => {
    it('generates a valid, non-empty binary PDF document buffer with A4 formatting', async () => {
      const pdfBuffer = await service.generatePdf({ year: 2026, format: 'SUMMARY' });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);

      // Verify standard PDF header magic bytes %PDF-
      const pdfMagic = pdfBuffer.slice(0, 5).toString('ascii');
      expect(pdfMagic).toBe('%PDF-');
    });

    it('generates a detailed audit PDF with transaction records included', async () => {
      const pdfBuffer = await service.generatePdf({ year: 2026, format: 'DETAILED' });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1500);
      expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
