import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
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
  invite(@Body() dto: InviteAdminDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.email?.toLowerCase() !== 'engreseglory@gmail.com') {
      throw new ForbiddenException('Only engreseglory@gmail.com is authorized to invite users.');
    }
    return this.service.invite(dto, user.userId);
  }

  @Post('invite')
  @RequirePermissions('users.create')
  inviteAlias(@Body() dto: InviteAdminDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.email?.toLowerCase() !== 'engreseglory@gmail.com') {
      throw new ForbiddenException('Only engreseglory@gmail.com is authorized to invite users.');
    }
    return this.service.invite(dto, user.userId);
  }

  @Post(':id/resend-invite')
  @RequirePermissions('users.create')
  resend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.email?.toLowerCase() !== 'engreseglory@gmail.com') {
      throw new ForbiddenException('Only engreseglory@gmail.com is authorized to invite users.');
    }
    return this.service.resendInvite(id, user.userId);
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
