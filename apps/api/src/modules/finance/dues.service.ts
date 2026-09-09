import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DuesAssignmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { money, parseDateOnly } from './finance.util';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class DuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      include: { _count: { select: { assignments: true } } },
    });
    return periods.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      label: p.label,
      defaultAmount: p.defaultAmount,
      dueDate: p.dueDate,
      status: p.status,
      assignmentCount: p._count.assignments,
    }));
  }

  async createPeriod(dto: Record<string, unknown>, actorUserId: string) {
    const year = Number(dto.year);
    const month = Number(dto.month);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new BadRequestException('Invalid year');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException('Invalid month');
    const defaultAmount = money(dto.defaultAmount, 'Default amount');
    const dueDate = parseDateOnly(dto.dueDate ?? new Date(Date.UTC(year, month, 5)), 'Due date');

    const clash = await this.prisma.duesPeriod.findUnique({ where: { year_month: { year, month } } });
    if (clash) throw new ConflictException(`Dues for ${MONTHS[month - 1]} ${year} already exist`);

    const period = await this.prisma.duesPeriod.create({
      data: { year, month, label: `${MONTHS[month - 1]} ${year}`, defaultAmount, dueDate, createdByUserId: actorUserId },
    });
    await this.audit.record({ actorUserId, action: 'DUES_PERIOD_CREATED', entity: 'DuesPeriod', entityId: period.id, newData: { label: period.label, defaultAmount } });

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
      period: { id: period.id, label: period.label, year: period.year, month: period.month, defaultAmount: period.defaultAmount, dueDate: period.dueDate, status: period.status },
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
      where: { memberId },
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
}
