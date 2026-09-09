import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  async list(
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 100);
    const where = {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actorUser: {
          select: { email: true, member: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        reason: r.reason,
        previousData: r.previousData,
        newData: r.newData,
        createdAt: r.createdAt,
        actor: {
          email: r.actorUser?.email ?? null,
          name: r.actorUser?.member
            ? `${r.actorUser.member.firstName} ${r.actorUser.member.lastName}`.trim()
            : null,
        },
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
