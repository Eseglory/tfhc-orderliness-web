import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancePaymentMethod, PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { DuesService } from './dues.service';
import { makeReference, money, parseDateOnly } from './finance.util';

const METHODS = Object.values(FinancePaymentMethod);
const PURPOSES = Object.values(PaymentPurpose);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dues: DuesService,
  ) {}

  private parse(dto: Record<string, unknown>) {
    if (!PURPOSES.includes(dto.purpose as PaymentPurpose)) throw new BadRequestException('Invalid payment purpose');
    if (!METHODS.includes(dto.method as FinancePaymentMethod)) throw new BadRequestException('Invalid payment method');
    return {
      purpose: dto.purpose as PaymentPurpose,
      method: dto.method as FinancePaymentMethod,
      amount: money(dto.amount, 'Amount'),
      paidOn: parseDateOnly(dto.paidOn ?? new Date(), 'Payment date'),
      payerReference: dto.payerReference ? String(dto.payerReference).slice(0, 200) : null,
      description: dto.description ? String(dto.description).slice(0, 1000) : null,
      duesAssignmentId: dto.duesAssignmentId ? String(dto.duesAssignmentId) : null,
    };
  }

  private async validateDuesLink(duesAssignmentId: string | null, memberId: string, purpose: PaymentPurpose) {
    if (purpose === 'MONTHLY_DUES') {
      if (!duesAssignmentId) throw new BadRequestException('Select the dues period this payment is for');
      const assignment = await this.prisma.memberDuesAssignment.findUnique({ where: { id: duesAssignmentId } });
      if (!assignment || assignment.memberId !== memberId) throw new BadRequestException('That dues record is not yours');
    } else if (duesAssignmentId) {
      throw new BadRequestException('Only monthly dues payments link to a dues period');
    }
  }

  /** Member self-declares a payment they have made (awaits finance confirmation). */
  async declare(memberId: string | undefined, userId: string, dto: Record<string, unknown>) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can record payments');
    const p = this.parse(dto);
    await this.validateDuesLink(p.duesAssignmentId, memberId, p.purpose);

    const payment = await this.prisma.payment.create({
      data: { ...p, reference: makeReference('PMT'), memberId, status: 'PENDING' },
    });
    await this.audit.record({ actorUserId: userId, action: 'PAYMENT_DECLARED', entity: 'Payment', entityId: payment.id, newData: { amount: p.amount, purpose: p.purpose } });
    return this.getOne(payment.id, memberId, true);
  }

  /** Finance records a payment on a member's behalf (optionally auto-confirmed). */
  async record(userId: string, dto: Record<string, unknown>) {
    const memberId = String(dto.memberId ?? '');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new BadRequestException('Unknown member');
    const p = this.parse(dto);
    await this.validateDuesLink(p.duesAssignmentId, memberId, p.purpose);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          ...p,
          reference: makeReference('PMT'),
          memberId,
          recordedByUserId: userId,
          status: dto.confirm === false ? 'PENDING' : 'CONFIRMED',
          confirmedByUserId: dto.confirm === false ? null : userId,
          confirmedAt: dto.confirm === false ? null : new Date(),
        },
      });
      if (created.status === 'CONFIRMED' && created.duesAssignmentId) {
        await this.dues.applyPaymentDelta(created.duesAssignmentId, created.amount, tx);
      }
      return created;
    });
    await this.audit.record({ actorUserId: userId, action: 'PAYMENT_RECORDED', entity: 'Payment', entityId: payment.id, newData: { amount: p.amount, status: payment.status } });
    return this.getOne(payment.id, undefined, true);
  }

  async confirm(id: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') throw new BadRequestException('Only pending payments can be confirmed');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { status: 'CONFIRMED', confirmedByUserId: userId, confirmedAt: new Date(), rejectionReason: null } });
      if (payment.duesAssignmentId) await this.dues.applyPaymentDelta(payment.duesAssignmentId, payment.amount, tx);
    });
    await this.audit.record({ actorUserId: userId, action: 'PAYMENT_CONFIRMED', entity: 'Payment', entityId: id });
    return this.getOne(id, undefined, true);
  }

  async reject(id: string, userId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!['PENDING', 'CONFIRMED'].includes(payment.status)) throw new BadRequestException('This payment cannot be rejected');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason.trim().slice(0, 500) } });
      if (payment.status === 'CONFIRMED' && payment.duesAssignmentId) {
        await this.dues.applyPaymentDelta(payment.duesAssignmentId, -payment.amount, tx);
      }
    });
    await this.audit.record({ actorUserId: userId, action: 'PAYMENT_REJECTED', entity: 'Payment', entityId: id, reason });
    return this.getOne(id, undefined, true);
  }

  async list(query: { status?: string; purpose?: string; memberId?: string; from?: string; to?: string }) {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status && Object.values(PaymentStatus).includes(query.status as PaymentStatus)) where.status = query.status as PaymentStatus;
    if (query.purpose && PURPOSES.includes(query.purpose as PaymentPurpose)) where.purpose = query.purpose as PaymentPurpose;
    if (query.memberId) where.memberId = query.memberId;
    if (query.from || query.to) where.paidOn = { ...(query.from ? { gte: parseDateOnly(query.from, 'from') } : {}), ...(query.to ? { lte: parseDateOnly(query.to, 'to') } : {}) };
    const rows = await this.prisma.payment.findMany({
      where,
      include: { member: { select: { firstName: true, lastName: true, memberCode: true } }, duesAssignment: { include: { period: { select: { label: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.shape(r));
  }

  async myPayments(memberId?: string) {
    if (!memberId) return [];
    const rows = await this.prisma.payment.findMany({
      where: { memberId },
      include: { member: { select: { firstName: true, lastName: true, memberCode: true } }, duesAssignment: { include: { period: { select: { label: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  async getOne(id: string, viewerMemberId?: string, isStaff = false) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: { member: { select: { firstName: true, lastName: true, memberCode: true } }, duesAssignment: { include: { period: { select: { label: true } } } } },
    });
    if (!p) throw new NotFoundException('Payment not found');
    if (!isStaff && p.memberId !== viewerMemberId) throw new ForbiddenException('Not your payment');
    return this.shape(p);
  }

  private shape(p: {
    id: string;
    reference: string;
    memberId: string;
    purpose: string;
    amount: number;
    method: string;
    payerReference: string | null;
    description: string | null;
    paidOn: Date;
    status: string;
    rejectionReason: string | null;
    createdAt: Date;
    confirmedAt: Date | null;
    member: { firstName: string; lastName: string; memberCode: string };
    duesAssignment: { period: { label: string } } | null;
  }) {
    return {
      id: p.id,
      reference: p.reference,
      member: `${p.member.firstName} ${p.member.lastName}`.trim(),
      memberCode: p.member.memberCode,
      purpose: p.purpose,
      amount: p.amount,
      method: p.method,
      payerReference: p.payerReference,
      description: p.description,
      paidOn: p.paidOn,
      status: p.status,
      rejectionReason: p.rejectionReason,
      duesPeriod: p.duesAssignment?.period.label ?? null,
      createdAt: p.createdAt,
      confirmedAt: p.confirmedAt,
    };
  }
}
