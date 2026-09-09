import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions } from '@tfhc/shared';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * Enforces `@RequirePermissions(...)`. Expects the JWT strategy to have attached
 * `permissions: string[]` to `request.user`. Use with `JwtAuthGuard`:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @RequirePermissions('members.create')
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Authentication required');

    const held = new Set<string>(Array.isArray(user.permissions) ? user.permissions : []);
    if (!hasAllPermissions(held, required)) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
