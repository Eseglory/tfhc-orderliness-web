import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('calendar')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('today-upcoming')
  async getTodayUpcoming(
    @CurrentUser('role') role: string,
    @CurrentUser('memberId') memberId?: string,
  ) {
    const isStaff = role === 'ADMIN' || role === 'LEADER';
    return this.calendarService.getTodayUpcoming(memberId, isStaff);
  }

  @Get('feed')
  async getFeed(
    @CurrentUser('role') role: string,
    @CurrentUser('memberId') memberId: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = from || start;
    const endDate = to || end;
    if (!startDate || !endDate) {
      throw new BadRequestException('Both "from"/"start" and "to"/"end" date query parameters are required.');
    }
    const isStaff = role === 'ADMIN' || role === 'LEADER';
    return this.calendarService.getUnifiedFeed(startDate, endDate, isStaff, memberId);
  }

  @Get('conflicts')
  async checkConflicts(
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('excludeId') excludeId?: string,
    @Query('providerId') providerId?: string,
  ) {
    if (!startTime || !endTime) {
      throw new BadRequestException('startTime and endTime are required.');
    }
    return this.calendarService.checkConflicts({
      startTime,
      endTime,
      excludeId,
      providerId,
    });
  }

  @Patch('reschedule')
  @RequirePermissions('events.update')
  async reschedule(
    @Body()
    dto: {
      entityType: 'MEETING' | 'EVENT' | 'APPOINTMENT';
      entityId: string;
      newStartTime: string;
      newEndTime?: string;
      reason?: string;
    },
    @CurrentUser('userId') userId: string,
  ) {
    if (!dto.entityType || !dto.entityId || !dto.newStartTime) {
      throw new BadRequestException('entityType, entityId, and newStartTime are required.');
    }
    return this.calendarService.rescheduleEntity(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // Google Calendar Integration Endpoints
  // ---------------------------------------------------------------------------

  @Get('integrations/google/auth-url')
  @RequirePermissions('events.create')
  getGoogleAuthUrl(@CurrentUser('userId') userId: string, @Query('prefix') prefix?: string) {
    return {
      authUrl: this.calendarService.getAuthUrl(userId, prefix),
    };
  }

  @Post('integrations/google/connect')
  @RequirePermissions('events.create')
  async connectGoogle(@Body() body: { code: string }, @CurrentUser('userId') userId: string) {
    if (!body?.code) {
      throw new BadRequestException('Authorization code is required');
    }
    return this.calendarService.connectAccount(userId, body.code);
  }

  @Get('integrations/google/status')
  async getGoogleStatus(@CurrentUser('userId') userId: string) {
    return this.calendarService.getIntegrationStatus(userId);
  }

  @Post('integrations/google/disconnect')
  @RequirePermissions('events.update')
  async disconnectGoogle(@CurrentUser('userId') userId: string) {
    return this.calendarService.disconnect(userId);
  }

  @Post('integrations/google/sync-meeting')
  @RequirePermissions('events.update')
  async syncMeeting(@Body() body: { meetingId: string }, @CurrentUser('userId') userId: string) {
    if (!body?.meetingId) throw new BadRequestException('meetingId is required');
    return this.calendarService.syncMeetingToGoogle(userId, body.meetingId);
  }

  @Post('integrations/google/sync-appointment')
  @RequirePermissions('events.update')
  async syncAppointment(@Body() body: { appointmentId: string }, @CurrentUser('userId') userId: string) {
    if (!body?.appointmentId) throw new BadRequestException('appointmentId is required');
    return this.calendarService.syncAppointmentToGoogle(userId, body.appointmentId);
  }

  @Post('integrations/google/webhook')
  @Public()
  async handleWebhook() {
    // Idempotent webhook receiver for Google push notifications
    return { received: true, timestamp: new Date() };
  }
}
