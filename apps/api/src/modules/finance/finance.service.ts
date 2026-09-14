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
    return this.cache.wrap('finance:dashboard', 30, async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [expenseByStatus, expenseThisMonth, expenseByCategory, pendingPayments, latestPeriod] = await Promise.all([
        this.prisma.expense.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
        this.prisma.expense.aggregate({ where: { status: 'PAID', paidOn: { gte: monthStart } }, _sum: { amount: true } }),
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: { status: { in: ['APPROVED', 'PAID'] }, incurredOn: { gte: new Date(now.getFullYear(), 0, 1) } },
          _sum: { amount: true },
        }),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.duesPeriod.findFirst({ orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
      ]);

      const categories = await this.prisma.expenseCategory.findMany({ select: { id: true, name: true } });
      const catName = new Map(categories.map((c) => [c.id, c.name]));

      const expenses = {
        pendingApproval: expenseByStatus.find((r) => r.status === 'PENDING_APPROVAL')?._count._all ?? 0,
        approvedUnpaid: expenseByStatus.find((r) => r.status === 'APPROVED')?._count._all ?? 0,
        paidThisMonth: Math.round((expenseThisMonth._sum.amount ?? 0) * 100) / 100,
        ytdApprovedOrPaid: Math.round(expenseByStatus.filter((r) => ['APPROVED', 'PAID'].includes(r.status)).reduce((s, r) => s + (r._sum.amount ?? 0), 0) * 100) / 100,
        byCategory: expenseByCategory
          .map((r) => ({ category: catName.get(r.categoryId) ?? 'Unknown', amount: Math.round((r._sum.amount ?? 0) * 100) / 100 }))
          .filter((r) => r.amount > 0)
          .sort((a, b) => b.amount - a.amount),
      };

      const dues = latestPeriod ? (await this.dues.getPeriod(latestPeriod.id)) : null;

      // Last 6 months collection trend — consolidated single batch aggregation
      const periods = await this.prisma.duesPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 6 });
      const periodIds = periods.map((p) => p.id);
      const aggList = periodIds.length > 0 ? await this.prisma.memberDuesAssignment.groupBy({
        by: ['periodId'],
        where: { periodId: { in: periodIds } },
        _sum: { amountDue: true, amountPaid: true },
      }) : [];
      const aggMap = new Map(aggList.map((a) => [a.periodId, a._sum]));

      const trend = periods.reverse().map((p) => {
        const agg = aggMap.get(p.id);
        return {
          label: p.label,
          expected: Math.round((agg?.amountDue ?? 0) * 100) / 100,
          collected: Math.round((agg?.amountPaid ?? 0) * 100) / 100,
        };
      });

      return {
        expenses,
        payments: { pending: pendingPayments },
        dues: dues
          ? { period: dues.period.label, ...dues.summary }
          : null,
        duesTrend: trend,
      };
    }, ['finance']);
  }
}
