import { Controller, Get, Put, Body, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LEADER)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('settings')
  async settings() { return this.reportsService.settings(); }
  @Roles(Role.ADMIN)
  @Put('settings')
  async updateSettings(@Body() body: any) { return this.reportsService.updateSettings(body); }

  @Get('analytics')
  async analytics(@Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) { return this.reportsService.getAnalytics(days === undefined ? 30 : Number(days), from, to); }

  @Get('dashboard')
  async getDashboard() {
    return this.reportsService.getUnitDashboardStats();
  }

  @Get('export/csv')
  async exportCsv(@Res() res: Response) {
    const csv = await this.reportsService.generateCsvReport();
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="TFHC_Attendance_Report.csv"');
    res.send(csv);
  }

  @Get('export/excel')
  async exportExcel(@Res() res: Response) {
    const buffer = await this.reportsService.generateExcelReport();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="TFHC_Attendance_Report.xlsx"'
    );
    res.send(buffer);
  }
}
