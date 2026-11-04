import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

export interface MemberReportItem {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  preferredName?: string | null;
  phoneNumber?: string | null;
  gender?: string | null;
  roleInUnit?: string | null;
  status: string;
  subTeamName?: string | null;
  directoryEmail?: string | null;
  userEmail?: string | null;
  isRegistered: boolean;
  attendanceCount: number;
  lastAttendanceDate?: string | null;
  lastAttendanceStatus?: string | null;
  dateJoined?: Date | string | null;
}

export interface MemberReportAnalytics {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  pendingMembers: number;
  activeMembershipPercentage: number;
  registeredPortalCount: number;
  portalRegistrationPercentage: number;
  totalAttendanceRecords: number;
  averageAttendance: number;
  subTeamsCount: number;
  genderCounts: { male: number; female: number; unspecified: number };
  statusCounts: Record<string, number>;
  generatedAt: string;
  filterSummary: string;
}

interface TableColumn {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

@Injectable()
export class MembersReportPdfService {
  private readonly logger = new Logger(MembersReportPdfService.name);

  /**
   * Generates a publication-grade, compact executive landscape PDF report
   * eliminating empty white spaces and spurious page breaks.
   */
  async generateMembersPdf(data: {
    members: MemberReportItem[];
    analytics: MemberReportAnalytics;
  }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const marginX = 28;
        const marginTop = 24;
        const marginBottom = 24;

        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: { top: marginTop, bottom: marginBottom, left: marginX, right: marginX },
          bufferPages: true,
          info: {
            Title: 'TFHC Members Operations Directory & Executive Analytics',
            Author: "The Father's House Church (TFHC) · Orderliness Unit",
            Subject: 'Executive Member Roster & Analytics Report',
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

        const pageWidth = doc.page.width; // 841.89
        const pageHeight = doc.page.height; // 595.28
        const contentWidth = pageWidth - marginX * 2; // 785.89 pt
        const bottomContentLimit = pageHeight - 32; // 563.28 pt max row boundary

        // Colors
        const cNavy = '#0F172A';
        const cSlateNavy = '#1E293B';
        const cTextDark = '#0F172A';
        const cMuted = '#64748B';
        const cBorder = '#E2E8F0';
        const cAltRow = '#F8FAFC';

        // 10 Balanced Columns matching actual content width (Total: 785.89 pt)
        const columns: TableColumn[] = [
          { key: 'code', label: 'MEMBER ID', width: 85, align: 'left' },
          { key: 'name', label: 'FULL NAME', width: 120, align: 'left' },
          { key: 'phone', label: 'PHONE NUMBER', width: 75, align: 'left' },
          { key: 'email', label: 'EMAIL (DIRECTORY / LOGIN)', width: 140, align: 'left' },
          { key: 'subteam', label: 'SUB-TEAM', width: 95, align: 'left' },
          { key: 'role', label: 'UNIT ROLE', width: 90, align: 'left' },
          { key: 'status', label: 'STATUS', width: 58, align: 'center' },
          { key: 'portal', label: 'PORTAL', width: 38, align: 'center' },
          { key: 'attendance', label: 'ATTEND.', width: 45, align: 'right' },
          { key: 'joined', label: 'JOINED', width: 39.89, align: 'center' },
        ];

        // ---------------------------------------------------------------------
        // PAGE 1: EXECUTIVE HEADER (Compact & High-Density)
        // ---------------------------------------------------------------------
        this.drawPageOneHeader(doc, marginX, contentWidth, data.analytics);

        // ---------------------------------------------------------------------
        // PAGE 1: DASHBOARD ANALYTICS SUMMARY (Compact 6 KPI Cards Grid)
        // ---------------------------------------------------------------------
        this.drawAnalyticsSummarySection(doc, marginX, contentWidth, data.analytics);

        // ---------------------------------------------------------------------
        // TABLE SECTION HEADER
        // ---------------------------------------------------------------------
        const tableTitleY = 129;
        doc
          .fillColor(cNavy)
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text('VERIFIED MEMBERS REGISTRY', marginX, tableTitleY, { lineBreak: false });

        doc
          .fillColor(cMuted)
          .fontSize(6.5)
          .font('Helvetica')
          .text(
            `Total Records: ${data.members.length.toLocaleString()} Verified Members · Sorted alphabetically by name`,
            marginX + 155,
            tableTitleY + 1,
            { lineBreak: false }
          );

        // ---------------------------------------------------------------------
        // DATA TABLE HEADER
        // ---------------------------------------------------------------------
        const tableHeaderY = 141;
        const tableHeaderHeight = 16;
        this.drawTableHeader(doc, marginX, tableHeaderY, contentWidth, tableHeaderHeight, columns);
        doc.y = tableHeaderY + tableHeaderHeight;

        // ---------------------------------------------------------------------
        // DATA ROWS
        // ---------------------------------------------------------------------
        const rowHeight = 12.8;
        let isAlt = false;

        for (let i = 0; i < data.members.length; i++) {
          const m = data.members[i];

          // Check for page overflow
          if (doc.y + rowHeight > bottomContentLimit) {
            doc.addPage();
            // Subsequent page compact header
            this.drawSubsequentPageHeader(doc, marginX, contentWidth, data.analytics);
            // Re-render repeating table header
            const nextTableHeaderY = 48;
            this.drawTableHeader(doc, marginX, nextTableHeaderY, contentWidth, tableHeaderHeight, columns);
            doc.y = nextTableHeaderY + tableHeaderHeight;
          }

          const currentY = doc.y;

          // Background fill
          if (isAlt) {
            doc.rect(marginX, currentY, contentWidth, rowHeight).fill(cAltRow);
          } else {
            doc.rect(marginX, currentY, contentWidth, rowHeight).fill('#FFFFFF');
          }

          // Bottom subtle divider
          doc
            .strokeColor(cBorder)
            .lineWidth(0.5)
            .moveTo(marginX, currentY + rowHeight)
            .lineTo(marginX + contentWidth, currentY + rowHeight)
            .stroke();

          // Cell rendering
          let colX = marginX;

          // 1. Member Code
          doc
            .fillColor(cSlateNavy)
            .fontSize(6.5)
            .font('Helvetica-Bold')
            .text(m.memberCode || '—', colX + 4, currentY + 3.5, {
              width: columns[0].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[0].width;

          // 2. Full Name
          const fullName = [m.lastName ? m.lastName.toUpperCase() : '', m.firstName, m.middleName]
            .filter(Boolean)
            .join(' ');
          doc
            .fillColor(cTextDark)
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(fullName || 'Unknown Member', colX + 4, currentY + 3.5, {
              width: columns[1].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[1].width;

          // 3. Phone Number
          const phone = m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : '—';
          doc
            .fillColor('#334155')
            .fontSize(6.5)
            .font('Helvetica')
            .text(phone, colX + 4, currentY + 3.5, {
              width: columns[2].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[2].width;

          // 4. Email (Directory or User email)
          const email = m.directoryEmail || m.userEmail || '—';
          doc
            .fillColor('#475569')
            .fontSize(6.5)
            .font('Helvetica')
            .text(email, colX + 4, currentY + 3.5, {
              width: columns[3].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[3].width;

          // 5. Sub-Team
          doc
            .fillColor('#334155')
            .fontSize(6.5)
            .font('Helvetica')
            .text(m.subTeamName || 'General', colX + 4, currentY + 3.5, {
              width: columns[4].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[4].width;

          // 6. Unit Role
          doc
            .fillColor('#475569')
            .fontSize(6.5)
            .font('Helvetica')
            .text(m.roleInUnit || 'Member', colX + 4, currentY + 3.5, {
              width: columns[5].width - 8,
              lineBreak: false,
              ellipsis: true,
            });
          colX += columns[5].width;

          // 7. Status Pill
          this.drawStatusPill(doc, colX, currentY, columns[6].width, rowHeight, m.status);
          colX += columns[6].width;

          // 8. Portal Registered Pill
          this.drawPortalPill(doc, colX, currentY, columns[7].width, rowHeight, m.isRegistered);
          colX += columns[7].width;

          // 9. Attendance Count
          doc
            .fillColor(cTextDark)
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(String(m.attendanceCount ?? 0), colX + 4, currentY + 3.5, {
              width: columns[8].width - 8,
              align: 'right',
              lineBreak: false,
            });
          colX += columns[8].width;

          // 10. Date Joined
          let joinedStr = '—';
          if (m.dateJoined) {
            try {
              const d = new Date(m.dateJoined);
              joinedStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } catch {
              joinedStr = '—';
            }
          }
          doc
            .fillColor('#64748B')
            .fontSize(6)
            .font('Helvetica')
            .text(joinedStr, colX + 2, currentY + 3.5, {
              width: columns[9].width - 4,
              align: 'center',
              lineBreak: false,
            });

          doc.y = currentY + rowHeight;
          isAlt = !isAlt;
        }

        // ---------------------------------------------------------------------
        // FOOTER & AUTOMATIC "Page X of Y" PASS ACROSS ALL PAGES
        // CRITICAL: We set doc.page.margins.bottom = 0 and lineBreak: false
        // to guarantee NO unwanted blank pages are created!
        // ---------------------------------------------------------------------
        const pageRange = doc.bufferedPageRange();
        const totalPages = pageRange.count;

        for (let p = pageRange.start; p < pageRange.start + totalPages; p++) {
          doc.switchToPage(p);
          const origBottom = doc.page.margins.bottom;
          doc.page.margins.bottom = 0; // Safely bypass page-addition trigger

          const footerY = pageHeight - 20;

          // Divider rule
          doc
            .strokeColor('#CBD5E1')
            .lineWidth(0.5)
            .moveTo(marginX, footerY)
            .lineTo(marginX + contentWidth, footerY)
            .stroke();

          // Left Footer
          doc
            .fillColor(cMuted)
            .fontSize(6)
            .font('Helvetica-Bold')
            .text(
              "THE FATHER'S HOUSE CHURCH (TFHC) · ORDERLINESS UNIT",
              marginX,
              footerY + 4,
              { lineBreak: false }
            );

          // Center Footer (Date/Time)
          doc
            .fillColor('#94A3B8')
            .fontSize(6)
            .font('Helvetica')
            .text(
              `Generated: ${data.analytics.generatedAt} (WAT) · Internal Use Only`,
              marginX,
              footerY + 4,
              { width: contentWidth, align: 'center', lineBreak: false }
            );

          // Right Footer ("Page X of Y")
          doc
            .fillColor(cSlateNavy)
            .fontSize(6.5)
            .font('Helvetica-Bold')
            .text(`Page ${p + 1} of ${totalPages}`, marginX, footerY + 4, {
              width: contentWidth,
              align: 'right',
              lineBreak: false,
            });

          doc.page.margins.bottom = origBottom;
        }

        doc.end();
      } catch (err) {
        this.logger.error('Failed to construct PDF document', err);
        reject(err);
      }
    });
  }

  /**
   * Draws the executive header on Page 1.
   */
  private drawPageOneHeader(
    doc: any,
    marginX: number,
    contentWidth: number,
    analytics: MemberReportAnalytics
  ): void {
    const headerHeight = 42;
    const headerY = 24;

    // Navy header box
    doc.rect(marginX, headerY, contentWidth, headerHeight).fill('#0F172A');
    // Top active accent stripe (Blue)
    doc.rect(marginX, headerY, contentWidth, 2.5).fill('#2563EB');

    // Branding / Logo placeholder
    const logoX = marginX + 10;
    const logoY = headerY + 5;
    const logoMaxW = 110;
    const logoMaxH = 32;
    this.renderLogo(doc, logoX, logoY, logoMaxW, logoMaxH);

    // Header Titles
    const titleX = marginX + 130;
    doc
      .fillColor('#94A3B8')
      .fontSize(6.5)
      .font('Helvetica-Bold')
      .text(
        "THE FATHER'S HOUSE CHURCH (TFHC) · ORDERLINESS UNIT",
        titleX,
        headerY + 7,
        { lineBreak: false }
      );

    doc
      .fillColor('#FFFFFF')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('MEMBERS DIRECTORY & OPERATIONS ANALYTICS', titleX, headerY + 16, { lineBreak: false });

    doc
      .fillColor('#38BDF8')
      .fontSize(6.5)
      .font('Helvetica')
      .text(
        'Verified Personnel Roster · Attendance History · Account Governance Ledger',
        titleX,
        headerY + 30,
        { lineBreak: false }
      );

    // Right-side Metadata Badge
    const badgeW = 195;
    const badgeH = 32;
    const badgeX = marginX + contentWidth - badgeW - 8;
    const badgeY = headerY + 5;

    doc.rect(badgeX, badgeY, badgeW, badgeH).fillAndStroke('#1E293B', '#334155');

    doc
      .fillColor('#94A3B8')
      .fontSize(5.5)
      .font('Helvetica-Bold')
      .text('REPORT GENERATION', badgeX + 8, badgeY + 4, { lineBreak: false });

    doc
      .fillColor('#FFFFFF')
      .fontSize(7)
      .font('Helvetica')
      .text(analytics.generatedAt, badgeX + 8, badgeY + 12, { lineBreak: false });

    doc
      .fillColor('#38BDF8')
      .fontSize(6)
      .font('Helvetica-Bold')
      .text(`SCOPE: ${analytics.filterSummary}`, badgeX + 8, badgeY + 22, {
        width: badgeW - 16,
        lineBreak: false,
        ellipsis: true,
      });
  }

  /**
   * Draws the mini header on subsequent pages.
   */
  private drawSubsequentPageHeader(
    doc: any,
    marginX: number,
    contentWidth: number,
    analytics: MemberReportAnalytics
  ): void {
    const hY = 24;
    const hHeight = 20;

    doc.rect(marginX, hY, contentWidth, hHeight).fill('#0F172A');
    doc.rect(marginX, hY, contentWidth, 2).fill('#2563EB');

    doc
      .fillColor('#FFFFFF')
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text(
        "THE FATHER'S HOUSE CHURCH · ORDERLINESS MEMBERS DIRECTORY (Continued)",
        marginX + 8,
        hY + 6,
        { lineBreak: false }
      );

    doc
      .fillColor('#38BDF8')
      .fontSize(6.5)
      .font('Helvetica')
      .text(
        `Scope: ${analytics.filterSummary}`,
        marginX + contentWidth - 200,
        hY + 6,
        { width: 190, align: 'right', lineBreak: false }
      );
  }

  /**
   * Draws the Dashboard Analytics Summary section with 6 professional KPI cards.
   */
  private drawAnalyticsSummarySection(
    doc: any,
    marginX: number,
    contentWidth: number,
    analytics: MemberReportAnalytics
  ): void {
    const secY = 72;

    // Section Title
    doc
      .fillColor('#0F172A')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text('DASHBOARD ANALYTICS SUMMARY', marginX, secY, { lineBreak: false });

    doc
      .fillColor('#64748B')
      .fontSize(6.5)
      .font('Helvetica')
      .text(
        'Key performance indicators computed from verified member records and recorded service attendance',
        marginX + 165,
        secY + 1.5,
        { lineBreak: false }
      );

    // 6 KPI Cards Grid
    const cardsY = 85;
    const cardGap = 7;
    const cardCount = 6;
    const cardWidth = (contentWidth - (cardCount - 1) * cardGap) / cardCount; // ~125 pt
    const cardHeight = 38;

    const cards = [
      {
        title: 'TOTAL MEMBERS',
        value: analytics.totalMembers.toLocaleString(),
        sub: 'Enrolled in Roster',
        accent: '#0F172A',
        subColor: '#64748B',
      },
      {
        title: 'ACTIVE MEMBERS',
        value: analytics.activeMembers.toLocaleString(),
        sub: `${analytics.activeMembershipPercentage.toFixed(1)}% Active Rate`,
        accent: '#059669',
        subColor: '#059669',
      },
      {
        title: 'INACTIVE MEMBERS',
        value: analytics.inactiveMembers.toLocaleString(),
        sub: `${analytics.totalMembers > 0 ? ((analytics.inactiveMembers / analytics.totalMembers) * 100).toFixed(1) : '0.0'}% of Roster`,
        accent: '#64748B',
        subColor: '#64748B',
      },
      {
        title: 'PENDING / LEAVE',
        value: analytics.pendingMembers.toLocaleString(),
        sub: 'On Leave / New',
        accent: '#D97706',
        subColor: '#D97706',
      },
      {
        title: 'PORTAL ONBOARDED',
        value: analytics.registeredPortalCount.toLocaleString(),
        sub: `${analytics.portalRegistrationPercentage.toFixed(1)}% Adoption`,
        accent: '#0284C7',
        subColor: '#0284C7',
      },
      {
        title: 'ATTENDANCE AVG',
        value: analytics.averageAttendance.toFixed(1),
        sub: `${analytics.totalAttendanceRecords.toLocaleString()} Total Logs`,
        accent: '#7C3AED',
        subColor: '#7C3AED',
      },
    ];

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const cx = marginX + i * (cardWidth + cardGap);
      this.drawKpiCard(doc, cx, cardsY, cardWidth, cardHeight, c);
    }
  }

  /**
   * Draws a single KPI card with top accent bar and typography.
   */
  private drawKpiCard(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    item: {
      title: string;
      value: string;
      sub: string;
      accent: string;
      subColor: string;
    }
  ): void {
    // Card Background & Border
    doc.rect(x, y, width, height).fillAndStroke('#F8FAFC', '#E2E8F0');
    // Top accent bar
    doc.rect(x, y, width, 2.5).fill(item.accent);

    // Title
    doc
      .fillColor('#64748B')
      .fontSize(5.5)
      .font('Helvetica-Bold')
      .text(item.title, x + 6, y + 5, { width: width - 12, lineBreak: false });

    // Value
    doc
      .fillColor('#0F172A')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(item.value, x + 6, y + 13, { width: width - 12, lineBreak: false });

    // Subtext
    doc
      .fillColor(item.subColor)
      .fontSize(5.5)
      .font('Helvetica-Bold')
      .text(item.sub, x + 6, y + 28, { width: width - 12, lineBreak: false });
  }

  /**
   * Draws the table column header bar.
   */
  private drawTableHeader(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    columns: TableColumn[]
  ): void {
    doc.rect(x, y, width, height).fill('#0F172A');
    let cx = x;
    doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
    for (const col of columns) {
      doc.text(col.label, cx + 4, y + 5.5, {
        width: col.width - 8,
        align: col.align,
        lineBreak: false,
      });
      cx += col.width;
    }
  }

  /**
   * Draws a subtle accessible status badge.
   */
  private drawStatusPill(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    status: string
  ): void {
    const pillW = width - 10;
    const pillH = 9.5;
    const pillX = x + 5;
    const pillY = y + (height - pillH) / 2;

    let bg = '#F1F5F9';
    let border = '#CBD5E1';
    let text = '#475569';
    let label = status || 'UNKNOWN';

    switch (status) {
      case 'ACTIVE':
        bg = '#DCFCE7';
        border = '#86EFAC';
        text = '#166534';
        break;
      case 'NEW_MEMBER':
        bg = '#EEF2FF';
        border = '#C7D2FE';
        text = '#3730A3';
        label = 'NEW';
        break;
      case 'ON_LEAVE':
        bg = '#FEF3C7';
        border = '#FDE68A';
        text = '#92400E';
        label = 'ON LEAVE';
        break;
      case 'INACTIVE':
        bg = '#F1F5F9';
        border = '#CBD5E1';
        text = '#475569';
        break;
      case 'SUSPENDED':
        bg = '#FEE2E2';
        border = '#FECACA';
        text = '#991B1B';
        break;
    }

    doc.roundedRect(pillX, pillY, pillW, pillH, 2).fillAndStroke(bg, border);
    doc
      .fillColor(text)
      .fontSize(5.5)
      .font('Helvetica-Bold')
      .text(label, pillX, pillY + 1.5, { width: pillW, align: 'center', lineBreak: false });
  }

  /**
   * Draws a portal registration pill (Yes / No).
   */
  private drawPortalPill(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    isRegistered: boolean
  ): void {
    const pillW = 28;
    const pillH = 9.5;
    const pillX = x + (width - pillW) / 2;
    const pillY = y + (height - pillH) / 2;

    const bg = isRegistered ? '#DCFCE7' : '#F1F5F9';
    const border = isRegistered ? '#86EFAC' : '#E2E8F0';
    const text = isRegistered ? '#166534' : '#64748B';
    const label = isRegistered ? 'Yes' : 'No';

    doc.roundedRect(pillX, pillY, pillW, pillH, 2).fillAndStroke(bg, border);
    doc
      .fillColor(text)
      .fontSize(5.5)
      .font('Helvetica-Bold')
      .text(label, pillX, pillY + 1.5, { width: pillW, align: 'center', lineBreak: false });
  }

  /**
   * Renders the organization logo from disk with aspect ratio preserved,
   * or falls back to an executive vector crest placeholder.
   */
  private renderLogo(
    doc: any,
    x: number,
    y: number,
    maxW: number,
    maxH: number
  ): void {
    const possiblePaths = [
      path.resolve(__dirname, '../../assets/logo.png'),
      path.resolve(__dirname, '../assets/logo.png'),
      path.resolve(process.cwd(), 'apps/api/src/assets/logo.png'),
      path.resolve(process.cwd(), 'apps/api/dist/assets/logo.png'),
      path.resolve(process.cwd(), 'apps/web/public/logo.png'),
      path.resolve(process.cwd(), 'public/logo.png'),
      path.resolve(__dirname, '../../../../web/public/logo.png'),
      path.resolve(__dirname, '../../../../../apps/web/public/logo.png'),
    ];

    let foundPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (foundPath) {
      try {
        doc.image(foundPath, x, y, { fit: [maxW, maxH] });
        return;
      } catch (err) {
        this.logger.warn(`Could not render image file from ${foundPath}`, err);
      }
    }

    // Fallback: draw crisp vector crest placeholder
    this.drawVectorLogo(doc, x, y, maxW, maxH);
  }

  /**
   * Vector crest placeholder drawn purely with PDFKit primitives.
   */
  private drawVectorLogo(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const badgeW = Math.min(width, 100);
    const badgeH = Math.min(height, 30);

    doc.roundedRect(x, y, badgeW, badgeH, 3).fillAndStroke('#1E293B', '#38BDF8');
    doc.rect(x, y, 3, badgeH).fill('#38BDF8');

    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('TFHC', x + 8, y + 5, { lineBreak: false });

    doc
      .fillColor('#38BDF8')
      .fontSize(5)
      .font('Helvetica-Bold')
      .text('ORDERLINESS', x + 8, y + 17, { lineBreak: false });
  }
}
