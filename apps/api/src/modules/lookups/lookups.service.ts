import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DEFAULT_EVENT_TYPES } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';

/**
 * Centralised administration of the small classification tables. Each "kind" is
 * a real table with real relationships; this service gives them one CRUD shape
 * and one set of safety rules (system rows deactivate, never delete; a row that
 * is still referenced cannot be deleted).
 */
export type LookupKind = 'event-types' | 'meeting-categories' | 'sub-teams';

export interface LookupRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  inUse: number;
  deletable: boolean;
  extra: Record<string, unknown>;
}

@Injectable()
export class LookupsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LookupsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.syncSystemEventTypes();
    } catch (error) {
      this.logger.error('Event-type sync failed at boot', error as Error);
    }
  }

  /** Ensure every system event type from the shared catalogue exists. Never
   *  overwrites admin edits to name/colour/order; only fills gaps. */
  async syncSystemEventTypes() {
    for (const [i, def] of DEFAULT_EVENT_TYPES.entries()) {
      await this.prisma.eventType.upsert({
        where: { key: def.key },
        update: { isSystem: true },
        create: {
          key: def.key,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          defaultCompulsory: def.defaultCompulsory,
          isSystem: true,
          sortOrder: (i + 1) * 10,
        },
      });
    }
  }

  private slug(name: string): string {
    return (
      name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ITEM'
    );
  }

  async list(kind: LookupKind, includeInactive = false) {
    switch (kind) {
      case 'event-types': {
        const rows = await this.prisma.eventType.findMany({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { meetings: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.meetings,
          deletable: !r.isSystem && r._count.meetings === 0,
          extra: { key: r.key, icon: r.icon, color: r.color, defaultCompulsory: r.defaultCompulsory, sortOrder: r.sortOrder },
        }));
      }
      case 'meeting-categories': {
        const rows = await this.prisma.meetingCategory.findMany({
          orderBy: { name: 'asc' },
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { meetings: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.meetings,
          deletable: !r.isSystem && r._count.meetings === 0,
          extra: { basePoints: r.basePoints, pointWeight: r.pointWeight },
        }));
      }
      case 'sub-teams': {
        const rows = await this.prisma.subTeam.findMany({
          orderBy: { name: 'asc' },
          where: includeInactive ? {} : { active: true },
          include: { _count: { select: { members: true } } },
        });
        return rows.map<LookupRow>((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          active: r.active,
          isSystem: r.isSystem,
          inUse: r._count.members,
          deletable: !r.isSystem && r._count.members === 0,
          extra: {},
        }));
      }
      default:
        throw new BadRequestException('Unknown lookup');
    }
  }

  private num(value: unknown, field: string, min: number, max: number): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${field} must be between ${min} and ${max}`);
    return n;
  }

  async create(kind: LookupKind, dto: Record<string, unknown>, actorUserId: string) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (name.length < 2 || name.length > 80) throw new BadRequestException('Name must be 2–80 characters');
    const description = typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim() : null;

    let created: { id: string };
    if (kind === 'event-types') {
      let key = this.slug(name);
      for (let i = 0; await this.prisma.eventType.findUnique({ where: { key } }); i++) key = `${this.slug(name)}_${i + 2}`;
      created = await this.prisma.eventType.create({
        data: {
          key,
          name,
          description,
          icon: typeof dto.icon === 'string' ? dto.icon.slice(0, 40) : 'event',
          color: typeof dto.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(dto.color) ? dto.color : '#64748B',
          defaultCompulsory: Boolean(dto.defaultCompulsory),
          sortOrder: this.num(dto.sortOrder, 'Sort order', 0, 9999) ?? 500,
          createdById: actorUserId,
        },
      });
    } else if (kind === 'meeting-categories') {
      const clash = await this.prisma.meetingCategory.findUnique({ where: { name } });
      if (clash) throw new ConflictException('A category with this name already exists');
      created = await this.prisma.meetingCategory.create({
        data: {
          name,
          description,
          basePoints: this.num(dto.basePoints, 'Base points', 0, 1000) ?? 10,
          pointWeight: this.num(dto.pointWeight, 'Point weight', 0, 100) ?? 1,
        },
      });
    } else {
      const clash = await this.prisma.subTeam.findUnique({ where: { name } });
      if (clash) throw new ConflictException('A sub-team with this name already exists');
      created = await this.prisma.subTeam.create({ data: { name, description } });
    }

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_CREATED',
      entity: 'Lookup',
      entityId: created.id,
      newData: { kind, name },
    });
    return this.findOne(kind, created.id);
  }

  async update(kind: LookupKind, id: string, dto: Record<string, unknown>, actorUserId: string) {
    const before = await this.findOne(kind, id);
    const data: Record<string, unknown> = {};
    if (typeof dto.name === 'string') {
      const name = dto.name.trim();
      if (name.length < 2 || name.length > 80) throw new BadRequestException('Name must be 2–80 characters');
      data.name = name;
    }
    if (dto.description !== undefined)
      data.description = typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim() : null;
    if (dto.active !== undefined) {
      if (before.isSystem && dto.active === false && kind === 'event-types') {
        // Allowed — deactivating a system type is fine; deleting is not.
      }
      data.active = Boolean(dto.active);
    }

    if (kind === 'event-types') {
      if (dto.icon !== undefined) data.icon = typeof dto.icon === 'string' ? dto.icon.slice(0, 40) : null;
      if (dto.color !== undefined && typeof dto.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(dto.color)) data.color = dto.color;
      if (dto.defaultCompulsory !== undefined) data.defaultCompulsory = Boolean(dto.defaultCompulsory);
      const so = this.num(dto.sortOrder, 'Sort order', 0, 9999);
      if (so !== undefined) data.sortOrder = so;
      await this.prisma.eventType.update({ where: { id }, data });
    } else if (kind === 'meeting-categories') {
      const bp = this.num(dto.basePoints, 'Base points', 0, 1000);
      const pw = this.num(dto.pointWeight, 'Point weight', 0, 100);
      if (bp !== undefined) data.basePoints = bp;
      if (pw !== undefined) data.pointWeight = pw;
      await this.prisma.meetingCategory.update({ where: { id }, data });
    } else {
      await this.prisma.subTeam.update({ where: { id }, data });
    }

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_UPDATED',
      entity: 'Lookup',
      entityId: id,
      previousData: { kind, name: before.name, active: before.active },
      newData: { kind, ...data },
    });
    return this.findOne(kind, id);
  }

  async remove(kind: LookupKind, id: string, actorUserId: string) {
    const row = await this.findOne(kind, id);
    if (row.isSystem) throw new ForbiddenException('System entries cannot be deleted — deactivate it instead');
    if (row.inUse > 0)
      throw new ConflictException(`This entry is used by ${row.inUse} record(s). Reassign them, or deactivate it instead.`);

    if (kind === 'event-types') await this.prisma.eventType.delete({ where: { id } });
    else if (kind === 'meeting-categories') await this.prisma.meetingCategory.delete({ where: { id } });
    else await this.prisma.subTeam.delete({ where: { id } });

    await this.audit.record({
      actorUserId,
      action: 'LOOKUP_DELETED',
      entity: 'Lookup',
      entityId: id,
      previousData: { kind, name: row.name },
    });
    return { deleted: true };
  }

  private async findOne(kind: LookupKind, id: string): Promise<LookupRow> {
    const rows = await this.list(kind, true);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException('Not found');
    return row;
  }
}
