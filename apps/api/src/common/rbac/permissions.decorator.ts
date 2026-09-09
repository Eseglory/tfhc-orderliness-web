import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Require the caller to hold every listed permission (AND semantics). Super
 * Admin (wildcard) always passes. Apply alongside `PermissionsGuard`.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
