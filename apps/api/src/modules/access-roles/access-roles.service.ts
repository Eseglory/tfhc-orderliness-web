import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  PERMISSION_WILDCARD,
  SYSTEM_ROLE,
} from '@tfhc/shared';
import { CreateAccessRoleDto, UpdateAccessRoleDto } from './access-roles.dto';

const RESERVED_KEYS = new Set<string>(Object.values(SYSTEM_ROLE));

@Injectable()
export class AccessRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  permissionCatalog() {
    const groups = new Map<string, { key: string; label: string; finance: boolean }[]>();
    for (const p of PERMISSION_CATALOG) {
      if (!groups.has(p.group)) groups.set(p.group, []);
      groups.get(p.group)!.push({ key: p.key, label: p.label, finance: Boolean(p.finance) });
    }
    return [...groups.entries()].map(([group, permissions]) => ({ group, permissions }));
  }

  async list() {
    const roles = await this.prisma.accessRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: true, _count: { select: { users: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isSuperAdmin: role.key === SYSTEM_ROLE.SUPER_ADMIN,
      editable: role.key !== SYSTEM_ROLE.SUPER_ADMIN,
      deletable: !role.isSystem && role._count.users === 0,
      memberCount: role._count.users,
      permissions:
        role.key === SYSTEM_ROLE.SUPER_ADMIN
          ? [PERMISSION_WILDCARD]
          : role.permissions.map((p) => p.permission).sort(),
    }));
  }

  private validatePermissions(permissions: string[]): string[] {
    const unknown = permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
    if (unknown.length) {
      throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
    }
    return [...new Set(permissions)];
  }

  private slugifyKey(name: string): string {
    const base = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    return base || 'ROLE';
  }

  async create(dto: CreateAccessRoleDto, actorUserId: string) {
    const permissions = this.validatePermissions(dto.permissions);
    if (!permissions.length) throw new BadRequestException('Select at least one permission');

    let key = this.slugifyKey(dto.name);
    if (RESERVED_KEYS.has(key)) key = `${key}_CUSTOM`;
    // Ensure uniqueness.
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? key : `${key}_${i + 1}`;
      const clash = await this.prisma.accessRole.findUnique({ where: { key: candidate } });
      if (!clash) {
        key = candidate;
        break;
      }
      if (i > 50) throw new ConflictException('Could not allocate a unique role key');
    }

    const role = await this.prisma.accessRole.create({
      data: {
        key,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isSystem: false,
        createdById: actorUserId,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: { permissions: true },
    });

    await this.audit.record({
      actorUserId,
      action: 'ACCESS_ROLE_CREATED',
      entity: 'AccessRole',
      entityId: role.id,
      newData: { key: role.key, name: role.name, permissions },
    });

    return this.list().then((roles) => roles.find((r) => r.id === role.id));
  }

  async update(id: string, dto: UpdateAccessRoleDto, actorUserId: string) {
    const role = await this.prisma.accessRole.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.key === SYSTEM_ROLE.SUPER_ADMIN) {
      throw new ForbiddenException('The Super Admin role cannot be modified');
    }

    const previous = {
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((p) => p.permission).sort(),
    };

    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;

    let nextPermissions = previous.permissions;
    if (dto.permissions) {
      nextPermissions = this.validatePermissions(dto.permissions).sort();
      if (!nextPermissions.length) throw new BadRequestException('A role must keep at least one permission');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.accessRole.update({ where: { id }, data });
      }
      if (dto.permissions) {
        const current = new Set(previous.permissions);
        const desired = new Set(nextPermissions);
        const toAdd = [...desired].filter((p) => !current.has(p));
        const toRemove = [...current].filter((p) => !desired.has(p));
        if (toRemove.length) {
          await tx.accessRolePermission.deleteMany({ where: { roleId: id, permission: { in: toRemove } } });
        }
        if (toAdd.length) {
          await tx.accessRolePermission.createMany({
            data: toAdd.map((permission) => ({ roleId: id, permission })),
            skipDuplicates: true,
          });
        }
      }
    });

    await this.audit.record({
      actorUserId,
      action: 'ACCESS_ROLE_UPDATED',
      entity: 'AccessRole',
      entityId: id,
      previousData: previous,
      newData: {
        name: data.name ?? previous.name,
        description: data.description ?? previous.description,
        permissions: nextPermissions,
      },
    });

    return this.list().then((roles) => roles.find((r) => r.id === id));
  }

  async remove(id: string, actorUserId: string) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw new ConflictException(
        `This role is assigned to ${role._count.users} account(s). Reassign them before deleting.`,
      );
    }

    await this.prisma.accessRole.delete({ where: { id } });
    await this.audit.record({
      actorUserId,
      action: 'ACCESS_ROLE_DELETED',
      entity: 'AccessRole',
      entityId: id,
      previousData: { key: role.key, name: role.name },
    });
    return { deleted: true };
  }
}
