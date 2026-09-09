import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalRequestType } from '@prisma/client';
import { ALL_PERMISSION_KEYS } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';

interface StepInput {
  name: string;
  approverMode: 'ROLE' | 'SPECIFIC_USER' | 'ANY_WITH_PERMISSION';
  roleKey?: string | null;
  approverUserId?: string | null;
  permission?: string | null;
}

@Injectable()
export class ApprovalWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.approvalWorkflow.findMany({
      orderBy: [{ requestType: 'asc' }, { createdAt: 'asc' }],
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { requests: true } },
      },
    });
    return rows.map((w) => ({
      id: w.id,
      key: w.key,
      name: w.name,
      description: w.description,
      requestType: w.requestType,
      active: w.active,
      isSystem: w.isSystem,
      requestCount: w._count.requests,
      steps: w.steps.map((s) => ({
        id: s.id,
        order: s.order,
        name: s.name,
        approverMode: s.approverMode,
        roleKey: s.roleKey,
        approverUserId: s.approverUserId,
        permission: s.permission,
      })),
    }));
  }

  private async validateSteps(steps: StepInput[]) {
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 6) {
      throw new BadRequestException('A workflow needs between 1 and 6 steps');
    }
    for (const s of steps) {
      if (typeof s.name !== 'string' || s.name.trim().length < 2) throw new BadRequestException('Each step needs a name');
      if (!['ROLE', 'SPECIFIC_USER', 'ANY_WITH_PERMISSION'].includes(s.approverMode)) {
        throw new BadRequestException('Invalid approver mode');
      }
      if (s.approverMode === 'ROLE') {
        if (!s.roleKey) throw new BadRequestException('Role steps need a role');
        const role = await this.prisma.accessRole.findUnique({ where: { key: s.roleKey } });
        if (!role) throw new BadRequestException(`Unknown role ${s.roleKey}`);
      }
      if (s.approverMode === 'SPECIFIC_USER') {
        if (!s.approverUserId) throw new BadRequestException('User steps need a user');
        const user = await this.prisma.user.findUnique({ where: { id: s.approverUserId } });
        if (!user) throw new BadRequestException('Unknown approver');
      }
      if (s.approverMode === 'ANY_WITH_PERMISSION') {
        if (!s.permission || !ALL_PERMISSION_KEYS.includes(s.permission)) {
          throw new BadRequestException('Permission steps need a valid permission');
        }
      }
    }
  }

  private slug(name: string) {
    return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'WORKFLOW';
  }

  async create(
    dto: { name: string; description?: string; requestType: ApprovalRequestType; steps: StepInput[] },
    actorUserId: string,
  ) {
    if (typeof dto.name !== 'string' || dto.name.trim().length < 2) throw new BadRequestException('Give the workflow a name');
    if (!Object.values(ApprovalRequestType).includes(dto.requestType)) throw new BadRequestException('Invalid request type');
    await this.validateSteps(dto.steps);

    let key = this.slug(dto.name);
    for (let i = 0; await this.prisma.approvalWorkflow.findUnique({ where: { key } }); i++) key = `${this.slug(dto.name)}_${i + 2}`;

    const workflow = await this.prisma.approvalWorkflow.create({
      data: {
        key,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        requestType: dto.requestType,
        active: false, // new workflows start inactive; activating one deactivates the rest for that type
        createdById: actorUserId,
        steps: {
          create: dto.steps.map((s, i) => ({
            order: i + 1,
            name: s.name.trim(),
            approverMode: s.approverMode,
            roleKey: s.approverMode === 'ROLE' ? s.roleKey : null,
            approverUserId: s.approverMode === 'SPECIFIC_USER' ? s.approverUserId : null,
            permission: s.approverMode === 'ANY_WITH_PERMISSION' ? s.permission : null,
          })),
        },
      },
      include: { steps: true },
    });
    await this.audit.record({ actorUserId, action: 'APPROVAL_WORKFLOW_CREATED', entity: 'ApprovalWorkflow', entityId: workflow.id, newData: { key, requestType: dto.requestType } });
    return this.list().then((l) => l.find((w) => w.id === workflow.id));
  }

  async update(
    id: string,
    dto: { name?: string; description?: string; active?: boolean; steps?: StepInput[] },
    actorUserId: string,
  ) {
    const workflow = await this.prisma.approvalWorkflow.findUnique({ where: { id } });
    if (!workflow) throw new NotFoundException('Workflow not found');

    await this.prisma.$transaction(async (tx) => {
      const data: { name?: string; description?: string | null; active?: boolean } = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.description !== undefined) data.description = dto.description.trim() || null;
      if (dto.active !== undefined) data.active = dto.active;

      if (dto.steps) {
        await this.validateSteps(dto.steps);
        await tx.approvalStep.deleteMany({ where: { workflowId: id } });
        await tx.approvalStep.createMany({
          data: dto.steps.map((s, i) => ({
            workflowId: id,
            order: i + 1,
            name: s.name.trim(),
            approverMode: s.approverMode,
            roleKey: s.approverMode === 'ROLE' ? s.roleKey ?? null : null,
            approverUserId: s.approverMode === 'SPECIFIC_USER' ? s.approverUserId ?? null : null,
            permission: s.approverMode === 'ANY_WITH_PERMISSION' ? s.permission ?? null : null,
          })),
        });
      }

      if (Object.keys(data).length) await tx.approvalWorkflow.update({ where: { id }, data });

      // Only one active workflow per request type.
      if (dto.active === true) {
        await tx.approvalWorkflow.updateMany({
          where: { requestType: workflow.requestType, id: { not: id } },
          data: { active: false },
        });
      }
    });

    await this.audit.record({
      actorUserId,
      action: 'APPROVAL_WORKFLOW_UPDATED',
      entity: 'ApprovalWorkflow',
      entityId: id,
      newData: { active: dto.active, stepsChanged: Boolean(dto.steps) },
    });
    return this.list().then((l) => l.find((w) => w.id === id));
  }

  async remove(id: string, actorUserId: string) {
    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { id },
      include: { _count: { select: { requests: true } } },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    if (workflow.isSystem) throw new ForbiddenException('System workflows cannot be deleted — deactivate instead');
    if (workflow._count.requests > 0) throw new ForbiddenException('This workflow has request history and cannot be deleted');
    await this.prisma.approvalWorkflow.delete({ where: { id } });
    await this.audit.record({ actorUserId, action: 'APPROVAL_WORKFLOW_DELETED', entity: 'ApprovalWorkflow', entityId: id });
    return { deleted: true };
  }
}
