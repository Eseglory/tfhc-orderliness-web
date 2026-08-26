import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('check-in')
  async checkIn(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.attendanceService.checkInMember({
      memberId: body.memberId || memberId,
      meetingId: body.meetingId,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      gpsAccuracy: body.gpsAccuracy ? Number(body.gpsAccuracy) : undefined,
      qrPayload: body.qrPayload,
      deviceInfo: body.deviceInfo,
    });
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('manual')
  async manualAttendance(@CurrentUser('userId') adminUserId: string, @Body() body: any) {
    return this.attendanceService.recordManualAttendance({
      adminUserId,
      memberId: body.memberId,
      meetingId: body.meetingId,
      status: body.status,
      reason: body.reason,
    });
  }

  @Get('meeting/:meetingId')
  async getMeetingAttendance(@Param('meetingId') meetingId: string) {
    return this.attendanceService.getMeetingAttendance(meetingId);
  }

  @Get('member/:memberId')
  async getMemberAttendance(@Param('memberId') memberId: string) {
    return this.attendanceService.getMemberAttendance(memberId);
  }
}
