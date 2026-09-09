import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RecurringServicesService, RecurringConfig } from './recurring-services.service';

@Controller('service-schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecurringServicesController {
  constructor(private readonly service: RecurringServicesService) {}

  @Get()
  @RequirePermissions('events.read')
  list() {
    return this.service.list();
  }

  @Put('config')
  @RequirePermissions('events.update')
  configure(@Body() body: RecurringConfig) {
    return this.service.saveConfiguration(body);
  }

  @Post()
  @RequirePermissions('events.create')
  create(@Body() body: unknown, @CurrentUser('userId') userId: string) {
    return this.service.saveSchedule(undefined, body, userId);
  }

  @Put(':id')
  @RequirePermissions('events.update')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser('userId') userId: string) {
    return this.service.saveSchedule(id, body, userId);
  }

  @Post(':id/occurrences/:meetingId/cancel')
  @RequirePermissions('events.cancel')
  cancelOccurrence(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() body: { reason?: string },
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.cancelOccurrence(id, meetingId, body?.reason, userId);
  }

  @Delete(':id/occurrences/:meetingId/cancel')
  @RequirePermissions('events.update')
  restoreOccurrence(
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.restoreOccurrence(id, meetingId, userId);
  }
}
