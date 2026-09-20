import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get('status')
  async getAttendanceStatus(
    @CurrentUser('memberId') memberId: string,
    @Query('meetingId') meetingId?: string,
  ) {
    return this.attendanceService.getAttendanceStatus(memberId, meetingId);
  }

  @Post('check-in')
  async checkIn(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.attendanceService.checkInMember({
      // A member identity always comes from the signed JWT; accepting it from
      // the request body would let one authenticated user check in as another.
      memberId,
      meetingId: body?.meetingId,
      latitude: typeof body?.latitude === 'number' ? body?.latitude : NaN,
      longitude: typeof body?.longitude === 'number' ? body?.longitude : NaN,
      gpsAccuracy: body?.gpsAccuracy,
      deviceInfo: body?.deviceInfo,
    });
  }

  @Post('clock-out')
  async clockOut(
    @CurrentUser('memberId') memberId: string,
    @Body() body: any,
  ) {
    return this.attendanceService.clockOutMember(memberId, body?.meetingId, body?.deviceInfo);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('attendance.manage')
  @Post('manual')
  async manualAttendance(@CurrentUser('userId') adminUserId: string, @Body() body: any) {
    return this.attendanceService.recordManualAttendance({
      adminUserId,
      memberId: body.memberId,
      meetingId: body?.meetingId,
      status: body.status,
      reason: body.reason,
      actualArrivalTime: body.actualArrivalTime,
    });
  }

  @Get('meeting/:meetingId')
  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('attendance.read')
  async getMeetingAttendance(@Param('meetingId') meetingId: string) {
    return this.attendanceService.getMeetingAttendance(meetingId);
  }

  @Get('my-history')
  async getMyAttendanceHistory(@CurrentUser('memberId') memberId: string) {
    return this.attendanceService.getMemberAttendance(memberId);
  }

  @Get('member/:memberId')
  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('attendance.read')
  async getMemberAttendance(@Param('memberId') memberId: string) {
    return this.attendanceService.getMemberAttendance(memberId);
  }

  @Post('headcount')
  @RequirePermissions('headcount.record')
  async recordHeadcount(@CurrentUser('userId') actorUserId: string, @Body() body: any) {
    return this.attendanceService.recordServiceHeadcount(body, actorUserId);
  }

  @Get('headcount/stats')
  @RequirePermissions('headcount.read')
  async getHeadcountStats(@Query() query: any) {
    return this.attendanceService.getHeadcountAnalytics(query);
  }

  @Get('headcount/:meetingId')
  @RequirePermissions('headcount.read')
  async getServiceHeadcount(@Param('meetingId') meetingId: string) {
    return this.attendanceService.getServiceHeadcount(meetingId);
  }
}
