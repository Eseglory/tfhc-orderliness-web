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
  ) {}

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
      where: { status: { in: ['ACTIVE', 'NEW_MEMBER'] } },
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
    const rows = await this.prisma.memberDuesAssignment.findMany({
      where: { memberId, period: { type: 'MONTHLY' } },
      include: { period: true },
      orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
    });
    return rows.map((a) => ({
      id: a.id,
      period: a.period.label,
      periodId: a.periodId,
      amountDue: a.amountDue,
      amountPaid: a.amountPaid,
      balance: Math.max(0, Math.round((a.amountDue - a.amountPaid) * 100) / 100),
      dueDate: a.period.dueDate,
      status: this.effective(a.status, a.period.dueDate),
    }));
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

      const periodMap = new Map<number, typeof periods[0]>();
      for (const p of periods) {
        periodMap.set(p.month, p);
      }

      const periodIds = periods.map((p) => p.id);

      // 2. Get all members who have an approved directory entry or active ecclesiastical status
      const members = await this.prisma.member.findMany({
        where: {
          OR: [
            { approvedMember: { isNot: null } },
            { status: { in: ['ACTIVE', 'NEW_MEMBER'] } },
          ],
        },
        include: {
          approvedMember: { select: { email: true } },
          user: { select: { email: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });

      // 3. Get all dues assignments for this year
      const assignments = periodIds.length > 0 ? await this.prisma.memberDuesAssignment.findMany({
        where: { periodId: { in: periodIds } },
        include: {
          period: true,
        },
      }) : [];

      // Map: memberId -> monthNumber -> assignment
      const memberAssignmentMap = new Map<string, Map<number, typeof assignments[0]>>();
      for (const a of assignments) {
        if (!memberAssignmentMap.has(a.memberId)) {
          memberAssignmentMap.set(a.memberId, new Map());
        }
        memberAssignmentMap.get(a.memberId)!.set(a.period.month, a);
      }

      // 4. Build Member Matrix Rows
      const memberRows = members.map((m) => {
        const name = `${m.firstName || ''} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName || ''}`.trim() || 'Church Member';
        const email = m.approvedMember?.email || m.user?.email || null;
        const phone = m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : null;

        const mAssignments = memberAssignmentMap.get(m.id) || new Map();
        let totalExpected = 0;
        let totalPaid = 0;
        let monthsPaidCount = 0;
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
              dueDate: null,
            };
          }

          if (!assignment) {
            return {
              month: monthNum,
              monthName: MONTHS[i],
              periodId: period.id,
              assignmentId: null,
              amountDue: period.defaultAmount,
              amountPaid: 0,
              balance: period.defaultAmount,
              status: 'NOT_ASSIGNED',
              dueDate: period.dueDate,
            };
          }

          const effectiveStatus = this.effective(assignment.status, period.dueDate);
          const amountDue = assignment.amountDue;
          const amountPaid = assignment.amountPaid;
          const balance = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);

          if (!['EXEMPT', 'WAIVED'].includes(effectiveStatus)) {
            totalExpected += amountDue;
            totalPaid += amountPaid;
            assignedMonthsCount++;
            if (effectiveStatus === 'PAID') {
              monthsPaidCount++;
            }
          }

          return {
            month: monthNum,
            monthName: MONTHS[i],
            periodId: period.id,
            assignmentId: assignment.id,
            amountDue,
            amountPaid,
            balance,
            status: effectiveStatus,
            storedStatus: assignment.status,
            dueDate: period.dueDate,
          };
        });

        const overallBalance = Math.max(0, Math.round((totalExpected - totalPaid) * 100) / 100);
        const overallStatus =
          assignedMonthsCount === 0
            ? 'NO_ASSIGNMENT'
            : monthsPaidCount === assignedMonthsCount
            ? 'FULLY_PAID'
            : totalPaid > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

        return {
          memberId: m.id,
          memberCode: m.memberCode,
          name,
          email,
          phone,
          status: m.status,
          totalExpected: Math.round(totalExpected * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          balance: overallBalance,
          overallStatus,
          assignedMonthsCount,
          monthsPaidCount,
          months,
        };
      });

      // 5. Monthly Breakdown KPIs
      const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const period = periodMap.get(monthNum);
        const monthAssignments = assignments.filter((a) => a.period.month === monthNum);

        let expected = 0;
        let collected = 0;
        let paidCount = 0;
        let partialCount = 0;
        let overdueCount = 0;
        let outstandingCount = 0;

        if (period) {
          for (const a of monthAssignments) {
            const st = this.effective(a.status, period.dueDate);
            if (!['EXEMPT', 'WAIVED'].includes(st)) {
              expected += a.amountDue;
              collected += a.amountPaid;
            }
            if (st === 'PAID') paidCount++;
            else if (st === 'PARTIALLY_PAID') partialCount++;
            else if (st === 'OVERDUE') overdueCount++;
            else if (st === 'OUTSTANDING') outstandingCount++;
          }
        }

        const outstanding = Math.max(0, Math.round((expected - collected) * 100) / 100);
        const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

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
          collectionRate,
          paidCount,
          partialCount,
          overdueCount,
          outstandingCount,
          totalAssigned: monthAssignments.length,
        };
      });

      // 6. Annual Overall KPIs
      const totalExpected = memberRows.reduce((sum, m) => sum + m.totalExpected, 0);
      const totalCollected = memberRows.reduce((sum, m) => sum + m.totalPaid, 0);
      const totalOutstanding = Math.max(0, Math.round((totalExpected - totalCollected) * 100) / 100);
      const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

      const fullyPaidMembersCount = memberRows.filter((m) => m.assignedMonthsCount > 0 && m.monthsPaidCount === m.assignedMonthsCount).length;
      const zeroPaidMembersCount = memberRows.filter((m) => m.assignedMonthsCount > 0 && m.totalPaid === 0).length;
      const partialMembersCount = memberRows.length - fullyPaidMembersCount - zeroPaidMembersCount;

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
          totalMembers: members.length,
          totalExpected,
          totalCollected,
          totalOutstanding,
          collectionRate,
          fullyPaidMembersCount,
          partialMembersCount,
          zeroPaidMembersCount,
          monthlyBreakdown,
        },
      };
    }, ['finance']);
  }
}
