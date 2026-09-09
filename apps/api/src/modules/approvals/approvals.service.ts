import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalDecision, ApprovalRequestType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { SYSTEM_ROLE, LEGACY_ROLE_FALLBACK } from '@tfhc/shared';

/** Legacy enum roles (no explicit grants) that satisfy an access-role step. */
const LEGACY_KEYS_FOR = (roleKey: string): string[] =>
  Object.entries(LEGACY_ROLE_FALLBACK)
    .filter(([, fallback]) => fallback === roleKey || fallback === SYSTEM_ROLE.SUPER_ADMIN)
    .map(([enumRole]) => enumRole);

export interface OpenApprovalInput {
  requestType: ApprovalRequestType;
  entityType: string;
  entityId: string;
  summary: string;
  amount?: number | null;
  requestedByUserId?: string | null;
  requestedByMemberId?: string | null;
  /** Pin a specific workflow; otherwise the active one for the request type. */
  workflowKey?: string;
}

/** Called when a request reaches a terminal state. */
export type Finalizer = (ctx: {
  entityId: string;
  approved: boolean;
  requestId: string;
  actorUserId: string;
  /** The deciding action's comment, if any. */
  comment: string | null;
}) => Promise<void>;

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private readonly finalizers = new Map<string, Finalizer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Domain modules register a callback for their entity type on module init. */
  registerFinalizer(entityType: string, fn: Finalizer) {
    this.finalizers.set(entityType, fn);
  }

  // -------------------------------------------------------------------------

  async activeWorkflow(requestType: ApprovalRequestType, workflowKey?: string) {
    return this.prisma.approvalWorkflow.findFirst({
      where: workflowKey ? { key: workflowKey } : { requestType, active: true },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Create a pending request at step 1. Returns null if no workflow is configured. */
  async open(input: OpenApprovalInput) {
    const workflow = await this.activeWorkflow(input.requestType, input.workflowKey);
    if (!workflow || workflow.steps.length === 0) return null;

    return this.prisma.approvalRequest.create({
      data: {
        workflowId: workflow.id,
        requestType: input.requestType,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary.slice(0, 500),
        amount: input.amount ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByMemberId: input.requestedByMemberId ?? null,
        currentStepOrder: workflow.steps[0].order,
      },
      include: { workflow: { include: { steps: { orderBy: { order: 'asc' } } } }, actions: true },
    });
  }

  private async approverUserIds(step: {
    approverMode: string;
    roleKey: string | null;
    approverUserId: string | null;
    permission: string | null;
  }): Promise<Set<string>> {
    if (step.approverMode === 'SPECIFIC_USER') {
      return new Set(step.approverUserId ? [step.approverUserId] : []);
    }
    if (step.approverMode === 'ROLE' && step.roleKey) {
      const grants = await this.prisma.userAccessRole.findMany({
        // Super Admins can always act on any role step.
        where: {
          user: { isActive: true },
          role: { key: { in: [step.roleKey, SYSTEM_ROLE.SUPER_ADMIN] } },
        },
        select: { userId: true },
      });
      // Transition safety: enum-role accounts with no explicit grants.
      const legacy = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: LEGACY_KEYS_FOR(step.roleKey) as Role[] }, accessRoles: { none: {} } },
        select: { id: true },
      });
      return new Set([...grants.map((g) => g.userId), ...legacy.map((u) => u.id)]);
    }
    if (step.approverMode === 'ANY_WITH_PERMISSION' && step.permission) {
      const grants = await this.prisma.userAccessRole.findMany({
        where: {
          user: { isActive: true },
          role: {
            OR: [
              { key: SYSTEM_ROLE.SUPER_ADMIN },
              { permissions: { some: { permission: step.permission } } },
              { permissions: { some: { permission: '*' } } },
            ],
          },
        },
        select: { userId: true },
      });
      return new Set(grants.map((g) => g.userId));
    }
    return new Set();
  }

  async act(requestId: string, actorUserId: string, decision: ApprovalDecision, comment?: string) {
    const trimmed = comment?.trim() || null;
    if (decision === 'REJECTED' && !trimmed) {
      throw new BadRequestException('A reason is required when rejecting');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { workflow: { include: { steps: { orderBy: { order: 'asc' } } } } },
      });
      if (!request) throw new NotFoundException('Approval request not found');
      if (request.status !== 'PENDING') throw new ConflictException('This request has already been decided');

      const step = request.workflow.steps.find((s) => s.order === request.currentStepOrder);
      if (!step) throw new BadRequestException('Approval workflow is misconfigured');

      const approvers = await this.approverUserIds(step);
      if (!approvers.has(actorUserId)) {
        throw new ForbiddenException('You are not an approver for the current step');
      }

      try {
        await tx.approvalAction.create({
          data: {
            requestId,
            stepOrder: step.order,
            stepName: step.name,
            actorUserId,
            decision,
            comment: trimmed,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException('You have already acted on this step');
        }
        throw e;
      }

      const maxOrder = Math.max(...request.workflow.steps.map((s) => s.order));
      let terminal: 'APPROVED' | 'REJECTED' | null = null;

      if (decision === 'REJECTED') {
        terminal = 'REJECTED';
        await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', decidedAt: new Date() } });
      } else if (step.order >= maxOrder) {
        terminal = 'APPROVED';
        await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', decidedAt: new Date() } });
      } else {
        const next = request.workflow.steps.find((s) => s.order > step.order)!;
        await tx.approvalRequest.update({ where: { id: requestId }, data: { currentStepOrder: next.order } });
      }

      return { request, terminal, stepName: step.name };
    });

    await this.audit.record({
      actorUserId,
      action: `APPROVAL_${decision}`,
      entity: 'ApprovalRequest',
      entityId: requestId,
      reason: trimmed,
      newData: { step: result.stepName, requestType: result.request.requestType, terminal: result.terminal },
    });

    if (result.terminal) {
      const finalizer = this.finalizers.get(result.request.entityType);
      if (finalizer) {
        try {
          await finalizer({
            entityId: result.request.entityId,
            approved: result.terminal === 'APPROVED',
            requestId,
            actorUserId,
            comment: trimmed,
          });
        } catch (error) {
          this.logger.error(`Finalizer for ${result.request.entityType} failed`, error as Error);
        }
      }
    }

    return this.getById(requestId);
  }

  async cancel(requestId: string, actorUserId: string, byMemberId?: string) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'PENDING') throw new ConflictException('Only pending requests can be cancelled');
    if (byMemberId && request.requestedByMemberId !== byMemberId) {
      throw new ForbiddenException('You can only cancel your own requests');
    }
    await this.prisma.approvalRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    await this.audit.record({ actorUserId, action: 'APPROVAL_CANCELLED', entity: 'ApprovalRequest', entityId: requestId });
    const finalizer = this.finalizers.get(request.entityType);
    if (finalizer) await finalizer({ entityId: request.entityId, approved: false, requestId, actorUserId, comment: null }).catch(() => undefined);
    return this.getById(requestId);
  }

  async getById(requestId: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
        requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } },
      },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    return this.shape(request);
  }

  private shape(r: {
    id: string;
    requestType: string;
    entityType: string;
    entityId: string;
    summary: string;
    amount: number | null;
    status: string;
    currentStepOrder: number;
    createdAt: Date;
    decidedAt: Date | null;
    requestedByMember: { firstName: string; lastName: string; memberCode: string } | null;
    workflow: { key: string; name: string; steps: { order: number; name: string }[] };
    actions: { stepOrder: number; decision: string; createdAt: Date; comment: string | null }[];
  }) {
    const steps = [...r.workflow.steps].sort((a, b) => a.order - b.order);
    return {
      id: r.id,
      requestType: r.requestType,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      amount: r.amount,
      status: r.status,
      currentStepOrder: r.currentStepOrder,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      requester: r.requestedByMember
        ? { name: `${r.requestedByMember.firstName} ${r.requestedByMember.lastName}`.trim(), memberCode: r.requestedByMember.memberCode }
        : null,
      workflow: { key: r.workflow.key, name: r.workflow.name },
      steps: steps.map((s) => {
        const action = r.actions.find((a) => a.stepOrder === s.order);
        return {
          order: s.order,
          name: s.name,
          state:
            action?.decision === 'REJECTED'
              ? 'rejected'
              : action?.decision === 'APPROVED'
                ? 'approved'
                : r.status === 'PENDING' && r.currentStepOrder === s.order
                  ? 'current'
                  : r.status === 'PENDING' && r.currentStepOrder < s.order
                    ? 'waiting'
                    : 'skipped',
          decidedAt: action?.createdAt ?? null,
          comment: action?.comment ?? null,
        };
      }),
    };
  }

  /** Pending requests the given user can currently act on. */
  async pendingFor(actorUserId: string, requestType?: ApprovalRequestType) {
    const pending = await this.prisma.approvalRequest.findMany({
      where: { status: 'PENDING', ...(requestType ? { requestType } : {}) },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
        requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const out = [];
    for (const r of pending) {
      const step = r.workflow.steps.find((s) => s.order === r.currentStepOrder);
      if (!step) continue;
      const approvers = await this.approverUserIds(step);
      const alreadyActed = r.actions.some((a) => a.stepOrder === step.order && a.actorUserId === actorUserId);
      if (approvers.has(actorUserId) && !alreadyActed) out.push(this.shape(r));
    }
    return out;
  }

  async listForRequester(memberId: string) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { requestedByMemberId: memberId },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
        requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  async history(requestType?: ApprovalRequestType, take = 100) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { status: { not: 'PENDING' }, ...(requestType ? { requestType } : {}) },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
        requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } },
      },
      orderBy: { decidedAt: 'desc' },
      take: Math.min(take, 200),
    });
    return rows.map((r) => this.shape(r));
  }

  async getForEntity(entityType: string, entityId: string) {
    const r = await this.prisma.approvalRequest.findFirst({
      where: { entityType, entityId },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
        requestedByMember: { select: { firstName: true, lastName: true, memberCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return r ? this.shape(r) : null;
  }
}
