import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SYSTEM_ROLE,
  PERMISSION_WILDCARD,
  LEGACY_ROLE_FALLBACK,
  expandPermissions,
  ALL_PERMISSION_KEYS,
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
    } catch (error) {
      // A transient DB blip at boot must not crash the process; the next boot
      // (or an explicit call) reconciles.
      this.logger.error('System role sync failed at boot; will retry on next start', error as Error);
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
