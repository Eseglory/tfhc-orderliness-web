import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DuesAssignmentStatus, DuesPeriodType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { money, parseDateOnly } from './finance.util';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class DuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) { }

  /** Effective status: OUTSTANDING/PARTIALLY_PAID become OVERDUE once past due. */
  private effective(status: DuesAssignmentStatus, dueDate: Date): DuesAssignmentStatus {
    if ((status === 'OUTSTANDING' || status === 'PARTIALLY_PAID') && Date.now() > dueDate.getTime()) return 'OVERDUE';
    return status;
  }

  /** Recompute a single assignment's stored status from its balances. */
  private computeStatus(amountDue: number, amountPaid: number, current: DuesAssignmentStatus): DuesAssignmentStatus {
    if (current === 'EXEMPT' || current === 'WAIVED') return current;
    if (amountPaid <= 0) return 'OUTSTANDING';
    if (amountPaid + 0.005 >= amountDue) return 'PAID';
    return 'PARTIALLY_PAID';
  }

  async listPeriods() {
    const periods = await this.prisma.duesPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { assignments: true } }, paymentAccount: true },
    });
    return periods.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      label: p.label,
      description: p.description,
      type: p.type,
      defaultAmount: p.defaultAmount,
      dueDate: p.dueDate,
      status: p.status,
      showAsAlert: p.showAsAlert,
      paymentAccount: p.paymentAccount,
      assignmentCount: p._count.assignments,
    }));
  }

  /**
   * Creates either a regular recurring MONTHLY dues period (one per calendar
   * month) or a one-off SPECIAL contribution campaign (e.g. a Christmas
   * fund) with its own title, deadline and optionally its own payment
   * account. SPECIAL campaigns are not constrained to one per month.
   */
  async createPeriod(dto: Record<string, unknown>, actorUserId: string) {
    const type: DuesPeriodType = dto.type === 'SPECIAL' ? 'SPECIAL' : 'MONTHLY';
    const defaultAmount = money(dto.defaultAmount, 'Default amount');
    const description = typeof dto.description === 'string' ? dto.description.trim().slice(0, 2000) || null : null;
    const showAsAlert = Boolean(dto.showAsAlert);

    let paymentAccountId: string | null = null;
    if (dto.paymentAccountId) {
      const account = await this.prisma.paymentAccount.findUnique({ where: { id: String(dto.paymentAccountId) } });
      if (!account) throw new BadRequestException('Unknown payment account');
      paymentAccountId = account.id;
    }

    let year: number;
    let month: number;
    let label: string;
    let dueDate: Date;

    if (type === 'SPECIAL') {
      if (typeof dto.label !== 'string' || !dto.label.trim()) throw new BadRequestException('A title is required');
      if (!dto.dueDate) throw new BadRequestException('A deadline is required');
      label = dto.label.trim().slice(0, 160);
      dueDate = parseDateOnly(dto.dueDate, 'Deadline');
      year = dueDate.getUTCFullYear();
      month = dueDate.getUTCMonth() + 1;
    } else {
      year = Number(dto.year);
      month = Number(dto.month);
      if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new BadRequestException('Invalid year');
      if (!Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException('Invalid month');
      dueDate = parseDateOnly(dto.dueDate ?? new Date(Date.UTC(year, month, 5)), 'Due date');
      label = `${MONTHS[month - 1]} ${year}`;

      const clash = await this.prisma.duesPeriod.findFirst({ where: { year, month, type: 'MONTHLY' } });
      if (clash) throw new ConflictException(`Dues for ${MONTHS[month - 1]} ${year} already exist`);
    }

    const period = await this.prisma.duesPeriod.create({
      data: { year, month, label, description, type, defaultAmount, dueDate, showAsAlert, paymentAccountId, createdByUserId: actorUserId },
    });
    await this.audit.record({ actorUserId, action: 'DUES_PERIOD_CREATED', entity: 'DuesPeriod', entityId: period.id, newData: { label: period.label, type, defaultAmount } });

    if (dto.generate !== false) await this.generateAssignments(period.id, actorUserId);
    return this.getPeriod(period.id);
  }

  /** Create an assignment for every ACTIVE, non-exempt member who lacks one. */
  async generateAssignments(periodId: string, actorUserId: string) {
    const period = await this.prisma.duesPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Dues period not found');
    if (period.status === 'CLOSED') throw new BadRequestException('This period is closed');

    const members = await this.prisma.member.findMany({
      where: {
        approvedMember: { status: 'ACTIVE' },
        status: { in: ['ACTIVE', 'NEW_MEMBER'] },
      },
      select: { id: true, status: true },
    });
    const existing = new Set(
      (await this.prisma.memberDuesAssignment.findMany({ where: { periodId }, select: { memberId: true } })).map((a) => a.memberId),
    );
    const toCreate = members.filter((m) => !existing.has(m.id));
    if (toCreate.length) {
      await this.prisma.memberDuesAssignment.createMany({
        data: toCreate.map((m) => ({ periodId, memberId: m.id, amountDue: period.defaultAmount })),
        skipDuplicates: true,
      });
    }
    await this.audit.record({ actorUserId, action: 'DUES_ASSIGNMENTS_GENERATED', entity: 'DuesPeriod', entityId: periodId, newData: { added: toCreate.length } });
    return { added: toCreate.length };
  }

  async getPeriod(periodId: string) {
    const period = await this.prisma.duesPeriod.findUnique({
      where: { id: periodId },
      include: {
        paymentAccount: true,
        assignments: {
          include: { member: { select: { id: true, firstName: true, lastName: true, memberCode: true, subTeam: { select: { name: true } } } } },
          orderBy: { member: { lastName: 'asc' } },
        },
      },
    });
    if (!period) throw new NotFoundException('Dues period not found');

    const assignments = period.assignments.map((a) => ({
      id: a.id,
      member: {
        id: a.member.id,
        name: `${a.member.firstName} ${a.member.lastName}`.trim(),
        memberCode: a.member.memberCode,
        subTeam: a.member.subTeam?.name ?? null,
      },
      amountDue: a.amountDue,
      amountPaid: a.amountPaid,
      balance: Math.max(0, Math.round((a.amountDue - a.amountPaid) * 100) / 100),
      status: this.effective(a.status, period.dueDate),
      storedStatus: a.status,
      note: a.note,
    }));

    const counted = (s: DuesAssignmentStatus) => assignments.filter((a) => a.status === s).length;
    const expected = assignments.filter((a) => !['EXEMPT', 'WAIVED'].includes(a.status)).reduce((s, a) => s + a.amountDue, 0);
    const collected = assignments.reduce((s, a) => s + a.amountPaid, 0);

    return {
      period: {
        id: period.id,
        label: period.label,
        description: period.description,
        type: period.type,
        year: period.year,
        month: period.month,
        defaultAmount: period.defaultAmount,
        dueDate: period.dueDate,
        status: period.status,
        showAsAlert: period.showAsAlert,
        paymentAccount: period.paymentAccount,
      },
      summary: {
        members: assignments.length,
        expected: Math.round(expected * 100) / 100,
        collected: Math.round(collected * 100) / 100,
        outstanding: Math.round(Math.max(0, expected - collected) * 100) / 100,
        collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        paid: counted('PAID'),
        partiallyPaid: counted('PARTIALLY_PAID'),
        outstandingCount: counted('OUTSTANDING'),
        overdue: counted('OVERDUE'),
        exempt: counted('EXEMPT') + counted('WAIVED'),
      },
      assignments,
    };
  }

  async closePeriod(periodId: string, actorUserId: string) {
    const period = await this.prisma.duesPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Dues period not found');
    await this.prisma.duesPeriod.update({ where: { id: periodId }, data: { status: period.status === 'OPEN' ? 'CLOSED' : 'OPEN' } });
    await this.audit.record({ actorUserId, action: 'DUES_PERIOD_STATUS', entity: 'DuesPeriod', entityId: periodId, newData: { status: period.status === 'OPEN' ? 'CLOSED' : 'OPEN' } });
    return this.getPeriod(periodId);
  }

  async setAssignmentStatus(assignmentId: string, dto: { status: string; reason?: string }, actorUserId: string) {
    const valid = ['OUTSTANDING', 'EXEMPT', 'WAIVED'];
    if (!valid.includes(dto.status)) throw new BadRequestException('Set OUTSTANDING, EXEMPT or WAIVED');
    const assignment = await this.prisma.memberDuesAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const next =
      dto.status === 'OUTSTANDING'
        ? this.computeStatus(assignment.amountDue, assignment.amountPaid, 'OUTSTANDING')
        : (dto.status as DuesAssignmentStatus);
    const updated = await this.prisma.memberDuesAssignment.update({
      where: { id: assignmentId },
      data: { status: next, note: dto.reason?.slice(0, 300) ?? assignment.note },
    });
    await this.audit.record({
      actorUserId,
      action: 'DUES_ASSIGNMENT_STATUS',
      entity: 'MemberDuesAssignment',
      entityId: assignmentId,
      previousData: { status: assignment.status },
      newData: { status: next },
      reason: dto.reason,
    });
    return updated;
  }

  async adjustAmount(assignmentId: string, dto: { amountDue: number; reason: string }, actorUserId: string) {
    const assignment = await this.prisma.memberDuesAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (typeof dto.reason !== 'string' || dto.reason.trim().length < 3) throw new BadRequestException('A reason for the adjustment is required');
    const amountDue = money(dto.amountDue, 'Amount due', { min: 0 });
    const history = Array.isArray(assignment.adjustments) ? (assignment.adjustments as Prisma.JsonArray) : [];
    const updated = await this.prisma.memberDuesAssignment.update({
      where: { id: assignmentId },
      data: {
        amountDue,
        status: this.computeStatus(amountDue, assignment.amountPaid, assignment.status),
        adjustments: [...history, { from: assignment.amountDue, to: amountDue, reason: dto.reason.trim(), by: actorUserId, at: new Date().toISOString() }] as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      actorUserId,
      action: 'DUES_AMOUNT_ADJUSTED',
      entity: 'MemberDuesAssignment',
      entityId: assignmentId,
      previousData: { amountDue: assignment.amountDue },
      newData: { amountDue },
      reason: dto.reason.trim(),
    });
    return updated;
  }

  /** Called by PaymentsService when a dues payment is confirmed/reversed. */
  async applyPaymentDelta(assignmentId: string, delta: number, tx: Prisma.TransactionClient) {
    const assignment = await tx.memberDuesAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return;
    const amountPaid = Math.max(0, Math.round((assignment.amountPaid + delta) * 100) / 100);
    await tx.memberDuesAssignment.update({
      where: { id: assignmentId },
      data: { amountPaid, status: this.computeStatus(assignment.amountDue, amountPaid, assignment.status) },
    });
  }

  async myDues(memberId?: string) {
    if (!memberId) return [];

    const [member, defaultAccount, rows] = await Promise.all([
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, roleInUnit: true },
      }),
      this.prisma.paymentAccount.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.memberDuesAssignment.findMany({
        where: { memberId, period: { type: 'MONTHLY' } },
        include: {
          period: { include: { paymentAccount: true } },
          payments: {
            select: {
              id: true,
              reference: true,
              amount: true,
              status: true,
              paidOn: true,
              description: true,
              metadata: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
      }),
    ]);

    // Determine category: Executive (₦2,500/mo) vs Regular (₦2,000/mo)
    let isExecutive = false;
    for (const r of rows) {
      if (r.amountDue >= 2500 || r.amountPaid >= 2500) {
        isExecutive = true;
        break;
      }
    }
    if (!isExecutive && (member?.roleInUnit?.toLowerCase().includes('exec') || member?.roleInUnit?.toLowerCase().includes('leader'))) {
      isExecutive = true;
    }
    const category: 'Executive' | 'Regular' = isExecutive ? 'Executive' : 'Regular';
    const monthlyRate = isExecutive ? 2500 : 2000;

    return rows.map((a) => {
      const pendingPayment = a.payments.find((p) => p.status === 'PENDING');
      const latestPayment = a.payments[0] ?? null;
      const meta = latestPayment?.metadata && typeof latestPayment.metadata === 'object'
        ? (latestPayment.metadata as Record<string, unknown>)
        : null;

      const account = a.period.paymentAccount || defaultAccount;

      return {
        id: a.id,
        period: a.period.label,
        periodId: a.periodId,
        amountDue: a.amountDue,
        amountPaid: a.amountPaid,
        balance: Math.max(0, Math.round((a.amountDue - a.amountPaid) * 100) / 100),
        dueDate: a.period.dueDate,
        status: this.effective(a.status, a.period.dueDate),
        category,
        monthlyRate,
        hasPendingPayment: !!pendingPayment,
        pendingPayment: pendingPayment
          ? {
              id: pendingPayment.id,
              reference: pendingPayment.reference,
              amount: pendingPayment.amount,
              paidOn: pendingPayment.paidOn,
              description: pendingPayment.description,
            }
          : null,
        receiptUrl: (meta?.receiptUrl as string) || null,
        receiptName: (meta?.receiptName as string) || null,
        paymentAccount: account
          ? {
              id: account.id,
              bankName: account.bankName,
              accountName: account.accountName,
              accountNumber: account.accountNumber,
              instructions: account.instructions,
            }
          : null,
      };
    });
  }

  /**
   * A member's open SPECIAL contribution campaigns (e.g. a Christmas fund) —
   * separate from the recurring monthly dues. Used by both the member dues
   * page and the daily dismissible dashboard alert.
   */
  async myCampaigns(memberId?: string) {
    if (!memberId) return [];
    const rows = await this.prisma.memberDuesAssignment.findMany({
      where: { memberId, period: { type: 'SPECIAL' } },
      include: { period: { include: { paymentAccount: true } } },
      orderBy: [{ period: { dueDate: 'asc' } }],
    });
    return rows.map((a) => ({
      id: a.id,
      periodId: a.periodId,
      title: a.period.label,
      description: a.period.description,
      deadline: a.period.dueDate,
      periodStatus: a.period.status,
      showAsAlert: a.period.showAsAlert,
      amountDue: a.amountDue,
      amountPaid: a.amountPaid,
      balance: Math.max(0, Math.round((a.amountDue - a.amountPaid) * 100) / 100),
      status: this.effective(a.status, a.period.dueDate),
      paymentAccount: a.period.paymentAccount,
    }));
  }

  async getAnnualMatrix(year: number) {
    const safeYear = Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : new Date().getFullYear();

    return this.cache.wrap(`finance:matrix:${safeYear}`, 60, async () => {
      // 1. Get all 12 periods for the year (MONTHLY only — SPECIAL campaigns
      // can share a year/month with a monthly period and are tracked separately).
      const periods = await this.prisma.duesPeriod.findMany({
        where: { year: safeYear, type: 'MONTHLY' },
        orderBy: { month: 'asc' },
      });

      const periodMap = new Map<number, (typeof periods)[0]>();
      for (const p of periods) {
        periodMap.set(p.month, p);
      }

      const periodIds = periods.map((p) => p.id);

      // 2. Get all members who are active church members or have dues assignments in this year
      const members = await this.prisma.member.findMany({
        where: {
          OR: [
            { duesAssignments: { some: { period: { year: safeYear, type: 'MONTHLY' } } } },
            {
              approvedMember: { status: 'ACTIVE' },
              status: { in: ['ACTIVE', 'NEW_MEMBER'] },
            },
          ],
        },
        include: {
          approvedMember: { select: { email: true } },
          user: { select: { email: true, role: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });

      // 3. Get all dues assignments for this year including payment records
      const assignments =
        periodIds.length > 0
          ? await this.prisma.memberDuesAssignment.findMany({
            where: { periodId: { in: periodIds } },
            include: {
              period: true,
              payments: {
                select: {
                  id: true,
                  reference: true,
                  amount: true,
                  status: true,
                  paidOn: true,
                  method: true,
                  payerReference: true,
                  description: true,
                  metadata: true,
                },
                orderBy: { paidOn: 'desc' },
              },
            },
          })
          : [];

      // Map: memberId -> monthNumber -> assignment
      const memberAssignmentMap = new Map<string, Map<number, (typeof assignments)[0]>>();
      for (const a of assignments) {
        if (!memberAssignmentMap.has(a.memberId)) {
          memberAssignmentMap.set(a.memberId, new Map());
        }
        memberAssignmentMap.get(a.memberId)!.set(a.period.month, a);
      }

      // 4. Build Member Matrix Rows
      const memberRows = members.map((m) => {
        const name =
          `${m.firstName || ''} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName || ''}`.trim() || 'Church Member';
        const email = m.approvedMember?.email || m.user?.email || null;
        const phone = m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : null;

        const mAssignments = memberAssignmentMap.get(m.id) || new Map<number, (typeof assignments)[0]>();

        // Determine category & monthly rate:
        // Executive = ₦2,500/month; Regular = ₦2,000/month
        let isExecutive = false;
        for (const a of mAssignments.values()) {
          if (a.amountDue >= 2500 || a.amountPaid >= 2500) {
            isExecutive = true;
            break;
          }
        }
        if (!isExecutive && (m.roleInUnit?.toLowerCase().includes('exec') || m.roleInUnit?.toLowerCase().includes('leader'))) {
          isExecutive = true;
        }

        const category: 'Executive' | 'Regular' = isExecutive ? 'Executive' : 'Regular';
        const monthlyRate = isExecutive ? 2500 : 2000;

        let totalExpected = 0;
        let totalPaid = 0;
        let totalWaived = 0;
        let monthsPaidCount = 0;
        let monthsUnpaidCount = 0;
        let monthsWaivedCount = 0;
        let assignedMonthsCount = 0;

        const months = Array.from({ length: 12 }, (_, i) => {
          const monthNum = i + 1;
          const period = periodMap.get(monthNum);
          const assignment = mAssignments.get(monthNum);

          if (!period) {
            return {
              month: monthNum,
              monthName: MONTHS[i],
              periodId: null,
              assignmentId: null,
              amountDue: 0,
              amountPaid: 0,
              balance: 0,
              status: 'NOT_CREATED',
              storedStatus: 'NOT_CREATED',
              dueDate: null,
              note: null,
              hasPendingPayment: false,
              payments: [],
            };
          }

          if (!assignment) {
            monthsUnpaidCount++;
            totalExpected += monthlyRate;
            return {
              month: monthNum,
              monthName: MONTHS[i],
              periodId: period.id,
              assignmentId: null,
              amountDue: monthlyRate,
              amountPaid: 0,
              balance: monthlyRate,
              status: 'NOT_ASSIGNED',
              storedStatus: 'NOT_ASSIGNED',
              dueDate: period.dueDate,
              note: null,
              hasPendingPayment: false,
              payments: [],
            };
          }

          const effectiveStatus = this.effective(assignment.status, period.dueDate);
          const rawDue = assignment.amountDue > 0 ? assignment.amountDue : monthlyRate;
          const amountPaid = assignment.amountPaid;
          const isWaived = ['EXEMPT', 'WAIVED'].includes(effectiveStatus);

          const payments = (assignment.payments || []).map((p) => {
            const meta = (p.metadata && typeof p.metadata === 'object' ? p.metadata : {}) as Record<string, unknown>;
            return {
              id: p.id,
              reference: p.reference,
              amount: p.amount,
              status: p.status,
              paidOn: p.paidOn,
              method: p.method,
              payerReference: p.payerReference,
              description: p.description,
              receiptUrl: (meta.receiptUrl as string) || null,
              receiptName: (meta.receiptName as string) || null,
            };
          });

          const hasPendingPayment = payments.some((p) => p.status === 'PENDING');

          let amountDue = rawDue;
          let balance = 0;

          if (isWaived) {
            monthsWaivedCount++;
            totalWaived += rawDue;
            amountDue = 0; // Waived months excluded from amounts due / expected
            balance = 0;
          } else {
            assignedMonthsCount++;
            totalExpected += rawDue;
            totalPaid += amountPaid;
            balance = Math.max(0, Math.round((rawDue - amountPaid) * 100) / 100);

            if (effectiveStatus === 'PAID' || amountPaid >= rawDue) {
              monthsPaidCount++;
            } else {
              monthsUnpaidCount++;
            }
          }

          return {
            month: monthNum,
            monthName: MONTHS[i],
            periodId: period.id,
            assignmentId: assignment.id,
            amountDue: isWaived ? 0 : rawDue,
            amountPaid,
            balance,
            status: isWaived
              ? 'WAIVED'
              : hasPendingPayment && effectiveStatus !== 'PAID'
                ? 'PENDING_VERIFICATION'
                : effectiveStatus,
            storedStatus: assignment.status,
            dueDate: period.dueDate,
            note: assignment.note || null,
            hasPendingPayment,
            payments,
          };
        });

        const overallBalance = Math.max(0, Math.round((totalExpected - totalPaid) * 100) / 100);
        const completionRate =
          totalExpected > 0
            ? Math.min(100, Math.round((totalPaid / totalExpected) * 100))
            : monthsWaivedCount > 0
              ? 100
              : 0;
        const monthsAssessed = 12;
        const monthsRemaining = monthsUnpaidCount;

        // Classification mutually exclusive:
        // 1. WAIVED: all applicable months were waived (totalExpected === 0 && monthsWaivedCount > 0)
        // 2. FULLY_PAID: settled all applicable monthly dues (overallBalance === 0 && monthsPaidCount > 0)
        // 3. PARTIALLY_PAID: made some payments (totalPaid > 0) but has outstanding dues (overallBalance > 0)
        // 4. NEVER_PAID: made 0 payments (totalPaid === 0) and has outstanding dues (overallBalance > 0)
        let classification: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NEVER_PAID' | 'WAIVED';
        if (totalExpected === 0 && monthsWaivedCount > 0) {
          classification = 'WAIVED';
        } else if (overallBalance === 0 && monthsPaidCount > 0) {
          classification = 'FULLY_PAID';
        } else if (totalPaid > 0 && overallBalance > 0) {
          classification = 'PARTIALLY_PAID';
        } else if (totalPaid === 0 && overallBalance > 0) {
          classification = 'NEVER_PAID';
        } else {
          classification = monthsPaidCount > 0 ? 'FULLY_PAID' : 'NEVER_PAID';
        }

        const isOutstanding = overallBalance > 0;

        return {
          id: m.id,
          memberId: m.id,
          memberCode: m.memberCode,
          name,
          firstName: m.firstName,
          lastName: m.lastName,
          email,
          phone,
          status: m.status,
          category,
          monthlyRate,
          monthsAssessed,
          monthsPaidCount,
          monthsUnpaidCount,
          monthsWaivedCount,
          monthsRemaining,
          totalExpected: Math.round(totalExpected * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          totalOutstanding: overallBalance,
          balance: overallBalance,
          balanceDue: overallBalance,
          totalWaived: Math.round(totalWaived * 100) / 100,
          completionRate,
          complianceRate: completionRate,
          classification,
          isOutstanding,
          assignedMonthsCount,
          overallStatus: classification,
          months,
        };
      });

      // 5. Monthly Breakdown KPIs
      let cumulativeExpected = 0;
      let cumulativeCollected = 0;

      const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const period = periodMap.get(monthNum);
        const monthAssignments = assignments.filter((a) => a.period.month === monthNum);

        let expected = 0;
        let collected = 0;
        let waived = 0;
        let paidCount = 0;
        let partialCount = 0;
        let overdueCount = 0;
        let outstandingCount = 0;
        let waivedCount = 0;

        if (period) {
          for (const a of monthAssignments) {
            const st = this.effective(a.status, period.dueDate);
            if (['EXEMPT', 'WAIVED'].includes(st)) {
              waived += a.amountDue;
              waivedCount++;
            } else {
              expected += a.amountDue;
              collected += a.amountPaid;
              if (st === 'PAID' || a.amountPaid >= a.amountDue) paidCount++;
              else if (st === 'PARTIALLY_PAID') partialCount++;
              else if (st === 'OVERDUE') overdueCount++;
              else outstandingCount++;
            }
          }
        }

        const outstanding = Math.max(0, Math.round((expected - collected) * 100) / 100);
        const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

        cumulativeExpected += expected;
        cumulativeCollected += collected;

        return {
          month: monthNum,
          monthName: MONTHS[i],
          hasPeriod: !!period,
          periodId: period?.id || null,
          defaultAmount: period?.defaultAmount || 0,
          dueDate: period?.dueDate || null,
          status: period?.status || 'NOT_CREATED',
          expected,
          collected,
          outstanding,
          waived,
          collectionRate,
          paidCount,
          partialCount,
          overdueCount,
          outstandingCount,
          waivedCount,
          totalAssigned: monthAssignments.length,
          cumulativeExpected,
          cumulativeCollected,
        };
      });

      // 6. Annual Overall KPIs & Categorical Performance
      const totalExpected = Math.round(memberRows.reduce((sum, m) => sum + m.totalExpected, 0) * 100) / 100;
      const totalCollected = Math.round(memberRows.reduce((sum, m) => sum + m.totalPaid, 0) * 100) / 100;
      const totalOutstanding = Math.max(0, Math.round((totalExpected - totalCollected) * 100) / 100);
      const totalWaived = Math.round(memberRows.reduce((sum, m) => sum + m.totalWaived, 0) * 100) / 100;
      const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

      // Executive vs Regular member performance breakdown
      const execRows = memberRows.filter((m) => m.category === 'Executive');
      const regRows = memberRows.filter((m) => m.category === 'Regular');

      const calcGroupPerf = (rows: typeof memberRows) => {
        const exp = Math.round(rows.reduce((s, r) => s + r.totalExpected, 0) * 100) / 100;
        const col = Math.round(rows.reduce((s, r) => s + r.totalPaid, 0) * 100) / 100;
        const out = Math.max(0, Math.round((exp - col) * 100) / 100);
        const waiv = Math.round(rows.reduce((s, r) => s + r.totalWaived, 0) * 100) / 100;
        const rate = exp > 0 ? Math.round((col / exp) * 100) : 0;
        const fully = rows.filter((r) => r.classification === 'FULLY_PAID').length;
        const part = rows.filter((r) => r.classification === 'PARTIALLY_PAID').length;
        const never = rows.filter((r) => r.classification === 'NEVER_PAID').length;
        const waivedCount = rows.filter((r) => r.classification === 'WAIVED').length;
        return {
          count: rows.length,
          expected: exp,
          collected: col,
          outstanding: out,
          waived: waiv,
          collectionRate: rate,
          fullyPaidCount: fully,
          partiallyPaidCount: part,
          neverPaidCount: never,
          waivedCount,
        };
      };

      const executivePerformance = calcGroupPerf(execRows);
      const regularPerformance = calcGroupPerf(regRows);

      const fullyPaidMembersCount = memberRows.filter((m) => m.classification === 'FULLY_PAID').length;
      const partiallyPaidMembersCount = memberRows.filter((m) => m.classification === 'PARTIALLY_PAID').length;
      const neverPaidMembersCount = memberRows.filter((m) => m.classification === 'NEVER_PAID').length;
      const waivedMembersCount = memberRows.filter((m) => m.classification === 'WAIVED').length;
      const outstandingMembersCount = memberRows.filter((m) => m.isOutstanding).length;

      // Highest & lowest collection months
      const activeMonths = monthlyBreakdown.filter((m) => m.hasPeriod && m.expected > 0);
      const sortedByCollection = [...activeMonths].sort((a, b) => b.collected - a.collected);
      const highestCollectionMonth =
        sortedByCollection.length > 0
          ? {
            month: sortedByCollection[0].month,
            monthName: sortedByCollection[0].monthName,
            amount: sortedByCollection[0].collected,
          }
          : null;
      const lowestCollectionMonth =
        sortedByCollection.length > 0
          ? {
            month: sortedByCollection[sortedByCollection.length - 1].month,
            monthName: sortedByCollection[sortedByCollection.length - 1].monthName,
            amount: sortedByCollection[sortedByCollection.length - 1].collected,
          }
          : null;

      const cumulativeTrends = monthlyBreakdown.map((mb) => ({
        month: mb.month,
        monthName: mb.monthName,
        cumulativeExpected: mb.cumulativeExpected,
        cumulativeCollected: mb.cumulativeCollected,
      }));

      return {
        year: safeYear,
        periods: periods.map((p) => ({
          id: p.id,
          year: p.year,
          month: p.month,
          label: p.label,
          defaultAmount: p.defaultAmount,
          dueDate: p.dueDate,
          status: p.status,
        })),
        members: memberRows,
        summary: {
          totalMembers: memberRows.length,
          totalExecutiveMembers: execRows.length,
          totalRegularMembers: regRows.length,
          totalExpected,
          totalCollected,
          totalOutstanding,
          totalWaived,
          collectionRate,
          fullyPaidMembersCount,
          partiallyPaidMembersCount,
          neverPaidMembersCount,
          waivedMembersCount,
          outstandingMembersCount,
          partialMembersCount: partiallyPaidMembersCount,
          zeroPaidMembersCount: neverPaidMembersCount,
          executivePerformance,
          regularPerformance,
          monthlyBreakdown,
          cumulativeTrends,
          highestCollectionMonth,
          lowestCollectionMonth,
        },
      };
    }, ['finance']);
  }
}
