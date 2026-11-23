import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  TimetableAnalyticsService,
  TimetableSearchFilterDto,
  DatePreset,
} from './timetable-analytics.service';
import {
  TimetableReportPdfService,
  TimetableReportType,
} from './timetable-report-pdf.service';
import { TimetableReportExcelService } from './timetable-report-excel.service';

@Controller('timetable/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimetableAnalyticsController {
  constructor(
    private readonly analyticsService: TimetableAnalyticsService,
    private readonly pdfService: TimetableReportPdfService,
    private readonly excelService: TimetableReportExcelService,
  ) {}

  private normalizeQuery(rawQuery: any): TimetableSearchFilterDto {
    const dto: TimetableSearchFilterDto = {};

    if (rawQuery.search) dto.search = String(rawQuery.search).trim();
    if (rawQuery.datePreset) dto.datePreset = String(rawQuery.datePreset).toUpperCase() as DatePreset;
    if (rawQuery.startDate) dto.startDate = String(rawQuery.startDate);
    if (rawQuery.endDate) dto.endDate = String(rawQuery.endDate);
    if (rawQuery.serviceDate) dto.serviceDate = String(rawQuery.serviceDate);

    if (rawQuery.sessionKeys) {
      dto.sessionKeys = Array.isArray(rawQuery.sessionKeys)
        ? rawQuery.sessionKeys
        : String(rawQuery.sessionKeys).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (rawQuery.supervisingMinisterIds) {
      dto.supervisingMinisterIds = Array.isArray(rawQuery.supervisingMinisterIds)
        ? rawQuery.supervisingMinisterIds
        : String(rawQuery.supervisingMinisterIds).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (rawQuery.memberIds) {
      dto.memberIds = Array.isArray(rawQuery.memberIds)
        ? rawQuery.memberIds
        : String(rawQuery.memberIds).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (rawQuery.positions) {
      dto.positions = Array.isArray(rawQuery.positions)
        ? rawQuery.positions
        : String(rawQuery.positions).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (rawQuery.attendanceStatuses) {
      const arr = Array.isArray(rawQuery.attendanceStatuses)
        ? rawQuery.attendanceStatuses
        : String(rawQuery.attendanceStatuses).split(',').map((s) => s.trim()).filter(Boolean);
      dto.attendanceStatuses = arr as any;
    }

    if (rawQuery.clockInFilter) {
      dto.clockInFilter = String(rawQuery.clockInFilter).toUpperCase() as any;
    }

    if (rawQuery.timetableStatuses) {
      dto.timetableStatuses = Array.isArray(rawQuery.timetableStatuses)
        ? rawQuery.timetableStatuses
        : String(rawQuery.timetableStatuses).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (rawQuery.isManualAdjustment !== undefined) {
      dto.isManualAdjustment = rawQuery.isManualAdjustment === 'true' || rawQuery.isManualAdjustment === true;
    }

    if (rawQuery.assignmentFrequency) {
      dto.assignmentFrequency = String(rawQuery.assignmentFrequency).toUpperCase() as any;
    }

    if (rawQuery.page) dto.page = parseInt(String(rawQuery.page), 10);
    if (rawQuery.limit) dto.limit = parseInt(String(rawQuery.limit), 10);
    if (rawQuery.sortBy) dto.sortBy = String(rawQuery.sortBy) as any;
    if (rawQuery.sortOrder) dto.sortOrder = String(rawQuery.sortOrder).toLowerCase() as any;

    return dto;
  }

  @Get('dashboard')
  @RequirePermissions('timetable.read')
  async getDashboard(@Query() query: any) {
    const dto = this.normalizeQuery(query);
    return this.analyticsService.getDashboardAnalytics(dto);
  }

  @Get('search')
  @RequirePermissions('timetable.read')
  async searchAssignments(@Query() query: any) {
    const dto = this.normalizeQuery(query);
    return this.analyticsService.searchAssignments(dto);
  }

  @Get('member/:id')
  @RequirePermissions('timetable.read')
  async getMemberAnalytics(@Param('id') memberId: string, @Query() query: any) {
    const dto = this.normalizeQuery(query);
    return this.analyticsService.getMemberAnalytics(memberId, dto);
  }

  @Get('service/:sessionKey')
  @RequirePermissions('timetable.read')
  async getServiceAnalytics(@Param('sessionKey') sessionKey: string, @Query() query: any) {
    const dto = this.normalizeQuery(query);
    return this.analyticsService.getServiceAnalytics(sessionKey, dto);
  }

  @Get('minister/:id')
  @RequirePermissions('timetable.read')
  async getMinisterAnalytics(@Param('id') ministerId: string, @Query() query: any) {
    const dto = this.normalizeQuery(query);
    return this.analyticsService.getMinisterAnalytics(ministerId, dto);
  }

  @Get('export/pdf')
  @RequirePermissions('timetable.read')
  async exportPdf(
    @Query() query: any,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const dto = this.normalizeQuery(query);
    const reportType: TimetableReportType = query.reportType || 'COMPREHENSIVE_MANAGEMENT';

    const dateRange = this.analyticsService.parseDateRange(dto);
    const analytics = await this.analyticsService.getDashboardAnalytics(dto);
    const items = await this.analyticsService.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: dto,
    });

    const pdfBuffer = await this.pdfService.generatePdf({
      reportType,
      analytics,
      items,
      generatedBy: user.email,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `TFHC_${reportType}_${timestamp}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.end(pdfBuffer);
  }

  @Get('export/excel')
  @RequirePermissions('timetable.read')
  async exportExcel(
    @Query() query: any,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const dto = this.normalizeQuery(query);

    const dateRange = this.analyticsService.parseDateRange(dto);
    const analytics = await this.analyticsService.getDashboardAnalytics(dto);
    const items = await this.analyticsService.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: dto,
    });

    const excelBuffer = await this.excelService.generateExcel({
      analytics,
      items,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `TFHC_Timetable_Analytics_${timestamp}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuffer.length,
    });

    return res.end(excelBuffer);
  }
}
