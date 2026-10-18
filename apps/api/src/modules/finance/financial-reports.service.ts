import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialReportPdfService, AnnualReportSummaryData } from './financial-report-pdf.service';
import { PaymentStatus, ExpenseStatus } from '@prisma/client';

export interface ReportFilterDto {
  year?: number | string;
  month?: number | string;
  from?: string;
  to?: string;
  type?: 'ALL' | 'MEMBER_INFLOW' | 'WORKER_OUTFLOW';
  status?: string;
  memberId?: string;
  search?: string;
  page?: number | string;
  limit?: number | string;
  format?: 'SUMMARY' | 'DETAILED';
  category?: 'ANNUAL' | 'MONTHLY' | 'MEMBER' | 'FREELANCE' | 'DETAILED';
}

interface ResolvedParams {
  year: number;
  month?: number;
  from?: string;
  to?: string;
  type?: 'ALL' | 'MEMBER_INFLOW' | 'WORKER_OUTFLOW';
  status?: string;
  memberId?: string;
  search?: string;
  page: number;
  limit: number;
  format: 'SUMMARY' | 'DETAILED';
  category: 'ANNUAL' | 'MONTHLY' | 'MEMBER' | 'FREELANCE' | 'DETAILED';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: FinancialReportPdfService,
  ) {}

  /**
   * Resolves the filter parameters with safe typed defaults.
   */
  private resolveParams(filters: ReportFilterDto): ResolvedParams {
    const currentYear = new Date().getFullYear();
    const year = filters.year ? Number(filters.year) : currentYear;
    const month = filters.month && filters.month !== 'ALL' ? Number(filters.month) : undefined;
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
    const format = filters.format === 'DETAILED' ? 'DETAILED' : 'SUMMARY';
    const category = filters.category || 'ANNUAL';

    return {
      year,
      month,
      from: filters.from,
      to: filters.to,
      type: filters.type,
      status: filters.status,
      memberId: filters.memberId,
      search: filters.search,
      page,
      limit,
      format,
      category,
    };
  }

  /**
   * Generates high-level dashboard metrics for the Class Owner.
   */
  async getDashboardMetrics(filters: ReportFilterDto) {
    const params = this.resolveParams(filters);
    const dateFilter = this.buildDateRange(params.year, params.month, params.from, params.to);

    const [payments, expenses, distinctMembers, distinctWorkers] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          paidOn: dateFilter,
          ...(params.memberId ? { memberId: params.memberId } : {}),
        },
        select: {
          id: true,
          amount: true,
          status: true,
          purpose: true,
          memberId: true,
        },
      }),
      this.prisma.expense.findMany({
        where: {
          incurredOn: dateFilter,
        },
        select: {
          id: true,
          amount: true,
          status: true,
          vendorName: true,
        },
      }),
      this.prisma.member.count({ where: { status: 'ACTIVE' } }),
      this.prisma.expense.groupBy({
        by: ['vendorName'],
        where: { incurredOn: dateFilter, vendorName: { not: null } },
      }),
    ]);

    let totalReceived = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let failedCount = 0;
    let failedAmount = 0;
    let refundedCount = 0;
    let refundedAmount = 0;

    for (const p of payments) {
      if (p.status === PaymentStatus.CONFIRMED) {
        totalReceived += p.amount;
        successfulCount++;
      } else if (p.status === PaymentStatus.PENDING) {
        pendingCount++;
        pendingAmount += p.amount;
      } else if (p.status === PaymentStatus.REJECTED) {
        failedCount++;
        failedAmount += p.amount;
      } else if (p.status === PaymentStatus.REFUNDED) {
        refundedCount++;
        refundedAmount += p.amount;
      }
    }

    let totalOutflows = 0;
    let successfulExpensesCount = 0;
    for (const e of expenses) {
      if (e.status === ExpenseStatus.PAID || e.status === ExpenseStatus.APPROVED) {
        totalOutflows += e.amount;
        successfulExpensesCount++;
      }
    }

    const netBalance = totalReceived - totalOutflows;

    return {
      reportingPeriod: params.month ? `${MONTH_NAMES[params.month - 1]} ${params.year}` : `Full Year ${params.year}`,
      year: params.year,
      month: params.month,
      currency: 'NGN',
      totalReceived: Math.round(totalReceived * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
      successfulCount,
      successfulExpensesCount,
      totalMemberPayments: Math.round(totalReceived * 100) / 100,
      totalFreelancePayments: Math.round(totalOutflows * 100) / 100,
      pendingCount,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      failedCount,
      failedAmount: Math.round(failedAmount * 100) / 100,
      refundedCount,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      activeMembersCount: distinctMembers,
      freelanceWorkersCount: distinctWorkers.length,
    };
  }

  /**
   * Generates comprehensive 12-month annual financial report (Jan - Dec).
   */
  async getAnnualReport(yearInput?: number | string) {
    const year = yearInput ? Number(yearInput) : new Date().getFullYear();

    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

    const [payments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          paidOn: { gte: startOfYear, lte: endOfYear },
        },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, memberCode: true } },
          duesAssignment: { include: { period: true } },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          incurredOn: { gte: startOfYear, lte: endOfYear },
        },
        include: { category: true },
      }),
    ]);

    const monthlyMap = new Map<number, {
      month: number;
      monthName: string;
      year: number;
      totalReceived: number;
      successfulCount: number;
      membersSet: Set<string>;
      memberTotal: number;
      freelanceTotal: number;
      pendingCount: number;
      pendingAmount: number;
      failedCount: number;
      failedAmount: number;
      refundedCount: number;
      refundedAmount: number;
    }>();

    for (let m = 1; m <= 12; m++) {
      monthlyMap.set(m, {
        month: m,
        monthName: MONTH_NAMES[m - 1],
        year,
        totalReceived: 0,
        successfulCount: 0,
        membersSet: new Set<string>(),
        memberTotal: 0,
        freelanceTotal: 0,
        pendingCount: 0,
        pendingAmount: 0,
        failedCount: 0,
        failedAmount: 0,
        refundedCount: 0,
        refundedAmount: 0,
      });
    }

    for (const p of payments) {
      const pMonth = p.duesAssignment?.period?.month || (new Date(p.paidOn).getMonth() + 1);
      const mObj = monthlyMap.get(pMonth);
      if (!mObj) continue;

      if (p.status === PaymentStatus.CONFIRMED) {
        mObj.totalReceived += p.amount;
        mObj.memberTotal += p.amount;
        mObj.successfulCount++;
        mObj.membersSet.add(p.memberId);
      } else if (p.status === PaymentStatus.PENDING) {
        mObj.pendingCount++;
        mObj.pendingAmount += p.amount;
      } else if (p.status === PaymentStatus.REJECTED) {
        mObj.failedCount++;
        mObj.failedAmount += p.amount;
      } else if (p.status === PaymentStatus.REFUNDED) {
        mObj.refundedCount++;
        mObj.refundedAmount += p.amount;
      }
    }

    for (const e of expenses) {
      const eMonth = new Date(e.incurredOn).getMonth() + 1;
      const mObj = monthlyMap.get(eMonth);
      if (!mObj) continue;

      if (e.status === ExpenseStatus.PAID || e.status === ExpenseStatus.APPROVED) {
        mObj.freelanceTotal += e.amount;
      }
    }

    const monthlyBreakdown = Array.from(monthlyMap.values()).map((m) => {
      const netSubtotal = m.totalReceived - m.freelanceTotal;
      return {
        month: m.month,
        monthName: m.monthName,
        year: m.year,
        totalReceived: Math.round(m.totalReceived * 100) / 100,
        successfulCount: m.successfulCount,
        memberCount: m.membersSet.size,
        memberTotal: Math.round(m.memberTotal * 100) / 100,
        freelanceTotal: Math.round(m.freelanceTotal * 100) / 100,
        pendingCount: m.pendingCount,
        pendingAmount: Math.round(m.pendingAmount * 100) / 100,
        failedCount: m.failedCount,
        failedAmount: Math.round(m.failedAmount * 100) / 100,
        refundedCount: m.refundedCount,
        refundedAmount: Math.round(m.refundedAmount * 100) / 100,
        monthlySubtotal: Math.round(netSubtotal * 100) / 100,
      };
    });

    const totalReceived = monthlyBreakdown.reduce((acc, m) => acc + m.totalReceived, 0);
    const totalOutflows = monthlyBreakdown.reduce((acc, m) => acc + m.freelanceTotal, 0);
    const successfulCount = monthlyBreakdown.reduce((acc, m) => acc + m.successfulCount, 0);
    const pendingCount = monthlyBreakdown.reduce((acc, m) => acc + m.pendingCount, 0);
    const pendingAmount = monthlyBreakdown.reduce((acc, m) => acc + m.pendingAmount, 0);
    const failedCount = monthlyBreakdown.reduce((acc, m) => acc + m.failedCount, 0);
    const failedAmount = monthlyBreakdown.reduce((acc, m) => acc + m.failedAmount, 0);
    const refundedCount = monthlyBreakdown.reduce((acc, m) => acc + m.refundedCount, 0);
    const refundedAmount = monthlyBreakdown.reduce((acc, m) => acc + m.refundedAmount, 0);
    const netBalance = totalReceived - totalOutflows;

    return {
      year,
      currency: 'NGN',
      totalReceived: Math.round(totalReceived * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
      successfulCount,
      pendingCount,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      failedCount,
      failedAmount: Math.round(failedAmount * 100) / 100,
      refundedCount,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      monthlyBreakdown,
    };
  }

  /**
   * Generates Member contribution reports.
   */
  async getMemberPaymentReports(filters: ReportFilterDto) {
    const params = this.resolveParams(filters);
    const year = params.year;

    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

    const members = await this.prisma.member.findMany({
      where: {
        ...(params.memberId ? { id: params.memberId } : {}),
      },
      include: {
        user: { select: { email: true } },
        duesAssignments: {
          where: {
            period: { year },
          },
          include: { period: true },
        },
        payments: {
          where: {
            paidOn: { gte: startOfYear, lte: endOfYear },
            status: PaymentStatus.CONFIRMED,
          },
          include: {
            duesAssignment: { include: { period: true } },
          },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    const reportMembers = members.map((m) => {
      const monthlyPaymentMap: Record<number, number> = {};
      for (let i = 1; i <= 12; i++) monthlyPaymentMap[i] = 0;

      let totalPaid = 0;
      for (const p of m.payments) {
        const pMonth = p.duesAssignment?.period?.month || (new Date(p.paidOn).getMonth() + 1);
        monthlyPaymentMap[pMonth] = (monthlyPaymentMap[pMonth] || 0) + p.amount;
        totalPaid += p.amount;
      }

      const totalDue = m.duesAssignments.reduce((acc, a) => acc + (a.amountDue || 0), 0);
      const monthsPaidCount = Object.values(monthlyPaymentMap).filter((amt) => amt > 0).length;

      return {
        memberId: m.id,
        memberCode: m.memberCode,
        memberName: `${m.firstName} ${m.lastName}`.trim(),
        email: m.user?.email || null,
        status: m.status,
        monthlyPaymentMap,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalDue: Math.round(totalDue * 100) / 100,
        outstandingBalance: Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100),
        monthsPaidCount,
        paymentHistory: m.payments.map((p) => ({
          id: p.id,
          reference: p.reference,
          amount: p.amount,
          paidOn: p.paidOn.toISOString().slice(0, 10),
          method: p.method,
          purpose: p.purpose,
          status: p.status,
        })),
      };
    });

    return {
      year,
      totalMembers: reportMembers.length,
      currency: 'NGN',
      members: reportMembers,
    };
  }

  /**
   * Generates Freelance Worker & Contractor reports.
   */
  async getFreelanceReports(filters: ReportFilterDto) {
    const params = this.resolveParams(filters);
    const dateFilter = this.buildDateRange(params.year, params.month, params.from, params.to);

    const expenses = await this.prisma.expense.findMany({
      where: {
        incurredOn: dateFilter,
        vendorName: { not: null },
      },
      include: {
        category: true,
      },
      orderBy: { incurredOn: 'desc' },
    });

    const freelanceList = expenses.map((e) => ({
      id: e.id,
      workerName: e.vendorName || 'Independent Contractor',
      serviceCategory: e.category?.name || 'Professional Services',
      amountPaid: e.status === ExpenseStatus.PAID ? e.amount : 0,
      amountPayable: e.amount,
      status: e.status,
      paymentDate: e.incurredOn.toISOString().slice(0, 10),
      reference: e.reference,
      paymentMethod: e.paymentMethod || 'BANK_TRANSFER',
    }));

    const totalPaid = freelanceList.reduce((acc, f) => acc + f.amountPaid, 0);
    const totalPayable = freelanceList.reduce((acc, f) => acc + f.amountPayable, 0);

    return {
      year: params.year,
      currency: 'NGN',
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPayable: Math.round(totalPayable * 100) / 100,
      recordsCount: freelanceList.length,
      workers: freelanceList,
      auditNotice: freelanceList.length === 0
        ? 'No external freelance workers or contractor disbursements recorded in the system for this period.'
        : undefined,
    };
  }

  /**
   * Generates detailed transaction ledger.
   */
  async getDetailedTransactions(filters: ReportFilterDto) {
    const params = this.resolveParams(filters);
    const dateFilter = this.buildDateRange(params.year, params.month, params.from, params.to);

    const wherePayment: any = {
      paidOn: dateFilter,
      ...(params.memberId ? { memberId: params.memberId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    if (params.search) {
      wherePayment.OR = [
        { reference: { contains: params.search, mode: 'insensitive' } },
        { member: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { member: { lastName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const totalPayments = await this.prisma.payment.count({ where: wherePayment });
    const payments = await this.prisma.payment.findMany({
      where: wherePayment,
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberCode: true } },
      },
      orderBy: { paidOn: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

    const items = payments.map((p) => ({
      id: p.id,
      date: p.paidOn.toISOString().slice(0, 10),
      reference: p.reference,
      entityName: `${p.member.firstName} ${p.member.lastName}`.trim(),
      memberCode: p.member.memberCode,
      type: 'MEMBER_INFLOW' as const,
      category: p.purpose,
      description: p.description || 'Monthly membership dues',
      amount: p.amount,
      currency: 'NGN',
      method: p.method,
      status: p.status,
    }));

    return {
      page: params.page,
      limit: params.limit,
      total: totalPayments,
      totalPages: Math.ceil(totalPayments / params.limit) || 1,
      items,
    };
  }

  /**
   * Compiles and streams the complete PDF document.
   */
  async generatePdf(filters: ReportFilterDto, ownerName = 'Eseosa Glory (Class Owner)'): Promise<Buffer> {
    const params = this.resolveParams(filters);
    const annualData = await this.getAnnualReport(params.year);
    const membersData = await this.getMemberPaymentReports(filters);
    const freelanceData = await this.getFreelanceReports(filters);

    let transactions: any[] | undefined = undefined;
    if (params.format === 'DETAILED') {
      const detailed = await this.getDetailedTransactions({ ...filters, limit: 150 });
      transactions = detailed.items;
    }

    let categoryTitle = 'ANNUAL FINANCIAL STATEMENT & RECONCILIATION';
    if (params.category === 'MONTHLY' && params.month) {
      categoryTitle = `MONTHLY FINANCIAL REPORT · ${MONTH_NAMES[params.month - 1]} ${params.year}`;
    } else if (params.category === 'MEMBER') {
      categoryTitle = `MEMBER DUES & CONTRIBUTION LEDGER · ${params.year}`;
    } else if (params.category === 'FREELANCE') {
      categoryTitle = `FREELANCE & SERVICE PROVIDERS STATEMENT · ${params.year}`;
    } else if (params.category === 'DETAILED') {
      categoryTitle = `DETAILED TRANSACTION AUDIT LEDGER · ${params.year}`;
    }

    const payload: AnnualReportSummaryData = {
      year: params.year,
      currency: 'NGN',
      generatedAt: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      }),
      ownerName,
      totalReceived: annualData.totalReceived,
      totalOutflows: annualData.totalOutflows,
      netBalance: annualData.netBalance,
      successfulCount: annualData.successfulCount,
      pendingCount: annualData.pendingCount,
      pendingAmount: annualData.pendingAmount,
      failedCount: annualData.failedCount,
      failedAmount: annualData.failedAmount,
      refundedCount: annualData.refundedCount,
      refundedAmount: annualData.refundedAmount,
      monthlyBreakdown: annualData.monthlyBreakdown,
      memberBreakdown: membersData.members.map((m) => ({
        memberId: m.memberId,
        memberCode: m.memberCode,
        memberName: m.memberName,
        totalPaid: m.totalPaid,
        totalDue: m.totalDue,
        monthsPaidCount: m.monthsPaidCount,
      })),
      freelanceBreakdown: freelanceData.workers,
      transactions,
      format: params.format,
      categoryTitle,
      reportPeriodLabel: params.month ? `${MONTH_NAMES[params.month - 1]} ${params.year}` : `Full Year ${params.year}`,
    };

    return this.pdfService.generateReportPdf(payload);
  }

  private buildDateRange(year: number, month?: number, from?: string, to?: string) {
    if (from || to) {
      return {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (month) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      return { gte: start, lte: end };
    }
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    return { gte: start, lte: end };
  }
}
