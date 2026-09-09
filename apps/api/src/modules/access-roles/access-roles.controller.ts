import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessRolesService } from './access-roles.service';
import { CreateAccessRoleDto, UpdateAccessRoleDto } from './access-roles.dto';

@Controller('access-roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessRolesController {
  constructor(private readonly service: AccessRolesService) {}

  @Get('permissions')
  @RequirePermissions('roles.read')
  catalog() {
    return this.service.permissionCatalog();
  }

  @Get()
  @RequirePermissions('roles.read')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions('roles.create')
  create(@Body() dto: CreateAccessRoleDto, @CurrentUser('userId') userId: string) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('roles.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccessRoleDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.remove(id, userId);
  }
}
