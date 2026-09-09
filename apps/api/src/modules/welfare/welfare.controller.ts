import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WelfareService } from './welfare.service';

@Controller('welfare-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WelfareController {
  constructor(private readonly welfare: WelfareService) {}

  @Get('mine')
  mine(@CurrentUser('memberId') memberId?: string) {
    return this.welfare.listMine(memberId);
  }

  @Post()
  create(
    @Body() body: any,
    @CurrentUser('memberId') memberId: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.welfare.create(memberId, userId, body);
  }

  @Get()
  @RequirePermissions('welfare.read')
  list(@Query('status') status?: string) {
    return this.welfare.list(status);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentUser('memberId') memberId: string | undefined,
    @CurrentUser('permissions') permissions: string[] = [],
  ) {
    const isStaff = permissions.includes('*') || permissions.includes('welfare.read');
    return this.welfare.getOne(id, memberId, isStaff);
  }
}
