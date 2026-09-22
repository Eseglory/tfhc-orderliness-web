import { Body, Controller, ForbiddenException, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('current')
  current(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.availability.currentForMember(memberId);
  }

  @Put('current')
  submit(
    @CurrentUser('memberId') memberId: string | undefined,
    @Body() body: { meetingIds?: string[] }
  ) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.availability.submit(memberId, body.meetingIds ?? []);
  }

  @Get('my-history')
  myHistory(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.availability.getMyHistory(memberId);
  }

  @Get('admin/reconciliation')
  @RequirePermissions('events.read')
  reconciliation(@Query('cycleId') cycleId?: string) {
    return this.availability.getCycleReconciliation(cycleId);
  }

  @Get('admin/analytics')
  @RequirePermissions('events.read')
  analytics(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 60;
    return this.availability.getHistoricalAnalytics(d);
  }

  @Post('admin/open-week')
  @RequirePermissions('events.create')
  openWeek() {
    return this.availability.openCurrentWeek();
  }

  @Post('admin/reopen-recovery')
  @RequirePermissions('events.create')
  reopenRecovery(@Body() body?: { cycleId?: string; closeUntilDate?: string }) {
    const until = body?.closeUntilDate ? new Date(body.closeUntilDate) : undefined;
    return this.availability.reopenRecoveryWindow(body?.cycleId, until);
  }
}
