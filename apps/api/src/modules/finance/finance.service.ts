import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DuesService } from './dues.service';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
    private readonly cache: CacheService,
  ) {}

  async dashboard() {
    return this.cache.wrap('finance:dashboard', 15, async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        expenseByStatus,
        expenseThisMonth,
        expenseByCategory,
        pendingPaymentsCount,
        pendingPaymentsAgg,
        confirmedPaymentsAgg,
        latestPeriod,
        monthlyDuesAgg,
        specialContributionsAgg,
        specialCampaigns,
        recentPayments,
      ] = await Promise.all([
        this.prisma.expense.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
        this.prisma.expense.aggregate({ where: { status: 'PAID', paidOn: { gte: monthStart } }, _sum: { amount: true } }),
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: { status: { in: ['APPROVED', 'PAID'] }, incurredOn: { gte: new Date(now.getFullYear(), 0, 1) } },
          _sum: { amount: true },
        }),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.payment.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
        this.prisma.payment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amount: true } }),
        this.prisma.duesPeriod.findFirst({
          where: { type: 'MONTHLY' },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        }),
        // Monthly dues assignments aggregated
        this.prisma.memberDuesAssignment.aggregate({
          where: {
            period: { type: 'MONTHLY' },
            status: { notIn: ['WAIVED', 'EXEMPT'] },
          },
          _sum: { amountDue: true, amountPaid: true },
        }),
        // Special contributions assignments aggregated
        this.prisma.memberDuesAssignment.aggregate({
          where: {
            period: { type: 'SPECIAL' },
            status: { notIn: ['WAIVED', 'EXEMPT'] },
          },
          _sum: { amountDue: true, amountPaid: true },
        }),
        // Active or recent special campaigns (e.g. Christmas Party Contribution)
        this.prisma.duesPeriod.findMany({
          where: { type: 'SPECIAL' },
          include: {
            paymentAccount: true,
            _count: { select: { assignments: true } },
          },
          orderBy: { dueDate: 'desc' },
          take: 6,
        }),
        // Recent payment activity (with receipt metadata and notes)
        this.prisma.payment.findMany({
          include: {
            member: { select: { firstName: true, lastName: true, memberCode: true } },
            duesAssignment: { include: { period: { select: { label: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
      ]);

      const categories = await this.prisma.expenseCategory.findMany({ select: { id: true, name: true } });
      const catName = new Map(categories.map((c) => [c.id, c.name]));

      const expenses = {
        pendingApproval: expenseByStatus.find((r) => r.status === 'PENDING_APPROVAL')?._count._all ?? 0,
        approvedUnpaid: expenseByStatus.find((r) => r.status === 'APPROVED')?._count._all ?? 0,
        paidThisMonth: Math.round((expenseThisMonth._sum.amount ?? 0) * 100) / 100,
        ytdApprovedOrPaid:
          Math.round(
            expenseByStatus
              .filter((r) => ['APPROVED', 'PAID'].includes(r.status))
              .reduce((s, r) => s + (r._sum.amount ?? 0), 0) * 100
          ) / 100,
        byCategory: expenseByCategory
          .map((r) => ({
            category: catName.get(r.categoryId) ?? 'Unknown',
            amount: Math.round((r._sum.amount ?? 0) * 100) / 100,
          }))
          .filter((r) => r.amount > 0)
          .sort((a, b) => b.amount - a.amount),
      };

      const dues = latestPeriod ? await this.dues.getPeriod(latestPeriod.id) : null;

      // Last 6 months monthly collection trend
      const periods = await this.prisma.duesPeriod.findMany({
        where: { type: 'MONTHLY' },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
      });
      const periodIds = periods.map((p) => p.id);
      const aggList =
        periodIds.length > 0
          ? await this.prisma.memberDuesAssignment.groupBy({
              by: ['periodId'],
              where: { periodId: { in: periodIds }, status: { notIn: ['WAIVED', 'EXEMPT'] } },
              _sum: { amountDue: true, amountPaid: true },
            })
          : [];
      const aggMap = new Map(aggList.map((a) => [a.periodId, a._sum]));

      const trend = periods.reverse().map((p) => {
        const agg = aggMap.get(p.id);
        return {
          label: p.label,
          expected: Math.round((agg?.amountDue ?? 0) * 100) / 100,
          collected: Math.round((agg?.amountPaid ?? 0) * 100) / 100,
        };
      });

      // Special campaigns detailed summary
      const campaignSummaries = await Promise.all(
        specialCampaigns.map(async (sc) => {
          const detail = await this.dues.getPeriod(sc.id);
          return {
            id: sc.id,
            label: sc.label,
            description: sc.description,
            defaultAmount: sc.defaultAmount,
            dueDate: sc.dueDate,
            status: sc.status,
            showAsAlert: sc.showAsAlert,
            paymentAccount: sc.paymentAccount,
            expected: detail.summary.expected,
            collected: detail.summary.collected,
            outstanding: detail.summary.outstanding,
            collectionRate:
              detail.summary.expected > 0
                ? Math.round((detail.summary.collected / detail.summary.expected) * 100)
                : 0,
            membersCount: detail.summary.members,
            paidCount: detail.summary.paid,
          };
        })
      );

      // Section 4 Core Overview Metrics
      const totalMonthlyDuesCollected = Math.round((monthlyDuesAgg._sum.amountPaid ?? 0) * 100) / 100;
      const totalMonthlyDuesExpected = Math.round((monthlyDuesAgg._sum.amountDue ?? 0) * 100) / 100;
      const outstandingMonthlyDues = Math.max(0, Math.round((totalMonthlyDuesExpected - totalMonthlyDuesCollected) * 100) / 100);

      const totalOtherContributionsCollected = Math.round((specialContributionsAgg._sum.amountPaid ?? 0) * 100) / 100;
      const totalOtherContributionsExpected = Math.round((specialContributionsAgg._sum.amountDue ?? 0) * 100) / 100;
      const outstandingOtherContributions = Math.max(
        0,
        Math.round((totalOtherContributionsExpected - totalOtherContributionsCollected) * 100) / 100
      );

      const totalVerifiedCollections = Math.round((confirmedPaymentsAgg._sum.amount ?? 0) * 100) / 100;
      const pendingPaymentsAmount = Math.round((pendingPaymentsAgg._sum.amount ?? 0) * 100) / 100;

      const formattedRecentActivity = recentPayments.map((p) => {
        const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null;
        return {
          id: p.id,
          reference: p.reference,
          member: `${p.member.firstName} ${p.member.lastName}`.trim(),
          memberCode: p.member.memberCode,
          purpose: p.purpose,
          amount: p.amount,
          method: p.method,
          paidOn: p.paidOn,
          status: p.status,
          duesPeriod: p.duesAssignment?.period.label ?? null,
          description: p.description,
          receiptUrl: (meta?.receiptUrl as string) || null,
          receiptName: (meta?.receiptName as string) || null,
          createdAt: p.createdAt,
        };
      });

      return {
        // High-level Section 4 Summary KPI Cards
        summary: {
          totalMonthlyDuesCollected,
          outstandingMonthlyDues,
          totalMonthlyDuesExpected,
          totalOtherContributionsCollected,
          totalOtherContributionsExpected,
          outstandingOtherContributions,
          pendingPaymentsCount,
          pendingPaymentsAmount,
          totalVerifiedCollections,
        },
        // Section 1: Monthly Dues Overview
        monthlyDues: {
          collected: totalMonthlyDuesCollected,
          outstanding: outstandingMonthlyDues,
          expected: totalMonthlyDuesExpected,
          collectionRate:
            totalMonthlyDuesExpected > 0
              ? Math.round((totalMonthlyDuesCollected / totalMonthlyDuesExpected) * 100)
              : 0,
          currentPeriod: dues ? { period: dues.period.label, ...dues.summary } : null,
        },
        // Section 2: Other Contributions Overview (Christmas Party, Special Drives)
        otherContributions: {
          collected: totalOtherContributionsCollected,
          outstanding: outstandingOtherContributions,
          expected: totalOtherContributionsExpected,
          campaignsCount: specialCampaigns.length,
          campaigns: campaignSummaries,
        },
        // Section 3: Recent Payment Activity
        recentActivity: formattedRecentActivity,
        // Legacy & supplementary telemetry
        expenses,
        payments: {
          pending: pendingPaymentsCount,
          pendingAmount: pendingPaymentsAmount,
          totalVerified: totalVerifiedCollections,
        },
        dues: dues ? { period: dues.period.label, ...dues.summary } : null,
        duesTrend: trend,
      };
    }, ['finance']);
  }
}
