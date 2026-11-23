import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  CorrelatedAssignmentItem,
  DashboardAnalyticsResponse,
  TimetableAnalyticsService,
  TimetableSearchFilterDto,
} from './timetable-analytics.service';

@Injectable()
export class TimetableReportExcelService {
  private readonly logger = new Logger(TimetableReportExcelService.name);

  constructor(
    @Inject(forwardRef(() => TimetableAnalyticsService))
    private readonly analyticsService?: TimetableAnalyticsService,
  ) {}

  /**
   * Generates a multi-sheet analytical Excel report given search filters and an optional author.
   */
  async generateReport(
    reportType: string,
    dto: TimetableSearchFilterDto,
    generatedBy?: string,
  ): Promise<Buffer> {
    if (!this.analyticsService) throw new Error('Analytics service not available');
    const dateRange = this.analyticsService.parseDateRange(dto);
    const analytics = await this.analyticsService.getDashboardAnalytics(dto);
    const items = await this.analyticsService.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: dto,
    });
    return this.generateExcel({
      analytics,
      items,
    });
  }

  /**
   * Generates a multi-sheet, executive-grade analytical Excel workbook using ExcelJS.
   */
  async generateExcel(data: {
    analytics: DashboardAnalyticsResponse;
    items: CorrelatedAssignmentItem[];
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "The Father's House Church (TFHC) · Orderliness Unit";
    workbook.lastModifiedBy = 'TFHC Orderliness Reporting Engine';
    workbook.created = new Date();
    workbook.modified = new Date();

    const navyFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    const whiteFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    // -------------------------------------------------------------------------
    // SHEET 1: EXECUTIVE SUMMARY
    // -------------------------------------------------------------------------
    const summarySheet = workbook.addWorksheet('Executive Summary', {
      views: [{ showGridLines: true }],
    });

    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 25 },
      { header: 'Context / Benchmark', key: 'context', width: 45 },
    ];

    summarySheet.getRow(1).fill = navyFill;
    summarySheet.getRow(1).font = whiteFont;
    summarySheet.getRow(1).height = 24;

    const s = data.analytics.summary;
    const att = data.analytics.attendanceSummary;
    const p = data.analytics.reportingPeriod;

    const summaryRows = [
      { metric: 'Reporting Period', value: p.label, context: `${p.startDate} to ${p.endDate}` },
      { metric: 'Total Service Sessions', value: s.totalSessions, context: 'Designated weekly services' },
      { metric: 'Total Scheduled Ushers', value: s.totalAssignments, context: 'Total assignment slots' },
      { metric: 'Unique Members Assigned', value: s.totalUniqueMembersAssigned, context: 'Active members scheduled' },
      { metric: 'Completed Usher Assignments', value: att.completedAssignments, context: 'Services already held' },
      { metric: 'Present & Punctual', value: att.totalPresent, context: `${att.punctualRatePercent}% punctuality rate` },
      { metric: 'Late Arrivals', value: att.totalLate, context: 'Clocked in after grace period' },
      { metric: 'Absent / Missing Clock-In', value: att.totalAbsent, context: `${att.totalMissingClockIn} failed clock-ins` },
      { metric: 'Excused Absences', value: att.totalExcused, context: 'Verified via approved excuse request' },
      { metric: 'Overall Attendance Rate', value: `${att.attendanceRatePercent}%`, context: 'Present + Late / Completed' },
      { metric: 'Staffing Coverage Rate', value: `${att.serviceCoveragePercent}%`, context: 'Assigned vs Required Ushers' },
      { metric: 'Average Assignments / Active Usher', value: s.averageAssignmentsPerMember, context: 'Fairness measure' },
      { metric: 'Timetables Published', value: s.totalPublishedTimetables, context: 'Officially published periods' },
      { metric: 'Manual Assignment Adjustments', value: s.manualAdjustmentCount, context: `${s.modificationRatePercent}% adjustment rate` },
      { metric: 'Average Approval Turnaround', value: `${s.averageTurnaroundHours} hrs`, context: 'Time to 3 reviewer approvals' },
    ];

    summaryRows.forEach((r) => {
      const row = summarySheet.addRow(r);
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // -------------------------------------------------------------------------
    // SHEET 2: TIMETABLE ASSIGNMENTS
    // -------------------------------------------------------------------------
    const assignmentsSheet = workbook.addWorksheet('Timetable Assignments', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    assignmentsSheet.columns = [
      { header: 'Period Label', key: 'periodLabel', width: 25 },
      { header: 'Service Date', key: 'serviceDate', width: 14 },
      { header: 'Service Session', key: 'serviceName', width: 28 },
      { header: 'Service Day', key: 'serviceDay', width: 14 },
      { header: 'Start Time', key: 'startTime', width: 12 },
      { header: 'Member ID', key: 'memberCode', width: 16 },
      { header: 'Full Name', key: 'memberName', width: 26 },
      { header: 'Phone Number', key: 'memberPhone', width: 16 },
      { header: 'Assigned Role', key: 'role', width: 15 },
      { header: 'Assigned Position', key: 'position', width: 18 },
      { header: 'Manual Adjustment?', key: 'isManualAdjustment', width: 18 },
      { header: 'Supervising Minister', key: 'supervisingMinisterName', width: 25 },
      { header: 'Version Status', key: 'versionStatus', width: 16 },
    ];

    assignmentsSheet.getRow(1).fill = navyFill;
    assignmentsSheet.getRow(1).font = whiteFont;
    assignmentsSheet.getRow(1).height = 24;

    data.items.forEach((item) => {
      const row = assignmentsSheet.addRow({
        periodLabel: item.periodLabel,
        serviceDate: item.serviceDate,
        serviceName: item.serviceName,
        serviceDay: item.serviceDay,
        startTime: item.startTime ? new Date(item.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
        memberCode: item.memberCode,
        memberName: item.memberName,
        memberPhone: item.memberPhone || '',
        role: item.role,
        position: item.position || 'Usher',
        isManualAdjustment: item.isManualAdjustment ? 'YES' : 'NO',
        supervisingMinisterName: item.supervisingMinisterName || 'Not Assigned',
        versionStatus: item.versionStatus,
      });
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // -------------------------------------------------------------------------
    // SHEET 3: ATTENDANCE RECORDS (Correlated)
    // -------------------------------------------------------------------------
    const attendanceSheet = workbook.addWorksheet('Attendance Records', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    attendanceSheet.columns = [
      { header: 'Service Date', key: 'serviceDate', width: 14 },
      { header: 'Service Session', key: 'serviceName', width: 28 },
      { header: 'Member ID', key: 'memberCode', width: 16 },
      { header: 'Member Name', key: 'memberName', width: 26 },
      { header: 'Attendance Status', key: 'attendanceStatus', width: 20 },
      { header: 'Sub Status', key: 'subStatus', width: 22 },
      { header: 'Clock-In Recorded?', key: 'clockInRecorded', width: 18 },
      { header: 'Clock-In Time', key: 'clockInTime', width: 16 },
      { header: 'Discrepancy?', key: 'isDiscrepancy', width: 16 },
      { header: 'Discrepancy Reason', key: 'discrepancyReason', width: 35 },
      { header: 'Meeting Linked', key: 'meetingTitle', width: 25 },
    ];

    attendanceSheet.getRow(1).fill = navyFill;
    attendanceSheet.getRow(1).font = whiteFont;
    attendanceSheet.getRow(1).height = 24;

    data.items.forEach((item) => {
      const row = attendanceSheet.addRow({
        serviceDate: item.serviceDate,
        serviceName: item.serviceName,
        memberCode: item.memberCode,
        memberName: item.memberName,
        attendanceStatus: item.attendanceStatus,
        subStatus: item.subStatus || '',
        clockInRecorded: item.clockInRecorded ? 'YES' : 'NO',
        clockInTime: item.clockInTime ? new Date(item.clockInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
        isDiscrepancy: item.isDiscrepancy ? 'FLAGGED' : 'NO',
        discrepancyReason: item.discrepancyReason || '',
        meetingTitle: item.meetingTitle || 'Pending Meeting',
      });
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // -------------------------------------------------------------------------
    // SHEET 4: MEMBER PERFORMANCE
    // -------------------------------------------------------------------------
    const memberSheet = workbook.addWorksheet('Member Performance', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    memberSheet.columns = [
      { header: 'Member ID', key: 'memberCode', width: 16 },
      { header: 'Full Name', key: 'memberName', width: 26 },
      { header: 'Total Assigned', key: 'assigned', width: 16 },
      { header: 'Completed', key: 'completed', width: 15 },
      { header: 'Present', key: 'present', width: 12 },
      { header: 'Late', key: 'late', width: 12 },
      { header: 'Absent', key: 'absent', width: 12 },
      { header: 'Excused', key: 'excused', width: 12 },
      { header: 'Attendance %', key: 'attendanceRate', width: 16 },
    ];

    memberSheet.getRow(1).fill = navyFill;
    memberSheet.getRow(1).font = whiteFont;
    memberSheet.getRow(1).height = 24;

    const memberMap = new Map<string, {
      memberCode: string;
      memberName: string;
      assigned: number;
      completed: number;
      present: number;
      late: number;
      absent: number;
      excused: number;
    }>();

    data.items.forEach((item) => {
      let m = memberMap.get(item.memberId);
      if (!m) {
        m = {
          memberCode: item.memberCode,
          memberName: item.memberName,
          assigned: 0,
          completed: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
        };
        memberMap.set(item.memberId, m);
      }
      m.assigned++;
      if (item.isCompleted) {
        m.completed++;
        if (item.attendanceStatus === 'PRESENT') m.present++;
        else if (item.attendanceStatus === 'LATE') m.late++;
        else if (item.attendanceStatus === 'ABSENT') m.absent++;
        else if (item.attendanceStatus === 'EXCUSED') m.excused++;
      }
    });

    Array.from(memberMap.values())
      .sort((a, b) => b.assigned - a.assigned)
      .forEach((m) => {
        const denom = m.completed > 0 ? m.completed : 1;
        const rate = Number((((m.present + m.late) / denom) * 100).toFixed(1));
        const row = memberSheet.addRow({
          memberCode: m.memberCode,
          memberName: m.memberName,
          assigned: m.assigned,
          completed: m.completed,
          present: m.present,
          late: m.late,
          absent: m.absent,
          excused: m.excused,
          attendanceRate: `${rate}%`,
        });
        row.eachCell((cell) => {
          cell.border = thinBorder;
        });
      });

    // -------------------------------------------------------------------------
    // SHEET 5: SERVICE ANALYTICS
    // -------------------------------------------------------------------------
    const serviceSheet = workbook.addWorksheet('Service Analytics', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    serviceSheet.columns = [
      { header: 'Session Key', key: 'sessionKey', width: 22 },
      { header: 'Service Name', key: 'serviceName', width: 28 },
      { header: 'Day of Week', key: 'serviceDay', width: 15 },
      { header: 'Services Held', key: 'totalSessions', width: 15 },
      { header: 'Required Ushers', key: 'requiredUshers', width: 16 },
      { header: 'Assigned Ushers', key: 'assignedUshers', width: 16 },
      { header: 'Coverage %', key: 'coveragePercent', width: 15 },
      { header: 'Completed Count', key: 'completedCount', width: 16 },
      { header: 'Present', key: 'presentCount', width: 12 },
      { header: 'Late', key: 'lateCount', width: 12 },
      { header: 'Absent', key: 'absentCount', width: 12 },
      { header: 'Attendance %', key: 'attendanceRatePercent', width: 16 },
    ];

    serviceSheet.getRow(1).fill = navyFill;
    serviceSheet.getRow(1).font = whiteFont;
    serviceSheet.getRow(1).height = 24;

    data.analytics.serviceBreakdown.forEach((sb) => {
      const row = serviceSheet.addRow({
        sessionKey: sb.sessionKey,
        serviceName: sb.serviceName,
        serviceDay: sb.serviceDay,
        totalSessions: sb.totalSessions,
        requiredUshers: sb.requiredUshers,
        assignedUshers: sb.assignedUshers,
        coveragePercent: `${sb.coveragePercent}%`,
        completedCount: sb.completedCount,
        presentCount: sb.presentCount,
        lateCount: sb.lateCount,
        absentCount: sb.absentCount,
        attendanceRatePercent: `${sb.attendanceRatePercent}%`,
      });
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // -------------------------------------------------------------------------
    // SHEET 6: SUPERVISING MINISTER SUMMARY
    // -------------------------------------------------------------------------
    const ministerSheet = workbook.addWorksheet('Supervising Minister Summary', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    ministerSheet.columns = [
      { header: 'Minister Name', key: 'ministerName', width: 28 },
      { header: 'Services Supervised', key: 'servicesSupervised', width: 20 },
      { header: 'Total Scheduled Ushers', key: 'totalScheduledUshers', width: 22 },
      { header: 'Present Ushers', key: 'presentUshers', width: 16 },
      { header: 'Absent Ushers', key: 'absentUshers', width: 16 },
      { header: 'Attendance Rate %', key: 'attendanceRatePercent', width: 18 },
    ];

    ministerSheet.getRow(1).fill = navyFill;
    ministerSheet.getRow(1).font = whiteFont;
    ministerSheet.getRow(1).height = 24;

    data.analytics.supervisingMinisterBreakdown.forEach((sm) => {
      const row = ministerSheet.addRow({
        ministerName: sm.ministerName,
        servicesSupervised: sm.servicesSupervised,
        totalScheduledUshers: sm.totalScheduledUshers,
        presentUshers: sm.presentUshers,
        absentUshers: sm.absentUshers,
        attendanceRatePercent: `${sm.attendanceRatePercent}%`,
      });
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // -------------------------------------------------------------------------
    // SHEET 7: ASSIGNMENT DISTRIBUTION & FAIRNESS
    // -------------------------------------------------------------------------
    const fairnessSheet = workbook.addWorksheet('Assignment Distribution', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }],
    });

    fairnessSheet.columns = [
      { header: 'Distribution Bucket', key: 'bucket', width: 25 },
      { header: 'Member Count', key: 'memberCount', width: 18 },
      { header: 'Percentage of Active Workforce', key: 'pct', width: 30 },
    ];

    fairnessSheet.getRow(1).fill = navyFill;
    fairnessSheet.getRow(1).font = whiteFont;
    fairnessSheet.getRow(1).height = 24;

    const totalEligible = data.analytics.fairness.totalEligibleMembers || 1;
    data.analytics.fairness.distributionHistogram.forEach((dh) => {
      const pct = Number(((dh.memberCount / totalEligible) * 100).toFixed(1));
      const row = fairnessSheet.addRow({
        bucket: dh.bucket,
        memberCount: dh.memberCount,
        pct: `${pct}%`,
      });
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
