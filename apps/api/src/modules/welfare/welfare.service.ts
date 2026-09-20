import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { PushService } from '../push/push.service';
import { makeReference } from '../finance/finance.util';
import { isEseosaGlory } from '../../common/rbac/authorization-rules';

const ENTITY = 'WelfareRequest';

export interface CreateWelfareRequestDto {
  title?: string;
  amount: number;
  currency?: string;
  purpose: string;
  requestedFor?: string;
  beneficiaryName?: string;
  requiredByDate?: string | Date;
  description?: string;
  supportingDocUrl?: string;
}

export interface DisburseWelfareDto {
  disbursementRef?: string;
  disbursementNotes?: string;
  disbursementChannel?: string;
}

@Injectable()
export class WelfareService implements OnModuleInit {
  private readonly logger = new Logger(WelfareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.approvals.registerFinalizer(ENTITY, async ({ entityId, approved, actorUserId, comment }) => {
      const existing = await this.prisma.welfareRequest.findUnique({
        where: { id: entityId },
        include: {
          requestedByMember: {
            include: { user: { select: { id: true, email: true } } },
          },
        },
      });
      if (!existing) return;

      const newStatus = approved ? 'APPROVED' : 'REJECTED';
      await this.prisma.welfareRequest.update({
        where: { id: entityId },
        data: { status: newStatus, decidedAt: new Date() },
      });

      // Send notification to the requester
      const requesterUserId = existing.requestedByMember.user?.id;
      const requesterMemberId = existing.requestedByMemberId;
      const ref = existing.reference || 'WFR';

      const title = approved
        ? `Welfare Request Approved: ${ref}`
        : `Welfare Request Rejected: ${ref}`;
      const body = approved
        ? `Your request for ₦${existing.amount.toLocaleString()} (${existing.purpose}) has been approved and is now pending disbursement.`
        : `Your request for ₦${existing.amount.toLocaleString()} was rejected.${comment ? ` Reason: ${comment}` : ''}`;

      await this.sendNotification(requesterMemberId, requesterUserId, title, body, '/member/welfare');
    });
  }

  async create(
    memberId: string | undefined,
    userId: string,
    dto: CreateWelfareRequestDto,
  ) {
    if (!memberId) throw new ForbiddenException('A member profile is required to submit a welfare request');
    const amount = Number(dto?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      throw new BadRequestException('Enter a valid amount up to 100,000,000');
    }
    if (typeof dto?.purpose !== 'string' || dto.purpose.trim().length < 3) {
      throw new BadRequestException('Describe the purpose of the request');
    }

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { user: { select: { email: true } } },
    });
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active members can submit welfare requests');
    }

    const reference = makeReference('WFR', new Date());
    const currency = (dto.currency?.trim() || 'NGN').toUpperCase().slice(0, 10);
    const requiredByDate = dto.requiredByDate ? new Date(dto.requiredByDate) : null;

    const request = await this.prisma.welfareRequest.create({
      data: {
        reference,
        title: dto.title?.trim()?.slice(0, 200) || dto.purpose.trim().slice(0, 200),
        requestedByMemberId: memberId,
        amount,
        currency,
        purpose: dto.purpose.trim().slice(0, 300),
        description: dto.description?.trim()?.slice(0, 4000) || null,
        requestedFor: dto.requestedFor?.trim()?.slice(0, 160) || null,
        beneficiaryName: dto.beneficiaryName?.trim()?.slice(0, 160) || null,
        requiredByDate: requiredByDate && !isNaN(requiredByDate.getTime()) ? requiredByDate : null,
        supportingDocUrl: dto.supportingDocUrl?.trim()?.slice(0, 1000) || null,
        status: 'PENDING',
      },
    });

    const approval = await this.approvals.open({
      requestType: 'WELFARE_FUND',
      entityType: ENTITY,
      entityId: request.id,
      summary: `Welfare (${reference}): ${request.title || request.purpose} — ₦${amount.toLocaleString()}`,
      amount,
      requestedByUserId: userId,
      requestedByMemberId: memberId,
    });

    if (approval) {
      await this.prisma.welfareRequest.update({
        where: { id: request.id },
        data: { approvalRequestId: approval.id },
      });
    }

    await this.audit.record({
      actorUserId: userId,
      action: 'WELFARE_REQUEST_CREATED',
      entity: ENTITY,
      entityId: request.id,
      newData: {
        reference,
        amount,
        currency,
        purpose: request.purpose,
        hasWorkflow: Boolean(approval),
      },
    });

    // Notify Daniel (Stage 1 approver) and Super Admin (Eseosa Glory)
    await this.notifyApproversOnSubmission(request, member);

    return this.getOne(request.id, memberId, true);
  }

  async disburse(
    id: string,
    actorUser: { userId: string; email?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
    dto: DisburseWelfareDto,
  ) {
    // Only Super Admin can disburse
    const authorized = actorUser.isSuperAdmin ||
      actorUser.permissions?.includes('*') ||
      actorUser.permissions?.includes('welfare.disburse') ||
      isEseosaGlory(actorUser.email);

    if (!authorized) {
      throw new ForbiddenException('Only the Super Admin (Platform Owner) can execute financial disbursements.');
    }

    const row = await this.prisma.welfareRequest.findUnique({
      where: { id },
      include: {
        requestedByMember: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    if (!row) throw new NotFoundException('Welfare request not found');

    if (row.status !== 'APPROVED') {
      throw new BadRequestException(
        `Only approved requests can be disbursed. Current status: ${row.status}`,
      );
    }

    if (row.disbursedAt) {
      throw new ConflictException('This welfare request has already been disbursed.');
    }

    const disbursementRef = dto.disbursementRef?.trim() || makeReference('DISB', new Date());
    const disbursementNotes = dto.disbursementNotes?.trim() || null;
    const disbursementChannel = dto.disbursementChannel?.trim() || 'BANK_TRANSFER';

    const updated = await this.prisma.welfareRequest.update({
      where: { id },
      data: {
        disbursedAt: new Date(),
        disbursedByUserId: actorUser.userId,
        disbursementRef,
        disbursementNotes,
        disbursementChannel,
      },
    });

    await this.audit.record({
      actorUserId: actorUser.userId,
      action: 'WELFARE_REQUEST_DISBURSED',
      entity: ENTITY,
      entityId: id,
      newData: {
        reference: row.reference,
        amount: row.amount,
        currency: row.currency,
        disbursementRef,
        disbursementChannel,
      },
    });

    // Notify requester (Loveth)
    const requesterUserId = row.requestedByMember.user?.id;
    const requesterMemberId = row.requestedByMemberId;
    await this.sendNotification(
      requesterMemberId,
      requesterUserId,
      `Welfare Funds Disbursed: ${row.reference}`,
      `Funds of ₦${row.amount.toLocaleString()} for request ${row.reference} have been disbursed (Ref: ${disbursementRef}).`,
      '/member/welfare',
    );

    return this.getOne(id, undefined, true);
  }

  async listMine(memberId?: string) {
    if (!memberId) return [];
    const rows = await this.prisma.welfareRequest.findMany({
      where: { requestedByMemberId: memberId },
      orderBy: { createdAt: 'desc' },
      include: { requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } } },
    });
    return Promise.all(rows.map((r) => this.decorate(r)));
  }

  async list(status?: string) {
    const rows = await this.prisma.welfareRequest.findMany({
      where: status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)
        ? { status: status as never }
        : {},
      orderBy: { createdAt: 'desc' },
      include: { requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } } },
    });
    return Promise.all(
      rows.map(async (r) => ({
        ...(await this.decorate(r)),
        requester: `${r.requestedByMember.firstName} ${r.requestedByMember.lastName}`.trim(),
        memberCode: r.requestedByMember.memberCode,
      })),
    );
  }

  async getOne(id: string, viewerMemberId?: string, isStaff = false) {
    const row = await this.prisma.welfareRequest.findUnique({
      where: { id },
      include: { requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } } },
    });
    if (!row) throw new NotFoundException('Welfare request not found');
    if (!isStaff && row.requestedByMemberId !== viewerMemberId) throw new ForbiddenException('Not your request');
    return {
      ...(await this.decorate(row)),
      requester: `${row.requestedByMember.firstName} ${row.requestedByMember.lastName}`.trim(),
      memberCode: row.requestedByMember.memberCode,
    };
  }

  private async decorate(r: {
    id: string;
    reference: string | null;
    title: string | null;
    amount: number;
    currency: string;
    purpose: string;
    description: string | null;
    requestedFor: string | null;
    beneficiaryName: string | null;
    requiredByDate: Date | null;
    supportingDocUrl: string | null;
    status: string;
    approvalRequestId: string | null;
    decidedAt: Date | null;
    disbursedAt: Date | null;
    disbursedByUserId: string | null;
    disbursementRef: string | null;
    disbursementNotes: string | null;
    disbursementChannel: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const approval = r.approvalRequestId ? await this.approvals.getById(r.approvalRequestId).catch(() => null) : null;
    
    // Derive human-readable stage status
    let stageStatus = r.status;
    if (r.status === 'PENDING' && approval) {
      if (approval.currentStepOrder === 1) {
        stageStatus = 'PENDING_DANIEL_APPROVAL';
      } else if (approval.currentStepOrder === 2) {
        stageStatus = 'PENDING_SUPER_ADMIN_APPROVAL';
      }
    } else if (r.status === 'APPROVED' && !r.disbursedAt) {
      stageStatus = 'PENDING_DISBURSEMENT';
    } else if (r.disbursedAt) {
      stageStatus = 'DISBURSED';
    }

    return {
      id: r.id,
      reference: r.reference || `WFR-${r.id.slice(0, 8).toUpperCase()}`,
      title: r.title || r.purpose,
      amount: r.amount,
      currency: r.currency || 'NGN',
      purpose: r.purpose,
      description: r.description,
      requestedFor: r.requestedFor,
      beneficiaryName: r.beneficiaryName,
      requiredByDate: r.requiredByDate,
      supportingDocUrl: r.supportingDocUrl,
      status: r.status,
      stageStatus,
      isDisbursed: Boolean(r.disbursedAt),
      disbursedAt: r.disbursedAt,
      disbursedByUserId: r.disbursedByUserId,
      disbursementRef: r.disbursementRef,
      disbursementNotes: r.disbursementNotes,
      disbursementChannel: r.disbursementChannel,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      approval,
    };
  }

  private async notifyApproversOnSubmission(
    request: { id: string; reference: string; amount: number; purpose: string; title: string | null },
    requesterMember: { firstName: string; lastName: string },
  ) {
    try {
      // Find Daniel (Stage 1 approver)
      const daniel = await this.prisma.user.findFirst({
        where: { email: { equals: 'danoguamanam@gmail.com', mode: 'insensitive' } },
        include: { member: true },
      });
      if (daniel?.member?.id) {
        await this.sendNotification(
          daniel.member.id,
          daniel.id,
          `New Welfare Request: ${request.reference}`,
          `${requesterMember.firstName} ${requesterMember.lastName} submitted request for ₦${request.amount.toLocaleString()} requiring your review.`,
          '/admin/approvals?tab=queue',
        );
      }

      // Find Super Admin (Eseosa Glory)
      const eseosa = await this.prisma.user.findFirst({
        where: { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } },
        include: { member: true },
      });
      if (eseosa?.member?.id) {
        await this.sendNotification(
          eseosa.member.id,
          eseosa.id,
          `Welfare Request Submitted: ${request.reference}`,
          `${requesterMember.firstName} ${requesterMember.lastName} submitted a welfare request for ₦${request.amount.toLocaleString()} (Stage 1: Daniel review).`,
          '/admin/welfare',
        );
      }
    } catch (e) {
      this.logger.warn('Failed to notify approvers on submission', e as Error);
    }
  }

  private async sendNotification(
    memberId: string,
    userId: string | undefined,
    title: string,
    body: string,
    url: string,
  ) {
    try {
      await this.prisma.memberNotification.create({
        data: {
          memberId,
          type: 'WELFARE',
          title,
          body,
          data: { url },
        },
      });

      if (userId) {
        await this.push.sendDirectPush(userId, { title, body, url });
      }
    } catch (e) {
      this.logger.warn(`Failed to dispatch notification to member ${memberId}`, e as Error);
    }
  }
}
