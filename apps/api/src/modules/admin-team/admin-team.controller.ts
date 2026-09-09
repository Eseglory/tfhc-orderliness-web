import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminTeamService } from './admin-team.service';
import { DeactivateAdminDto, InviteAdminDto, UpdateAdminDto } from './admin-team.dto';

@Controller('admin/team')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminTeamController {
  constructor(private readonly service: AdminTeamService) {}

  @Get()
  @RequirePermissions('users.read')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions('users.create')
  invite(@Body() dto: InviteAdminDto, @CurrentUser('userId') userId: string) {
    return this.service.invite(dto, userId);
  }

  @Post(':id/resend-invite')
  @RequirePermissions('users.create')
  resend(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.resendInvite(id, userId);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto, @CurrentUser('userId') userId: string) {
    return this.service.update(id, dto, userId);
  }

  @Post(':id/deactivate')
  @RequirePermissions('users.deactivate')
  deactivate(
    @Param('id') id: string,
    @Body() dto: DeactivateAdminDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.setActive(id, false, userId, dto?.reason);
  }

  @Post(':id/reactivate')
  @RequirePermissions('users.deactivate')
  reactivate(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.setActive(id, true, userId);
  }
}
