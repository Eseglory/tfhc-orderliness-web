import { Controller, Get, Res, UseGuards } from '@nestjs/common';
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

  @Get('dashboard')
  async getDashboard() {
    return this.reportsService.getUnitDashboardStats();
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
