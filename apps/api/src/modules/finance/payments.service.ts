import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancePaymentMethod, PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { DuesService } from './dues.service';
import { ReceiptStorageService } from './receipt-storage.service';
import { makeReference, money, parseDateOnly } from './finance.util';

const METHODS = Object.values(FinancePaymentMethod);
const PURPOSES = Object.values(PaymentPurpose);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dues: DuesService,
    private readonly receiptStorage: ReceiptStorageService,
  ) {}

  private async parse(dto: Record<string, unknown>) {
    if (!dto || typeof dto !== 'object') throw new BadRequestException('Invalid payload');
    if (!dto.purpose || !PURPOSES.includes(dto.purpose as PaymentPurpose)) {
      throw new BadRequestException(`Purpose must be one of: ${PURPOSES.join(', ')}`);
    }
    if (!dto.method || !METHODS.includes(dto.method as FinancePaymentMethod)) {
      throw new BadRequestException(`Method must be one of: ${METHODS.join(', ')}`);
    }

    let metadata: Record<string, unknown> | undefined =
      dto.metadata && typeof dto.metadata === 'object' ? (dto.metadata as Record<string, unknown>) : undefined;

    if (!metadata && dto.receiptUrl) {
      const optimized = await this.receiptStorage.validateAndOptimizeReceipt(
        String(dto.receiptUrl),
        String(dto.receiptName || 'Receipt'),
        String(dto.purpose || 'PAYMENT'),
      );
      metadata = {
        ...optimized,
      };
    }

    return {
      purpose: dto.purpose as PaymentPurpose,
      method: dto.method as FinancePaymentMethod,
      amount: money(dto.amount, 'Amount'),
      paidOn: parseDateOnly(dto.paidOn ?? new Date(), 'Payment date'),
      payerReference: dto.payerReference ? String(dto.payerReference).slice(0, 200) : null,
      description: dto.description ? String(dto.description).slice(0, 1000) : null,
      duesAssignmentId: dto.duesAssignmentId ? String(dto.duesAssignmentId) : null,
      ...(metadata !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    };
  }

  private async validateDuesLink(duesAssignmentId: string | null, memberId: string, purpose: PaymentPurpose) {
    if (purpose === 'MONTHLY_DUES' || purpose === 'SPECIAL_CONTRIBUTION') {
      if (!duesAssignmentId) throw new BadRequestException('Select the dues record this payment is for');
      const assignment = await this.prisma.memberDuesAssignment.findUnique({ where: { id: duesAssignmentId }, include: { period: true } });
      if (!assignment || assignment.memberId !== memberId) throw new BadRequestException('That dues record is not yours');
      const expectedType = purpose === 'MONTHLY_DUES' ? 'MONTHLY' : 'SPECIAL';
      if (assignment.period.type !== expectedType) throw new BadRequestException('Payment purpose does not match this dues record');
      if (assignment.amountPaid >= assignment.amountDue || assignment.status === 'PAID') {
        throw new BadRequestException('This dues contribution is already fully settled');
      }
    } else if (duesAssignmentId) {
      throw new BadRequestException('Only dues payments link to a dues period');
    }
  }

  /** Member self-declares a payment they have made (awaits finance confirmation). */
  async declare(memberId: string | undefined, userId: string, dto: Record<string, unknown>) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can record payments');
    const p = await this.parse(dto);
    await this.validateDuesLink(p.duesAssignmentId, memberId, p.purpose);

    // Prevent duplicate payment creation when members resubmit receipts for the same dues period
    if (p.duesAssignmentId) {
      const assignment = await this.prisma.memberDuesAssignment.findUnique({
        where: { id: p.duesAssignmentId },
        include: { period: true, payments: true },
      });
      if (!assignment) throw new BadRequestException('Dues assignment not found');

      const isChristmas = /christmas/i.test(assignment.period.label);
      const confirmedPayments = assignment.payments.filter((x) => x.status === 'CONFIRMED');
      const remainingBalance = Math.max(0, Math.round((assignment.amountDue - assignment.amountPaid) * 100) / 100);

      if (p.amount > remainingBalance) {
        throw new BadRequestException(
          `Claimed amount (₦${Math.round(p.amount).toLocaleString()}) cannot exceed the outstanding balance of ₦${Math.round(remainingBalance).toLocaleString()}`
        );
      }

      const existingPending = assignment.payments.find((x) => x.status === 'PENDING');

      if (existingPending) {
        const existingMeta = (existingPending.metadata && typeof existingPending.metadata === 'object'
          ? existingPending.metadata
          : {}) as Record<string, unknown>;
        const updatedMeta = {
          ...existingMeta,
          ...(p.metadata !== undefined && typeof p.metadata === 'object' ? p.metadata : {}),
          claimedAmount: p.amount,
        };
        const updated = await this.prisma.payment.update({
          where: { id: existingPending.id },
          data: {
            amount: p.amount,
            method: p.method,
            paidOn: p.paidOn,
            payerReference: p.payerReference,
            description: p.description,
            metadata: updatedMeta as Prisma.InputJsonValue,
          },
        });
        await this.audit.record({
          actorUserId: userId,
          action: 'PAYMENT_UPDATED',
          entity: 'Payment',
          entityId: updated.id,
          newData: { amount: p.amount, purpose: p.purpose, resubmitted: true },
        });
        return this.getOne(updated.id, memberId, true);
      }
    }

    const metaObj = {
      ...(p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : {}),
      claimedAmount: p.amount,
    };

    const payment = await this.prisma.payment.create({
      data: {
        ...p,
        metadata: metaObj as Prisma.InputJsonValue,
        reference: makeReference('PMT'),
        memberId,
        status: 'PENDING',
      },
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'PAYMENT_DECLARED',
      entity: 'Payment',
      entityId: payment.id,
      newData: { amount: p.amount, purpose: p.purpose },
    });
    return this.getOne(payment.id, memberId, true);
  }

  /** Finance records a payment on a member's behalf (optionally auto-confirmed). */
  async record(userId: string, dto: Record<string, unknown>) {
    const memberId = String(dto.memberId ?? '');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new BadRequestException('Unknown member');
    const p = await this.parse(dto);
    await this.validateDuesLink(p.duesAssignmentId, memberId, p.purpose);

    const payment = await this.prisma.$transaction(async (tx) => {
      const metaObj = {
        ...(p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : {}),
        claimedAmount: p.amount,
        confirmedAmount: dto.confirm === false ? null : p.amount,
      };

      const created = await tx.payment.create({
        data: {
          ...p,
          metadata: metaObj as Prisma.InputJsonValue,
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
    await this.audit.record({
      actorUserId: userId,
      action: 'PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: payment.id,
      newData: { amount: p.amount, status: payment.status },
    });
    return this.getOne(payment.id, undefined, true);
  }

  async confirm(id: string, userId: string, dto?: { confirmedAmount?: number; adminNote?: string }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { duesAssignment: { include: { period: true } }, member: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') throw new BadRequestException('Only pending payments can be confirmed');

    const meta = (payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {}) as Record<string, unknown>;
    const originalClaimedAmount = typeof meta.claimedAmount === 'number' ? meta.claimedAmount : payment.amount;

    const amountToConfirm =
      dto?.confirmedAmount !== undefined ? money(dto.confirmedAmount, 'Confirmed amount') : payment.amount;
    if (amountToConfirm <= 0) {
      throw new BadRequestException('Confirmed amount must be greater than zero');
    }

    const isAdjusted = amountToConfirm !== originalClaimedAmount;
    const adminNote = dto?.adminNote?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      if (payment.duesAssignmentId && payment.duesAssignment) {
        const assignment = payment.duesAssignment;
        const otherConfirmed = await tx.payment.findMany({
          where: {
            duesAssignmentId: payment.duesAssignmentId,
            status: 'CONFIRMED',
            id: { not: id },
          },
        });

        const otherSum = otherConfirmed.reduce((s, p) => s + p.amount, 0);
        if (otherSum + amountToConfirm > assignment.amountDue) {
          throw new BadRequestException(
            `Confirmed payment of ₦${Math.round(amountToConfirm).toLocaleString()} would cause total confirmed payments (₦${Math.round(otherSum + amountToConfirm).toLocaleString()}) to exceed the total contribution payable of ₦${Math.round(assignment.amountDue).toLocaleString()}`
          );
        }

        const updatedMeta = {
          ...meta,
          claimedAmount: originalClaimedAmount,
          confirmedAmount: amountToConfirm,
          isAdjusted,
          adminNote,
          ...(isAdjusted
            ? {
                adjustedByUserId: userId,
                adjustedAt: new Date().toISOString(),
                adminAdjustmentNote: adminNote || 'Amount adjusted by administrator based on receipt verification',
              }
            : {}),
        };

        const changed = await tx.payment.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            amount: amountToConfirm,
            status: 'CONFIRMED',
            confirmedByUserId: userId,
            confirmedAt: new Date(),
            rejectionReason: null,
            metadata: updatedMeta as Prisma.InputJsonValue,
          },
        });
        if (changed.count !== 1) {
          throw new BadRequestException('Payment changed while it was being confirmed; refresh and retry');
        }

        const totalPaid = Math.round((otherSum + amountToConfirm) * 100) / 100;
        const status = totalPaid >= assignment.amountDue ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'OUTSTANDING';

        await tx.memberDuesAssignment.update({
          where: { id: payment.duesAssignmentId },
          data: { amountPaid: totalPaid, status },
        });

        // Notify member with clear financial position
        const remaining = Math.max(0, Math.round((assignment.amountDue - totalPaid) * 100) / 100);
        await tx.memberNotification.create({
          data: {
            memberId: payment.memberId,
            type: 'FINANCE',
            title: isAdjusted
              ? `Payment Confirmed with Adjustment: ₦${Math.round(amountToConfirm).toLocaleString()}`
              : `Payment Confirmed: ₦${Math.round(amountToConfirm).toLocaleString()}`,
            body: isAdjusted
              ? `Your payment for ${assignment.period.label} was confirmed at ₦${Math.round(amountToConfirm).toLocaleString()} (claimed: ₦${Math.round(originalClaimedAmount).toLocaleString()}). Remaining balance: ₦${Math.round(remaining).toLocaleString()}.${adminNote ? ` Admin note: ${adminNote}` : ''}`
              : `Your payment of ₦${Math.round(amountToConfirm).toLocaleString()} for ${assignment.period.label} has been confirmed. Remaining balance: ₦${Math.round(remaining).toLocaleString()}.${adminNote ? ` Note: ${adminNote}` : ''}`,
            data: { paymentId: id, reference: payment.reference, duesAssignmentId: payment.duesAssignmentId },
          },
        });
      } else {
        const updatedMeta = {
          ...meta,
          claimedAmount: originalClaimedAmount,
          confirmedAmount: amountToConfirm,
          isAdjusted,
          adminNote,
          ...(isAdjusted
            ? {
                adjustedByUserId: userId,
                adjustedAt: new Date().toISOString(),
                adminAdjustmentNote: adminNote || 'Amount adjusted by administrator',
              }
            : {}),
        };

        const changed = await tx.payment.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            amount: amountToConfirm,
            status: 'CONFIRMED',
            confirmedByUserId: userId,
            confirmedAt: new Date(),
            rejectionReason: null,
            metadata: updatedMeta as Prisma.InputJsonValue,
          },
        });
        if (changed.count !== 1) {
          throw new BadRequestException('Payment changed while it was being confirmed; refresh and retry');
        }

        await tx.memberNotification.create({
          data: {
            memberId: payment.memberId,
            type: 'FINANCE',
            title: isAdjusted
              ? `Payment Confirmed with Adjustment: ₦${Math.round(amountToConfirm).toLocaleString()}`
              : `Payment Confirmed: ₦${Math.round(amountToConfirm).toLocaleString()}`,
            body: isAdjusted
              ? `Your payment was confirmed at ₦${Math.round(amountToConfirm).toLocaleString()} (claimed: ₦${Math.round(originalClaimedAmount).toLocaleString()}).${adminNote ? ` Admin note: ${adminNote}` : ''}`
              : `Your payment of ₦${Math.round(amountToConfirm).toLocaleString()} has been confirmed.${adminNote ? ` Note: ${adminNote}` : ''}`,
            data: { paymentId: id, reference: payment.reference },
          },
        });
      }
    });

    await this.audit.record({
      actorUserId: userId,
      action: isAdjusted ? 'PAYMENT_CONFIRMED_ADJUSTED' : 'PAYMENT_CONFIRMED',
      entity: 'Payment',
      entityId: id,
      reason: adminNote || undefined,
      newData: {
        originalClaimedAmount,
        confirmedAmount: amountToConfirm,
        isAdjusted,
        adminNote,
        decision: 'CONFIRMED',
      },
    });

    return this.getOne(id, undefined, true);
  }

  async reject(id: string, userId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { duesAssignment: { include: { period: true } }, member: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!['PENDING', 'CONFIRMED'].includes(payment.status)) throw new BadRequestException('This payment cannot be rejected');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');

    const meta = (payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {}) as Record<string, unknown>;
    const updatedMeta = {
      ...meta,
      rejectionReason: reason.trim().slice(0, 500),
      rejectedByUserId: userId,
      rejectedAt: new Date().toISOString(),
    };

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: { id, status: payment.status },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim().slice(0, 500),
          metadata: updatedMeta as Prisma.InputJsonValue,
        },
      });
      if (changed.count !== 1) throw new BadRequestException('Payment changed while it was being rejected; refresh and retry');
      if (payment.status === 'CONFIRMED' && payment.duesAssignmentId) {
        await this.dues.applyPaymentDelta(payment.duesAssignmentId, -payment.amount, tx);
      }

      await tx.memberNotification.create({
        data: {
          memberId: payment.memberId,
          type: 'FINANCE',
          title: 'Payment Submission Rejected',
          body: `Your payment of ₦${Math.round(payment.amount).toLocaleString()} (${payment.reference}) was rejected. Reason: ${reason.trim()}`,
          data: { paymentId: id, reference: payment.reference, duesAssignmentId: payment.duesAssignmentId },
        },
      });
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'PAYMENT_REJECTED',
      entity: 'Payment',
      entityId: id,
      reason,
      newData: { decision: 'REJECTED', amount: payment.amount, rejectionReason: reason },
    });
    return this.getOne(id, undefined, true);
  }

  async list(query: { status?: string; purpose?: string; memberId?: string; from?: string; to?: string; search?: string }) {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status && Object.values(PaymentStatus).includes(query.status as PaymentStatus)) where.status = query.status as PaymentStatus;
    if (query.purpose && PURPOSES.includes(query.purpose as PaymentPurpose)) where.purpose = query.purpose as PaymentPurpose;
    if (query.memberId) where.memberId = query.memberId;
    if (query.from || query.to) where.paidOn = { ...(query.from ? { gte: parseDateOnly(query.from, 'from') } : {}), ...(query.to ? { lte: parseDateOnly(query.to, 'to') } : {}) };
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { payerReference: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { member: { firstName: { contains: q, mode: 'insensitive' } } },
        { member: { lastName: { contains: q, mode: 'insensitive' } } },
        { member: { memberCode: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.payment.findMany({
      where,
      include: {
        member: { select: { firstName: true, lastName: true, memberCode: true } },
        duesAssignment: { include: { period: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.shape(r));
  }

  async myPayments(memberId?: string) {
    if (!memberId) return [];
    const rows = await this.prisma.payment.findMany({
      where: { memberId },
      include: {
        member: { select: { firstName: true, lastName: true, memberCode: true } },
        duesAssignment: { include: { period: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  async getOne(id: string, viewerMemberId?: string, isStaff = false) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        member: { select: { firstName: true, lastName: true, memberCode: true } },
        duesAssignment: { include: { period: true } },
      },
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
    metadata?: Prisma.JsonValue | null;
    createdAt: Date;
    confirmedAt: Date | null;
    member: { firstName: string; lastName: string; memberCode: string };
    duesAssignment: { period: { label: string }; amountDue?: number; amountPaid?: number; status?: string } | null;
  }) {
    const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null;
    const isPurged = Boolean(meta?.isPurged);
    const retentionStatus = (meta?.retentionStatus as string) || (isPurged ? 'PURGED' : 'ACTIVE');
    const purgeReason = (meta?.purgeReason as string) || null;
    const retentionUntil = (meta?.retentionUntil as string) || null;
    const originalSize = typeof meta?.originalSize === 'number' ? meta.originalSize : null;
    const optimizedSize = typeof meta?.optimizedSize === 'number' ? meta.optimizedSize : null;
    const compressionRatio = typeof meta?.compressionRatio === 'number' ? meta.compressionRatio : null;
    const claimedAmount = typeof meta?.claimedAmount === 'number' ? meta.claimedAmount : p.amount;
    const confirmedAmount = p.status === 'CONFIRMED' ? p.amount : null;
    const isAdjusted = Boolean(meta?.isAdjusted);
    const adminNote = (meta?.adminNote as string) || (meta?.adminAdjustmentNote as string) || null;
    const amountPayable = p.duesAssignment?.amountDue ?? null;
    const amountPaid = p.status === 'CONFIRMED' ? p.amount : 0;
    const assignmentStatus = p.duesAssignment?.status ?? null;
    const assignmentBalance = p.duesAssignment && p.duesAssignment.amountDue !== undefined && p.duesAssignment.amountPaid !== undefined
      ? Math.max(0, Math.round((p.duesAssignment.amountDue - p.duesAssignment.amountPaid) * 100) / 100)
      : null;

    return {
      id: p.id,
      reference: p.reference,
      member: `${p.member.firstName} ${p.member.lastName}`.trim(),
      memberCode: p.member.memberCode,
      purpose: p.purpose,
      amount: p.amount,
      amountPayable,
      amountPaid,
      claimedAmount,
      confirmedAmount,
      isAdjusted,
      adminNote,
      assignmentStatus,
      assignmentBalance,
      method: p.method,
      payerReference: p.payerReference,
      description: p.description,
      paidOn: p.paidOn,
      status: p.status,
      rejectionReason: p.rejectionReason,
      duesPeriod: p.duesAssignment?.period?.label ?? null,
      duesAssignmentId: (p as any).duesAssignmentId ?? null,
      receiptUrl: (meta?.receiptUrl as string) || null,
      receiptName: (meta?.receiptName as string) || null,
      isReceiptArchived: isPurged,
      receiptArchivedReason: purgeReason,
      receiptRetentionUntil: retentionUntil,
      receiptRetentionStatus: retentionStatus,
      receiptOriginalSize: originalSize,
      receiptOptimizedSize: optimizedSize,
      receiptCompressionRatio: compressionRatio,
      metadata: p.metadata ?? null,
      createdAt: p.createdAt,
      confirmedAt: p.confirmedAt,
    };
  }
}
