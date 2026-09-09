import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { AuditService } from './audit.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Cross-cutting RBAC + audit infrastructure. Global so any module can inject
 * RbacService / AuditService and use PermissionsGuard without re-importing.
 */
@Global()
@Module({
  providers: [RbacService, AuditService, PermissionsGuard],
  exports: [RbacService, AuditService, PermissionsGuard],
})
export class RbacModule {}
