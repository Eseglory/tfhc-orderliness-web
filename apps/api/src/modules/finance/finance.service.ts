import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DuesService } from './dues.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
  ) {}

  async dashboard() {
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

    // Last 6 months collection trend.
    const periods = await this.prisma.duesPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 6 });
    const trend = [];
    for (const p of periods.reverse()) {
      const agg = await this.prisma.memberDuesAssignment.aggregate({
        where: { periodId: p.id },
        _sum: { amountDue: true, amountPaid: true },
      });
      trend.push({
        label: p.label,
        expected: Math.round((agg._sum.amountDue ?? 0) * 100) / 100,
        collected: Math.round((agg._sum.amountPaid ?? 0) * 100) / 100,
      });
    }

    return {
      expenses,
      payments: { pending: pendingPayments },
      dues: dues
        ? { period: dues.period.label, ...dues.summary }
        : null,
      duesTrend: trend,
    };
  }
}
