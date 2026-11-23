import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  CorrelatedAssignmentItem,
  DashboardAnalyticsResponse,
  TimetableAnalyticsService,
  TimetableSearchFilterDto,
} from './timetable-analytics.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

export type TimetableReportType =
  | 'WEEKLY_TIMETABLE'
  | 'MONTHLY_TIMETABLE'
  | 'ATTENDANCE_PERFORMANCE'
  | 'MEMBER_ATTENDANCE'
  | 'SERVICE_PERFORMANCE'
  | 'ASSIGNMENT_FAIRNESS'
  | 'SUPERVISING_MINISTER'
  | 'COMPREHENSIVE_MANAGEMENT';

interface ColumnDef {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

@Injectable()
export class TimetableReportPdfService {
  private readonly logger = new Logger(TimetableReportPdfService.name);

  constructor(
    @Inject(forwardRef(() => TimetableAnalyticsService))
    private readonly analyticsService?: TimetableAnalyticsService,
  ) {}

  /**
   * Generates a report given search filters and an optional author.
   */
  async generateReport(
    reportType: TimetableReportType,
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
    return this.generatePdf({
      reportType,
      analytics,
      items,
      generatedBy,
    });
  }

  /**
   * Generates a publication-grade, professionally branded TFHC executive PDF report.
   */
  async generatePdf(data: {
    reportType: TimetableReportType;
    analytics: DashboardAnalyticsResponse;
    items: CorrelatedAssignmentItem[];
    generatedBy?: string;
  }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const marginX = 28;
        const marginTop = 24;
        const marginBottom = 28;

        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
          bufferPages: true,
          info: {
            Title: this.resolveReportTitle(data.reportType),
            Author: "The Father's House Church (TFHC) · Orderliness Unit",
            Subject: 'Executive Timetable & Attendance Intelligence Report',
            Creator: 'TFHC Orderliness Reporting Engine',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => {
          this.logger.error('PDF generation stream error', err);
          reject(err);
        });

        const pageWidth = doc.page.width; // 841.89 pt
        const pageHeight = doc.page.height; // 595.28 pt
        const contentWidth = pageWidth - marginX * 2; // 785.89 pt
        const maxContentY = pageHeight - 35; // boundary before page break

        // Theme palette
        const cNavy = '#0F172A';
        const cSlateNavy = '#1E293B';
        const cMuted = '#64748B';
        const cBorder = '#E2E8F0';
        const cAltRow = '#F8FAFC';
        const cEmerald = '#059669';
        const cRose = '#E11D48';
        const cAmber = '#D97706';
        const cBlue = '#2563EB';

        // 1. HEADER (Page 1)
        this.drawHeader(doc, marginX, contentWidth, data);

        // 2. EXECUTIVE SUMMARY CARDS (Page 1)
        this.drawKpiSummaryCards(doc, marginX, contentWidth, data.analytics);

        // 3. FACTUAL OBSERVATIONS & EXECUTIVE ANALYSIS BLOCK
        this.drawFactualObservations(doc, marginX, contentWidth, data.analytics);

        // 4. DATA TABLE (with automated pagination)
        this.drawDataTable(doc, marginX, contentWidth, maxContentY, data);

        // 5. FOOTER ON ALL PAGES
        this.drawFooters(doc, marginX, contentWidth, data);

        doc.end();
      } catch (err) {
        this.logger.error('Failed to generate timetable PDF report', err as Error);
        reject(err);
      }
    });
  }

  private resolveReportTitle(type: TimetableReportType): string {
    switch (type) {
      case 'WEEKLY_TIMETABLE':
        return 'WEEKLY USHERING TIMETABLE & ROSTER REPORT';
      case 'MONTHLY_TIMETABLE':
        return 'MONTHLY USHERING SCHEDULE & COVERAGE REPORT';
      case 'ATTENDANCE_PERFORMANCE':
        return 'SCHEDULED VS ACTUAL ATTENDANCE PERFORMANCE REPORT';
      case 'MEMBER_ATTENDANCE':
        return 'MEMBER USHERING ATTENDANCE & PARTICIPATION REPORT';
      case 'SERVICE_PERFORMANCE':
        return 'SERVICE-LEVEL ATTENDANCE & STAFFING REPORT';
      case 'ASSIGNMENT_FAIRNESS':
        return 'USHERING ASSIGNMENT FAIRNESS & DISTRIBUTION REPORT';
      case 'SUPERVISING_MINISTER':
        return 'SUPERVISING MINISTER OPERATIONS & STAFFING REPORT';
      case 'COMPREHENSIVE_MANAGEMENT':
      default:
        return 'EXECUTIVE MANAGEMENT REPORT · TIMETABLE & ATTENDANCE';
    }
  }

  private drawHeader(doc: any, startX: number, width: number, data: any) {
    const title = this.resolveReportTitle(data.reportType);
    const periodStr = `${data.analytics.reportingPeriod.label} (${data.analytics.reportingPeriod.startDate} to ${data.analytics.reportingPeriod.endDate})`;

    // Header badge
    doc.roundedRect(startX, 18, width, 52, 6).fillAndStroke('#F1F5F9', '#CBD5E1');

    // TFHC Branding
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text("THE FATHER'S HOUSE CHURCH", startX + 14, 25);
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('ORDERLINESS UNIT · WORKFORCE MANAGEMENT', startX + 14, 38);
    doc.fillColor('#0284C7').font('Helvetica').fontSize(6.5).text('AUTOMATED USHERING SCHEDULING & ATTENDANCE INTELLIGENCE SYSTEM', startX + 14, 48);

    // Right-aligned report details
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(title, startX + width - 360, 25, { width: 346, align: 'right' });
    doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Reporting Period: ${periodStr}`, startX + width - 360, 38, { width: 346, align: 'right' });
    doc.fillColor('#64748B').font('Helvetica').fontSize(6.5).text(
      `Generated on: ${new Date().toUTCString()} · Generated By: ${data.generatedBy || 'System Administrator'}`,
      startX + width - 360,
      48,
      { width: 346, align: 'right' },
    );
  }

  private drawKpiSummaryCards(doc: any, startX: number, totalWidth: number, a: DashboardAnalyticsResponse) {
    const cardY = 76;
    const cardHeight = 44;
    const gap = 8;
    const cardWidth = (totalWidth - gap * 5) / 6;

    const cards = [
      {
        label: 'SCHEDULED USHERS',
        val: a.summary.totalAssignments.toLocaleString(),
        sub: `${a.summary.totalSessions} Service Sessions`,
        color: '#0F172A',
        bg: '#F8FAFC',
        border: '#CBD5E1',
      },
      {
        label: 'PRESENT & ON TIME',
        val: a.attendanceSummary.totalPresent.toLocaleString(),
        sub: `${a.attendanceSummary.punctualRatePercent}% Punctuality Rate`,
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
      },
      {
        label: 'LATE ARRIVALS',
        val: a.attendanceSummary.totalLate.toLocaleString(),
        sub: 'Clocked In After Grace',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
      },
      {
        label: 'ABSENT / MISSING',
        val: a.attendanceSummary.totalAbsent.toLocaleString(),
        sub: `${a.attendanceSummary.totalMissingClockIn} Failed Clock-Ins`,
        color: '#E11D48',
        bg: '#FFF1F2',
        border: '#FECDD3',
      },
      {
        label: 'ATTENDANCE RATE',
        val: `${a.attendanceSummary.attendanceRatePercent}%`,
        sub: `Based on ${a.attendanceSummary.completedAssignments} Completed`,
        color: a.attendanceSummary.attendanceRatePercent >= 75 ? '#059669' : '#E11D48',
        bg: '#F0FDF4',
        border: '#BBF7D0',
      },
      {
        label: 'STAFFING COVERAGE',
        val: `${a.attendanceSummary.serviceCoveragePercent}%`,
        sub: `${a.fairness.totalEligibleMembers} Active Candidates`,
        color: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
      },
    ];

    cards.forEach((c, idx) => {
      const x = startX + idx * (cardWidth + gap);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 4).fillAndStroke(c.bg, c.border);

      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6).text(c.label, x + 6, cardY + 6, { width: cardWidth - 12 });
      doc.fillColor(c.color).font('Helvetica-Bold').fontSize(12).text(c.val, x + 6, cardY + 16, { width: cardWidth - 12 });
      doc.fillColor('#64748B').font('Helvetica').fontSize(5.5).text(c.sub, x + 6, cardY + 31, { width: cardWidth - 12 });
    });
  }

  private drawFactualObservations(doc: any, startX: number, width: number, a: DashboardAnalyticsResponse) {
    const boxY = 126;
    const boxHeight = 32;

    doc.roundedRect(startX, boxY, width, boxHeight, 4).fillAndStroke('#F8FAFC', '#E2E8F0');

    // Title pill
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7).text('MANAGEMENT SUMMARY & OBSERVATIONS:', startX + 8, boxY + 6);

    const obs1 = `• Overall attendance rate stands at ${a.attendanceSummary.attendanceRatePercent}% across ${a.attendanceSummary.completedAssignments} completed scheduled usher assignments.`;
    const obs2 = `• Staffing coverage reached ${a.attendanceSummary.serviceCoveragePercent}% across ${a.summary.totalSessions} services with an average of ${a.fairness.averageAssignmentsPerEligible} assignments per active member.`;
    const obs3 = `• ${a.attendanceSummary.totalDiscrepancies} scheduling or attendance discrepancies were logged; ${a.attendanceSummary.totalMissingClockIn} ushers failed to clock in for completed services.`;

    doc.fillColor('#334155').font('Helvetica').fontSize(6.5).text(`${obs1}  ${obs2}  ${obs3}`, startX + 8, boxY + 17, {
      width: width - 16,
      lineBreak: false,
    });
  }

  private drawDataTable(doc: any, startX: number, totalWidth: number, maxY: number, data: any) {
    let currentY = 166;

    // Define table columns (Total = 785 pt)
    const columns: ColumnDef[] = [
      { key: 'date', label: 'DATE', width: 62, align: 'left' },
      { key: 'service', label: 'SERVICE / SESSION', width: 140, align: 'left' },
      { key: 'minister', label: 'SUPERVISING MINISTER', width: 120, align: 'left' },
      { key: 'memberCode', label: 'MEMBER ID', width: 75, align: 'left' },
      { key: 'memberName', label: 'USHER FULL NAME', width: 125, align: 'left' },
      { key: 'position', label: 'POSITION / ROLE', width: 85, align: 'left' },
      { key: 'clockIn', label: 'CLOCK-IN TIME', width: 80, align: 'center' },
      { key: 'status', label: 'ATTENDANCE STATUS', width: 98, align: 'center' },
    ];

    const drawTableHeader = (y: number) => {
      doc.rect(startX, y, totalWidth, 16).fill('#0F172A');
      let curX = startX;
      columns.forEach((col) => {
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6).text(col.label, curX + 4, y + 5, {
          width: col.width - 8,
          align: col.align,
        });
        curX += col.width;
      });
      return y + 16;
    };

    currentY = drawTableHeader(currentY);

    const items = data.items;
    const rowHeight = 15;

    items.forEach((item: CorrelatedAssignmentItem, index: number) => {
      if (currentY + rowHeight > maxY) {
        doc.addPage();
        currentY = 24;
        currentY = drawTableHeader(currentY);
      }

      const isAlt = index % 2 === 1;
      if (isAlt) {
        doc.rect(startX, currentY, totalWidth, rowHeight).fill('#F8FAFC');
      }

      // Border line
      doc.moveTo(startX, currentY + rowHeight).lineTo(startX + totalWidth, currentY + rowHeight).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      let curX = startX;

      // Date
      doc.fillColor('#0F172A').font('Helvetica').fontSize(6).text(item.serviceDate, curX + 4, currentY + 4, {
        width: columns[0].width - 8,
        align: 'left',
      });
      curX += columns[0].width;

      // Service
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(6).text(item.serviceName, curX + 4, currentY + 4, {
        width: columns[1].width - 8,
        align: 'left',
      });
      curX += columns[1].width;

      // Supervising Minister
      doc.fillColor('#334155').font('Helvetica').fontSize(6).text(item.supervisingMinisterName || 'Not Assigned', curX + 4, currentY + 4, {
        width: columns[2].width - 8,
        align: 'left',
      });
      curX += columns[2].width;

      // Member ID
      doc.fillColor('#475569').font('Helvetica').fontSize(6).text(item.memberCode, curX + 4, currentY + 4, {
        width: columns[3].width - 8,
        align: 'left',
      });
      curX += columns[3].width;

      // Usher Full Name
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(6).text(item.memberName, curX + 4, currentY + 4, {
        width: columns[4].width - 8,
        align: 'left',
      });
      curX += columns[4].width;

      // Position
      doc.fillColor('#334155').font('Helvetica').fontSize(6).text(item.position || item.role || 'Usher', curX + 4, currentY + 4, {
        width: columns[5].width - 8,
        align: 'left',
      });
      curX += columns[5].width;

      // Clock-in
      const clockInText = item.clockInTime ? new Date(item.clockInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
      doc.fillColor(item.clockInRecorded ? '#059669' : '#94A3B8').font('Helvetica').fontSize(6).text(clockInText, curX + 4, currentY + 4, {
        width: columns[6].width - 8,
        align: 'center',
      });
      curX += columns[6].width;

      // Attendance Status Badge
      let statusColor = '#475569';
      let statusBg = '#F1F5F9';
      let statusLabel = item.attendanceStatus;

      if (item.attendanceStatus === 'PRESENT') {
        statusColor = '#065F46';
        statusBg = '#D1FAE5';
        statusLabel = 'PRESENT';
      } else if (item.attendanceStatus === 'LATE') {
        statusColor = '#92400E';
        statusBg = '#FEF3C7';
        statusLabel = 'LATE';
      } else if (item.attendanceStatus === 'ABSENT') {
        statusColor = '#991B1B';
        statusBg = '#FEE2E2';
        statusLabel = 'ABSENT';
      } else if (item.attendanceStatus === 'EXCUSED') {
        statusColor = '#1E40AF';
        statusBg = '#DBEAFE';
        statusLabel = 'EXCUSED';
      } else if (item.attendanceStatus === 'SCHEDULED') {
        statusColor = '#374151';
        statusBg = '#E5E7EB';
        statusLabel = 'SCHEDULED';
      }

      const badgeWidth = 60;
      const badgeX = curX + (columns[7].width - badgeWidth) / 2;
      doc.roundedRect(badgeX, currentY + 2.5, badgeWidth, 10, 2).fill(statusBg);
      doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(5.5).text(statusLabel, badgeX, currentY + 4, {
        width: badgeWidth,
        align: 'center',
      });

      currentY += rowHeight;
    });
  }

  private drawFooters(doc: any, startX: number, width: number, data: any) {
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = range.start; i < range.start + totalPages; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 20;

      // Divider line
      doc.moveTo(startX, footerY - 4).lineTo(startX + width, footerY - 4).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      // Left
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(6).text(
        "The Father's House Church · Orderliness Unit · Confidential Management Report",
        startX,
        footerY,
        { lineBreak: false },
      );

      // Center
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6).text(
        `Scope: ${data.analytics.reportingPeriod.label} · Records: ${data.items.length.toLocaleString()}`,
        startX + 300,
        footerY,
        { lineBreak: false },
      );

      // Right
      doc.fillColor('#64748B').font('Helvetica').fontSize(6).text(
        `Page ${i + 1} of ${totalPages}`,
        startX + width - 80,
        footerY,
        { width: 80, align: 'right' },
      );
    }
  }
}
