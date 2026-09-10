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
import { Role, MemberStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { SERVICE_SCHEDULES } from '../../modules/recurring-services/service-schedules';

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
    for (const [i, t] of DEFAULT_EVENT_TYPES.entries()) {
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

    for (const name of ['Protocol', 'Media & IT', 'Choir', 'Ushering', 'Security']) {
      await this.prisma.subTeam.upsert({ where: { name }, update: {}, create: { name, isSystem: true } });
    }

    const chatRooms = [
      { key: 'GENERAL', name: 'General', description: 'Unit-wide conversation for every member.', type: 'GENERAL' as const },
      { key: 'EXECUTIVES', name: 'Executives', description: 'Private channel for unit executives and administrators.', type: 'EXECUTIVES' as const },
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

    for (const s of SERVICE_SCHEDULES) {
      await this.prisma.serviceSchedule.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          title: s.title,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
          categoryName: s.categoryName,
          enabled: true,
          eventTypeKey: s.categoryName === 'Special Programme' ? 'SPECIAL_SERVICE' : 'SERVICE',
        },
      });
    }

    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com';
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'E2ePassword!123';
    
    const adminMember = await this.prisma.member.upsert({
      where: { memberCode: 'ADMIN-ESE' },
      update: { firstName: 'Glory', lastName: 'Eseosa', phoneNumber: '08034441916', profession: 'Software Engineer', address: 'TFHC HQ', gender: 'Male', status: MemberStatus.ACTIVE },
      create: { memberCode: 'ADMIN-ESE', firstName: 'Glory', lastName: 'Eseosa', phoneNumber: '08034441916', profession: 'Software Engineer', address: 'TFHC HQ', gender: 'Male', status: MemberStatus.ACTIVE },
    });

    const existingAdmin = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(adminPassword);
      const adminUser = await this.prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          role: Role.ADMIN,
          passwordAuthEnabled: true,
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
          isActive: true,
          member: { connect: { id: adminMember.id } },
        },
      });
      await this.prisma.member.update({ where: { id: adminMember.id }, data: { userId: adminUser.id } });
      await this.prisma.approvedMember.upsert({
        where: { normalizedEmail: adminEmail },
        update: { status: 'ACTIVE', memberId: adminMember.id },
        create: { email: adminEmail, normalizedEmail: adminEmail, status: 'ACTIVE', memberId: adminMember.id },
      });

      const superRole = await this.prisma.accessRole.findUnique({ where: { key: 'SUPER_ADMIN' } });
      if (superRole) {
        await this.prisma.userAccessRole.upsert({
          where: { userId_roleId: { userId: adminUser.id, roleId: superRole.id } },
          update: {},
          create: { userId: adminUser.id, roleId: superRole.id },
        });
      }
      this.logger.log(`✓ Bootstrapped Super Admin: ${adminEmail}`);
    }
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
