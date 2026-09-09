import type { PrismaClient } from '@prisma/client';
import {
  SYSTEM_ROLE_DEFINITIONS,
  SYSTEM_ROLE,
  PERMISSION_WILDCARD,
  ALL_PERMISSION_KEYS,
} from '@tfhc/shared';

type PrismaLike = Pick<PrismaClient, 'accessRole' | 'accessRolePermission'>;

/**
 * Idempotently ensure the three system roles exist with sensible permissions.
 *
 * - SUPER_ADMIN is fully code-managed: always exactly the wildcard.
 * - ADMINISTRATION / FINANCE receive their code defaults only on first
 *   initialisation (zero permissions); afterwards a Super Admin may tailor them.
 *
 * Shared by `RbacService` (on boot) and the seed script (outside Nest DI).
 */
export async function syncSystemRoles(prisma: PrismaLike): Promise<void> {
  for (const [key, def] of Object.entries(SYSTEM_ROLE_DEFINITIONS)) {
    const role = await prisma.accessRole.upsert({
      where: { key },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { key, name: def.name, description: def.description, isSystem: true },
    });

    if (key === SYSTEM_ROLE.SUPER_ADMIN) {
      await prisma.accessRolePermission.deleteMany({
        where: { roleId: role.id, permission: { not: PERMISSION_WILDCARD } },
      });
      await prisma.accessRolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission: PERMISSION_WILDCARD } },
        update: {},
        create: { roleId: role.id, permission: PERMISSION_WILDCARD },
      });
      continue;
    }

    const existing = await prisma.accessRolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      await prisma.accessRolePermission.createMany({
        data: def.permissions
          .filter((p) => ALL_PERMISSION_KEYS.includes(p))
          .map((permission) => ({ roleId: role.id, permission })),
        skipDuplicates: true,
      });
    }
  }
}
