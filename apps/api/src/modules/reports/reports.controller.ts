import { Controller, Get, Put, Body, Query, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, ReportQueryDto } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.LEADER)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('settings')
  @RequirePermissions('settings.read')
  async settings() {
    return this.reportsService.settings();
  }

  @Roles(Role.ADMIN)
  @RequirePermissions('settings.update')
  @Put('settings')
  async updateSettings(@Body() body: any) {
    return this.reportsService.updateSettings(body);
  }

  @Get('filter-options')
  @RequirePermissions('reports.view')
  async filterOptions() {
    return this.reportsService.filterOptions();
  }

  @Get('availability-attendance')
  @RequirePermissions('reports.view')
  async getAvailabilityAttendanceReport(@Query() query: ReportQueryDto) {
    return this.reportsService.getAvailabilityAttendanceReport(query);
  }

  @Get('person-summary/:memberId')
  @RequirePermissions('reports.view')
  async getPersonReport(@Param('memberId') memberId: string, @Query() query: ReportQueryDto) {
    return this.reportsService.getPersonReport(memberId, query);
  }

  @Get('service-summary/:meetingId')
  @RequirePermissions('reports.view')
  async getServiceReport(@Param('meetingId') meetingId: string) {
    return this.reportsService.getServiceReport(meetingId);
  }

  @Get('analytics')
  @RequirePermissions('reports.view')
  async analytics(
    @Query()
    query: {
      days?: string;
      from?: string;
      to?: string;
      categoryId?: string;
      memberId?: string;
      subTeamId?: string;
    },
  ) {
    return this.reportsService.getAnalytics(
      query.days === undefined ? 30 : Number(query.days),
      query.from,
      query.to,
      query,
    );
  }

  @Get('dashboard')
  @RequirePermissions('reports.view')
  async getDashboard() {
    return this.reportsService.getUnitDashboardStats();
  }

  @Get('export/csv')
  @RequirePermissions('reports.export')
  async exportCsv(@Query() query: ReportQueryDto, @Res() res: Response) {
    const csv = await this.reportsService.generateFilteredCsv(query);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="TFHC_Attendance_Availability_Report_${dateStr}.csv"`);
    res.send(csv);
  }

  @Get('export/excel')
  @RequirePermissions('reports.export')
  async exportExcel(@Query() query: ReportQueryDto, @Res() res: Response) {
    const buffer = await this.reportsService.generateFilteredExcel(query);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="TFHC_Attendance_Availability_Report_${dateStr}.xlsx"`,
    );
    res.send(buffer);
  }
}
