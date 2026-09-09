import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  previousData?: Prisma.InputJsonValue | null;
  newData?: Prisma.InputJsonValue | null;
  reason?: string | null;
}

/**
 * Append-only audit trail for sensitive administrative actions. Writes are
 * best-effort from the caller's point of view but failures are logged loudly —
 * an action must never be blocked because the audit insert failed, yet a silent
 * gap in the trail must be visible in logs.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          previousData: entry.previousData ?? Prisma.DbNull,
          newData: entry.newData ?? Prisma.DbNull,
          reason: entry.reason ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} ${entry.entity}:${entry.entityId}`,
        error as Error,
      );
    }
  }

  /** Same as record() but participates in the caller's transaction. */
  async recordWithin(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        previousData: entry.previousData ?? Prisma.DbNull,
        newData: entry.newData ?? Prisma.DbNull,
        reason: entry.reason ?? null,
      },
    });
  }
}
