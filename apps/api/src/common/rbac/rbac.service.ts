import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SYSTEM_ROLE,
  PERMISSION_WILDCARD,
  LEGACY_ROLE_FALLBACK,
  expandPermissions,
  ALL_PERMISSION_KEYS,
  DEFAULT_EVENT_TYPES,
} from '@tfhc/shared';
import { syncSystemRoles } from './sync-system-roles';

export interface ResolvedAccess {
  roleKeys: string[];
  roleNames: string[];
  /** Concrete permission set with the wildcard already expanded. */
  permissions: string[];
  isSuperAdmin: boolean;
}

@Injectable()
export class RbacService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.syncSystemRoles();
      await this.bootstrapDefaults();
    } catch (error) {
      // A transient DB blip at boot must not crash the process; the next boot
      // (or an explicit call) reconciles.
      this.logger.error('System role / bootstrap sync failed at boot; will retry on next start', error as Error);
    }
  }

  private async bootstrapDefaults(): Promise<void> {
    for (let i = 0; i < DEFAULT_EVENT_TYPES.length; i++) {
      const t = DEFAULT_EVENT_TYPES[i];
      await this.prisma.eventType.upsert({
        where: { key: t.key },
        update: { isSystem: true },
        create: {
          key: t.key,
          name: t.name,
          description: t.description,
          icon: t.icon,
          color: t.color,
          defaultCompulsory: t.defaultCompulsory,
          isSystem: true,
          sortOrder: (i + 1) * 10,
        },
      });
    }

    const categories = [
      { name: 'Unit Meeting', basePoints: 10, pointWeight: 1.0, isSystem: true },
      { name: 'Sunday Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
      { name: 'Midweek Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
      { name: 'Training', basePoints: 10, pointWeight: 1.5, isSystem: true },
      { name: 'Special Programme', basePoints: 15, pointWeight: 2.0, isSystem: true },
    ];
    for (const c of categories) {
      await this.prisma.meetingCategory.upsert({ where: { name: c.name }, update: { isSystem: true }, create: c });
    }

    const chatRooms = [
      { key: 'GENERAL', name: 'General', description: 'Unit-wide conversation for every member.', type: 'GENERAL' as const },
      { key: 'EXECUTIVES', name: 'Executives', description: 'Private channel for unit executives and administrators.', type: 'EXECUTIVES' as const },
      { key: 'DISCIPLINARY', name: 'Disciplinary Committee', description: 'Confidential channel for Disciplinary Committee members, ethics reviews, and case discussions.', type: 'EXECUTIVES' as const },
    ];
    for (const r of chatRooms) {
      await this.prisma.chatRoom.upsert({ where: { key: r.key }, update: {}, create: r });
    }

    await this.prisma.systemSetting.upsert({
      where: { key: 'recurring_services_config' },
      update: {},
      create: {
        key: 'recurring_services_config',
        value: JSON.stringify({
          venue: {
            name: 'The Father’s House Church, 90 Alagbole–Akute Road, Iju, Ojodu',
            latitude: 6.6697906,
            longitude: 3.3581822,
            radiusMeters: 120,
          },
          arrivalMinutesBefore: 30,
          reminderMinutes: [60],
          recipients: 'all',
          remindersEnabled: false,
        }),
      },
    });

    // Account provisioning is explicit via scripts/bootstrap-admin.cjs.
    // Startup must never reset credentials, reactivate accounts or grant roles.
  }

  /** Idempotently ensure the three system roles exist and carry sensible
   *  permissions. See {@link syncSystemRoles} for the reconciliation rules. */
  syncSystemRoles(): Promise<void> {
    return syncSystemRoles(this.prisma);
  }

  /**
   * Resolve a user's effective access. Called per-request from the JWT strategy,
   * so revocation and role changes take effect on the very next request.
   */
  async resolveAccess(userId: string, legacyRole?: string): Promise<ResolvedAccess> {
    const grants = await this.prisma.userAccessRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } },
    });

    let roleKeys = grants.map((g) => g.role.key);
    let roleNames = grants.map((g) => g.role.name);
    let granted = grants.flatMap((g) => g.role.permissions.map((p) => p.permission));

    // Transition safety: an account with no explicit grants falls back to its
    // legacy enum role. Normal accounts are backfilled by the RBAC migration.
    if (grants.length === 0 && legacyRole) {
      const fallbackKey = LEGACY_ROLE_FALLBACK[legacyRole] ?? null;
      if (fallbackKey) {
        const fallback = await this.prisma.accessRole.findUnique({
          where: { key: fallbackKey },
          include: { permissions: true },
        });
        if (fallback) {
          roleKeys = [fallback.key];
          roleNames = [fallback.name];
          granted = fallback.permissions.map((p) => p.permission);
        }
      }
    }

    const isSuperAdmin = roleKeys.includes(SYSTEM_ROLE.SUPER_ADMIN) || granted.includes(PERMISSION_WILDCARD);
    const permissions = isSuperAdmin
      ? [...ALL_PERMISSION_KEYS]
      : [...expandPermissions(granted)];

    return { roleKeys, roleNames, permissions, isSuperAdmin };
  }
}
