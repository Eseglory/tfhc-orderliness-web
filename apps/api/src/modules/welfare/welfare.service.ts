import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';

const ENTITY = 'WelfareRequest';

@Injectable()
export class WelfareService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.approvals.registerFinalizer(ENTITY, async ({ entityId, approved }) => {
      await this.prisma.welfareRequest.update({
        where: { id: entityId },
        data: { status: approved ? 'APPROVED' : 'REJECTED', decidedAt: new Date() },
      });
    });
  }

  async create(
    memberId: string | undefined,
    userId: string,
    dto: { amount: number; purpose: string; description?: string; beneficiaryName?: string; supportingDocUrl?: string },
  ) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const amount = Number(dto?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new BadRequestException('Enter a valid amount');
    if (typeof dto?.purpose !== 'string' || dto.purpose.trim().length < 3) throw new BadRequestException('Describe the purpose of the request');

    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can submit welfare requests');

    const request = await this.prisma.welfareRequest.create({
      data: {
        requestedByMemberId: memberId,
        amount,
        purpose: dto.purpose.trim().slice(0, 300),
        description: dto.description?.trim()?.slice(0, 4000) || null,
        beneficiaryName: dto.beneficiaryName?.trim()?.slice(0, 160) || null,
        supportingDocUrl: dto.supportingDocUrl?.trim()?.slice(0, 1000) || null,
      },
    });

    const approval = await this.approvals.open({
      requestType: 'WELFARE_FUND',
      entityType: ENTITY,
      entityId: request.id,
      summary: `Welfare: ${request.purpose} — ₦${amount.toLocaleString()}`,
      amount,
      requestedByUserId: userId,
      requestedByMemberId: memberId,
    });
    if (approval) {
      await this.prisma.welfareRequest.update({ where: { id: request.id }, data: { approvalRequestId: approval.id } });
    }

    await this.audit.record({
      actorUserId: userId,
      action: 'WELFARE_REQUEST_CREATED',
      entity: ENTITY,
      entityId: request.id,
      newData: { amount, purpose: request.purpose, hasWorkflow: Boolean(approval) },
    });

    return this.getOne(request.id, memberId, true);
  }

  async listMine(memberId?: string) {
    if (!memberId) return [];
    const rows = await this.prisma.welfareRequest.findMany({
      where: { requestedByMemberId: memberId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.decorate(r)));
  }

  async list(status?: string) {
    const rows = await this.prisma.welfareRequest.findMany({
      where: status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status) ? { status: status as never } : {},
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

  private async decorate(r: { id: string; amount: number; purpose: string; description: string | null; beneficiaryName: string | null; status: string; approvalRequestId: string | null; createdAt: Date; decidedAt: Date | null }) {
    const approval = r.approvalRequestId ? await this.approvals.getById(r.approvalRequestId).catch(() => null) : null;
    return {
      id: r.id,
      amount: r.amount,
      purpose: r.purpose,
      description: r.description,
      beneficiaryName: r.beneficiaryName,
      status: r.status,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      approval,
    };
  }
}
