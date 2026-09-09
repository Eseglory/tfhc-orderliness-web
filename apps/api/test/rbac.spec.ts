import { ForbiddenException } from '@nestjs/common';
import { RbacService } from '../src/common/rbac/rbac.service';
import { PermissionsGuard } from '../src/common/rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../src/common/rbac/permissions.decorator';
import { ALL_PERMISSION_KEYS, expandPermissions, hasAllPermissions } from '@tfhc/shared';

describe('shared permission helpers', () => {
  it('expands the wildcard to the full catalogue', () => {
    expect(expandPermissions(['*']).size).toBe(ALL_PERMISSION_KEYS.length);
    expect(expandPermissions(['members.read', 'unknown.thing'])).toEqual(new Set(['members.read']));
  });

  it('hasAllPermissions requires every listed permission unless wildcard held', () => {
    expect(hasAllPermissions(new Set(['*']), ['anything.at.all'])).toBe(true);
    expect(hasAllPermissions(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(hasAllPermissions(new Set(['a']), ['a', 'b'])).toBe(false);
  });
});

describe('RbacService.resolveAccess', () => {
  const build = (grants: any[], fallbackRole?: any) => {
    const prisma = {
      userAccessRole: { findMany: jest.fn().mockResolvedValue(grants) },
      accessRole: { findUnique: jest.fn().mockResolvedValue(fallbackRole ?? null) },
    };
    return { service: new RbacService(prisma as any), prisma };
  };

  it('unions permissions across multiple roles', async () => {
    const { service } = build([
      { role: { key: 'A', name: 'A', permissions: [{ permission: 'members.read' }, { permission: 'events.read' }] } },
      { role: { key: 'B', name: 'B', permissions: [{ permission: 'events.read' }, { permission: 'events.create' }] } },
    ]);
    const access = await service.resolveAccess('u1');
    expect(access.isSuperAdmin).toBe(false);
    expect([...access.permissions].sort()).toEqual(['events.create', 'events.read', 'members.read']);
  });

  it('super admin grant expands to every permission', async () => {
    const { service } = build([{ role: { key: 'SUPER_ADMIN', name: 'Super Admin', permissions: [{ permission: '*' }] } }]);
    const access = await service.resolveAccess('u1');
    expect(access.isSuperAdmin).toBe(true);
    expect(access.permissions).toHaveLength(ALL_PERMISSION_KEYS.length);
  });

  it('falls back to the legacy enum role when no grants exist', async () => {
    const { service, prisma } = build([], {
      key: 'ADMINISTRATION',
      name: 'Administration',
      permissions: [{ permission: 'members.read' }, { permission: 'events.create' }],
    });
    const access = await service.resolveAccess('u1', 'LEADER');
    expect(prisma.accessRole.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'ADMINISTRATION' } }),
    );
    expect(access.roleKeys).toEqual(['ADMINISTRATION']);
    expect([...access.permissions].sort()).toEqual(['events.create', 'members.read']);
  });

  it('a member with no grants and no fallback has nothing', async () => {
    const { service } = build([]);
    const access = await service.resolveAccess('u1', 'MEMBER');
    expect(access.permissions).toEqual([]);
    expect(access.isSuperAdmin).toBe(false);
  });
});

describe('PermissionsGuard', () => {
  const context = (required: string[] | undefined, user: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  const guard = (required: string[] | undefined) =>
    new PermissionsGuard({
      getAllAndOverride: (key: string) => (key === PERMISSIONS_KEY ? required : undefined),
    } as any);

  it('passes when no permissions are required', () => {
    expect(guard(undefined).canActivate(context(undefined, {}))).toBe(true);
  });

  it('passes with the exact permissions or the wildcard', () => {
    expect(guard(['members.create']).canActivate(context(['members.create'], { permissions: ['members.create'] }))).toBe(true);
    expect(guard(['members.create']).canActivate(context(['members.create'], { permissions: ['*'] }))).toBe(true);
  });

  it('rejects when a permission is missing or the user is absent', () => {
    expect(() => guard(['roles.create']).canActivate(context(['roles.create'], { permissions: ['roles.read'] }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard(['roles.create']).canActivate(context(['roles.create'], null))).toThrow(ForbiddenException);
  });
});
