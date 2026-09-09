import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { Role, MeetingStatus } from '@tfhc/shared';

const isStaff = (role: string) => role === Role.ADMIN || role === Role.LEADER;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Get('categories')
  getCategories() {
    return this.meetingsService.getCategories();
  }

  @Get('event-types')
  getEventTypes() {
    return this.meetingsService.getEventTypes();
  }

  @RequirePermissions('lookups.manage')
  @Post('categories')
  createCategory(@Body() body: { name: string; description?: string; basePoints?: number; pointWeight?: number }) {
    return this.meetingsService.createCategory(body);
  }

  @Get('attendance-open')
  openAttendance() {
    return this.meetingsService.findOpenAttendanceMeetings();
  }

  @Get('active')
  getActiveMeeting() {
    return this.meetingsService.findActiveMeeting();
  }

  @Get('calendar')
  calendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser('role') role: string,
    @CurrentUser('memberId') memberId?: string,
  ) {
    return this.meetingsService.calendar(from, to, isStaff(role), memberId);
  }

  @Get()
  getAll(
    @CurrentUser('role') role: string,
    @CurrentUser('memberId') memberId: string | undefined,
    @Query('status') status?: MeetingStatus,
    @Query('categoryId') categoryId?: string,
    @Query('eventTypeId') eventTypeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.meetingsService.findAll(
      { status, categoryId, eventTypeId, from, to, search, includeArchived: includeArchived === 'true' },
      isStaff(role),
      memberId,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser('role') role: string, @CurrentUser('memberId') memberId?: string) {
    return this.meetingsService.findOne(id, isStaff(role), memberId);
  }

  @Put(':id/response')
  respond(
    @Param('id') id: string,
    @CurrentUser('memberId') memberId: string | undefined,
    @Body() body: { attending?: boolean },
  ) {
    return this.meetingsService.respond(id, memberId, body?.attending);
  }

  @RequirePermissions('events.create')
  @Post()
  create(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.meetingsService.createMeeting(body, userId);
  }

  @RequirePermissions('events.create')
  @Post('recurring')
  createRecurring(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.meetingsService.createRecurringMeetings(body, userId);
  }

  @RequirePermissions('events.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.meetingsService.updateMeeting(id, body, userId);
  }

  @RequirePermissions('events.create')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Body() body: { startTime?: string; title?: string }, @CurrentUser('userId') userId: string) {
    return this.meetingsService.duplicateMeeting(id, body ?? {}, userId);
  }

  @RequirePermissions('events.cancel')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser('userId') userId: string) {
    return this.meetingsService.cancelMeeting(id, body?.reason, userId);
  }

  @RequirePermissions('events.update')
  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingsService.setArchived(id, true, userId);
  }

  @RequirePermissions('events.update')
  @Delete(':id/archive')
  restore(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.meetingsService.setArchived(id, false, userId);
  }

  @RequirePermissions('events.update')
  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: MeetingStatus }, @CurrentUser('userId') userId: string) {
    return this.meetingsService.updateStatus(id, body.status, userId);
  }
}
