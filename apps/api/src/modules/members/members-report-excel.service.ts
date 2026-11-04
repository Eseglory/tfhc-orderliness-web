import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { MemberReportItem, MemberReportAnalytics } from './members-report-pdf.service';

@Injectable()
export class MembersReportExcelService {
  private readonly logger = new Logger(MembersReportExcelService.name);

  /**
   * Generates a multi-sheet, interactive analytical workbook using ExcelJS.
   * Sheet 1: Analytics & Summary (Executive metadata & dynamic Excel formulas referencing Sheet 2)
   * Sheet 2: Members Data (Complete member dataset with styled headers, frozen top row, formatting)
   */
  async generateMembersExcel(data: {
    members: MemberReportItem[];
    analytics: MemberReportAnalytics;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "The Father's House Church (TFHC) · Orderliness Unit";
    workbook.lastModifiedBy = 'TFHC Orderliness Reporting Engine';
    workbook.created = new Date();
    workbook.modified = new Date();

    const membersCount = data.members.length;
    const lastRow = Math.max(2, membersCount + 1);

    // -------------------------------------------------------------------------
    // SHEET 1: ANALYTICS & SUMMARY (Must be the first sheet opened)
    // -------------------------------------------------------------------------
    const summarySheet = workbook.addWorksheet('Analytics & Summary', {
      properties: { tabColor: { argb: 'FF0F172A' } },
      views: [{ showGridLines: true }],
    });

    // Column widths for Sheet 1
    summarySheet.columns = [
      { key: 'colA', width: 4 }, // margin
      { key: 'colB', width: 28 }, // Metric Title
      { key: 'colC', width: 20 }, // Dynamic Formula / Value
      { key: 'colD', width: 22 }, // Criteria / Target
      { key: 'colE', width: 34 }, // Context / Description
      { key: 'colF', width: 4 }, // spacing
      { key: 'colG', width: 20 }, // Status Breakdown Label
      { key: 'colH', width: 14 }, // Status Count Formula
      { key: 'colI', width: 16 }, // Status % Formula
    ];

    // Rows 1-4: Executive Header Block
    summarySheet.mergeCells('B1:E2');
    const headerTitle = summarySheet.getCell('B1');
    headerTitle.value = "THE FATHER'S HOUSE CHURCH (TFHC) · ORDERLINESS UNIT";
    headerTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    headerTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    headerTitle.alignment = { vertical: 'middle', horizontal: 'center' };

    summarySheet.mergeCells('B3:E3');
    const headerSub = summarySheet.getCell('B3');
    headerSub.value = 'Members Operations Directory & Interactive Analytics Workbook';
    headerSub.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF38BDF8' } };
    headerSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerSub.alignment = { vertical: 'middle', horizontal: 'center' };

    summarySheet.mergeCells('B4:E4');
    const headerMeta = summarySheet.getCell('B4');
    headerMeta.value = `Generated: ${data.analytics.generatedAt} (WAT) | Scope: ${data.analytics.filterSummary} | Executive Confidential`;
    headerMeta.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FFF8FAFC' } };
    headerMeta.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    headerMeta.alignment = { vertical: 'middle', horizontal: 'center' };

    // Row 6: KPI Section Header
    summarySheet.mergeCells('B6:E6');
    const kpiSection = summarySheet.getCell('B6');
    kpiSection.value = 'EXECUTIVE KEY PERFORMANCE INDICATORS';
    kpiSection.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    kpiSection.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    kpiSection.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    summarySheet.getRow(6).height = 24;

    // Row 7: KPI Table Headers
    const kpiHeaders = [
      { col: 'B', text: 'Metric Indicator' },
      { col: 'C', text: 'Live Formula Value' },
      { col: 'D', text: 'Benchmark / Type' },
      { col: 'E', text: 'Operational Context' },
    ];
    for (const kh of kpiHeaders) {
      const cell = summarySheet.getCell(`${kh.col}7`);
      cell.value = kh.text;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: kh.col === 'C' ? 'center' : 'left' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      };
    }
    summarySheet.getRow(7).height = 20;

    // Rows 8-16: Dynamic KPI Metrics (Actual Excel Formulas referencing 'Members Data')
    const kpiRows = [
      {
        row: 8,
        label: 'Total Enrolled Members',
        formula: `COUNTA('Members Data'!A2:A${lastRow})`,
        fallback: data.analytics.totalMembers,
        numFmt: '#,##0',
        criteria: 'Directory Enrolled',
        desc: 'Verified personnel enrolled in the unit directory',
        color: 'FF0F172A',
        bold: true,
      },
      {
        row: 9,
        label: 'Active Members',
        formula: `COUNTIF('Members Data'!K2:K${lastRow}, "ACTIVE")`,
        fallback: data.analytics.activeMembers,
        numFmt: '#,##0',
        criteria: 'Status: ACTIVE',
        desc: 'Operational deployed members in active service',
        color: 'FF059669',
        bold: true,
      },
      {
        row: 10,
        label: 'Inactive Members',
        formula: `COUNTIF('Members Data'!K2:K${lastRow}, "INACTIVE")`,
        fallback: data.analytics.inactiveMembers,
        numFmt: '#,##0',
        criteria: 'Status: INACTIVE',
        desc: 'Members marked inactive in the registry',
        color: 'FF64748B',
        bold: false,
      },
      {
        row: 11,
        label: 'Pending & On-Leave Members',
        formula: `COUNTIF('Members Data'!K2:K${lastRow}, "NEW_MEMBER") + COUNTIF('Members Data'!K2:K${lastRow}, "ON_LEAVE") + COUNTIF('Members Data'!K2:K${lastRow}, "SUSPENDED")`,
        fallback: data.analytics.pendingMembers,
        numFmt: '#,##0',
        criteria: 'New / Leave / Susp.',
        desc: 'Members pending full deployment or on leave',
        color: 'FFD97706',
        bold: false,
      },
      {
        row: 12,
        label: 'Active Membership Percentage',
        formula: `IFERROR(C9/C8, 0)`,
        fallback: data.analytics.activeMembershipPercentage / 100,
        numFmt: '0.0%',
        criteria: 'Benchmark: >= 85.0%',
        desc: 'Ratio of active members relative to total roster',
        color: 'FF059669',
        bold: true,
      },
      {
        row: 13,
        label: 'Portal Registered Accounts',
        formula: `COUNTIF('Members Data'!L2:L${lastRow}, "Yes")`,
        fallback: data.analytics.registeredPortalCount,
        numFmt: '#,##0',
        criteria: 'Login Enabled',
        desc: 'Members with verified portal login credentials',
        color: 'FF0284C7',
        bold: false,
      },
      {
        row: 14,
        label: 'Portal Adoption Rate',
        formula: `IFERROR(C13/C8, 0)`,
        fallback: data.analytics.portalRegistrationPercentage / 100,
        numFmt: '0.0%',
        criteria: 'Portal / Enrolled',
        desc: 'Self-service member portal penetration',
        color: 'FF0284C7',
        bold: true,
      },
      {
        row: 15,
        label: 'Total Attendance Check-ins',
        formula: `SUM('Members Data'!M2:M${lastRow})`,
        fallback: data.analytics.totalAttendanceRecords,
        numFmt: '#,##0',
        criteria: 'Recorded Services',
        desc: 'Aggregate attendance events logged in the system',
        color: 'FF7C3AED',
        bold: false,
      },
      {
        row: 16,
        label: 'Average Attendance per Member',
        formula: `IFERROR(AVERAGE('Members Data'!M2:M${lastRow}), 0)`,
        fallback: data.analytics.averageAttendance,
        numFmt: '0.0',
        criteria: 'Check-ins / Member',
        desc: 'Mean attendance frequency across members',
        color: 'FF7C3AED',
        bold: true,
      },
    ];

    for (const kr of kpiRows) {
      summarySheet.getRow(kr.row).height = 21;

      // Label B
      const cellB = summarySheet.getCell(`B${kr.row}`);
      cellB.value = kr.label;
      cellB.font = { name: 'Arial', size: 9, bold: kr.bold, color: { argb: 'FF0F172A' } };
      cellB.alignment = { vertical: 'middle', horizontal: 'left' };

      // Formula C
      const cellC = summarySheet.getCell(`C${kr.row}`);
      cellC.value = { formula: kr.formula, result: kr.fallback };
      cellC.font = { name: 'Arial', size: 10, bold: true, color: { argb: kr.color } };
      cellC.alignment = { vertical: 'middle', horizontal: 'center' };
      cellC.numFmt = kr.numFmt;

      // Criteria D
      const cellD = summarySheet.getCell(`D${kr.row}`);
      cellD.value = kr.criteria;
      cellD.font = { name: 'Arial', size: 8.5, color: { argb: 'FF475569' } };
      cellD.alignment = { vertical: 'middle', horizontal: 'left' };

      // Desc E
      const cellE = summarySheet.getCell(`E${kr.row}`);
      cellE.value = kr.desc;
      cellE.font = { name: 'Arial', size: 8, color: { argb: 'FF64748B' } };
      cellE.alignment = { vertical: 'middle', horizontal: 'left' };

      // Subtle row borders & alternating bg
      const bg = kr.row % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
      for (const col of ['B', 'C', 'D', 'E']) {
        const c = summarySheet.getCell(`${col}${kr.row}`);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    }

    // -------------------------------------------------------------------------
    // STATUS DISTRIBUTION BREAKDOWN TABLE (Columns G, H, I on Sheet 1)
    // -------------------------------------------------------------------------
    summarySheet.mergeCells('G6:I6');
    const distTitle = summarySheet.getCell('G6');
    distTitle.value = 'STATUS DISTRIBUTION BREAKDOWN';
    distTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    distTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    distTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    const distHeaders = [
      { col: 'G', text: 'Status' },
      { col: 'H', text: 'Count' },
      { col: 'I', text: '% of Roster' },
    ];
    for (const dh of distHeaders) {
      const cell = summarySheet.getCell(`${dh.col}7`);
      cell.value = dh.text;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: dh.col === 'G' ? 'left' : 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } };
    }

    const statuses = [
      { code: 'ACTIVE', label: 'ACTIVE', row: 8, color: 'FF059669', fallback: data.analytics.activeMembers },
      { code: 'NEW_MEMBER', label: 'NEW_MEMBER', row: 9, color: 'FF4338CA', fallback: data.analytics.statusCounts?.NEW_MEMBER || 0 },
      { code: 'ON_LEAVE', label: 'ON_LEAVE', row: 10, color: 'FFD97706', fallback: data.analytics.statusCounts?.ON_LEAVE || 0 },
      { code: 'INACTIVE', label: 'INACTIVE', row: 11, color: 'FF64748B', fallback: data.analytics.inactiveMembers },
      { code: 'SUSPENDED', label: 'SUSPENDED', row: 12, color: 'FFDC2626', fallback: data.analytics.statusCounts?.SUSPENDED || 0 },
    ];

    for (const st of statuses) {
      // Label G
      const cG = summarySheet.getCell(`G${st.row}`);
      cG.value = st.label;
      cG.font = { name: 'Arial', size: 9, bold: true, color: { argb: st.color } };
      cG.alignment = { vertical: 'middle', horizontal: 'left' };

      // Count Formula H
      const cH = summarySheet.getCell(`H${st.row}`);
      cH.value = {
        formula: `COUNTIF('Members Data'!K2:K${lastRow}, "${st.code}")`,
        result: st.fallback,
      };
      cH.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      cH.alignment = { vertical: 'middle', horizontal: 'center' };
      cH.numFmt = '#,##0';

      // Ratio Formula I
      const cI = summarySheet.getCell(`I${st.row}`);
      cI.value = {
        formula: `IFERROR(H${st.row}/$C$8, 0)`,
        result: membersCount > 0 ? st.fallback / membersCount : 0,
      };
      cI.font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
      cI.alignment = { vertical: 'middle', horizontal: 'center' };
      cI.numFmt = '0.0%';

      const bg = st.row % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
      for (const col of ['G', 'H', 'I']) {
        const c = summarySheet.getCell(`${col}${st.row}`);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    }

    // Row 13: Total Row for Breakdown
    summarySheet.getRow(13).height = 20;
    const gTot = summarySheet.getCell('G13');
    gTot.value = 'TOTAL CHECK';
    gTot.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };

    const hTot = summarySheet.getCell('H13');
    hTot.value = { formula: 'SUM(H8:H12)', result: membersCount };
    hTot.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    hTot.alignment = { vertical: 'middle', horizontal: 'center' };
    hTot.numFmt = '#,##0';

    const iTot = summarySheet.getCell('I13');
    iTot.value = { formula: 'SUM(I8:I12)', result: 1 };
    iTot.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    iTot.alignment = { vertical: 'middle', horizontal: 'center' };
    iTot.numFmt = '0.0%';

    for (const col of ['G', 'H', 'I']) {
      const c = summarySheet.getCell(`${col}13`);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      };
    }

    // Row 18: Dynamic Formula Note Banner
    summarySheet.mergeCells('B18:I18');
    const noteCell = summarySheet.getCell('B18');
    noteCell.value =
      '💡 LIVE FORMULA NOTICE: All summary KPI metrics and distribution tables above reference the \'Members Data\' worksheet dynamically. Modifying records, statuses, or attendance on that sheet will automatically update these values.';
    noteCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF0369A1' } };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    noteCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    noteCell.border = {
      top: { style: 'thin', color: { argb: 'FFBAE6FD' } },
      bottom: { style: 'thin', color: { argb: 'FFBAE6FD' } },
      left: { style: 'thin', color: { argb: 'FFBAE6FD' } },
      right: { style: 'thin', color: { argb: 'FFBAE6FD' } },
    };
    summarySheet.getRow(18).height = 24;

    // -------------------------------------------------------------------------
    // SHEET 2: MEMBERS DATA
    // -------------------------------------------------------------------------
    const dataSheet = workbook.addWorksheet('Members Data', {
      properties: { tabColor: { argb: 'FF059669' } },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }],
    });

    dataSheet.columns = [
      { key: 'memberCode', header: 'Member ID', width: 15 },
      { key: 'firstName', header: 'First Name', width: 16 },
      { key: 'lastName', header: 'Last Name', width: 16 },
      { key: 'middleName', header: 'Middle Name', width: 16 },
      { key: 'gender', header: 'Gender', width: 12 },
      { key: 'phone', header: 'Phone Number', width: 18 },
      { key: 'directoryEmail', header: 'Directory Email', width: 28 },
      { key: 'userEmail', header: 'Login Email', width: 28 },
      { key: 'subTeam', header: 'Sub-Team', width: 18 },
      { key: 'roleInUnit', header: 'Unit Role', width: 16 },
      { key: 'status', header: 'Membership Status', width: 18 },
      { key: 'portalRegistered', header: 'Portal Account', width: 16 },
      { key: 'attendanceCount', header: 'Attendance Count', width: 18 },
      { key: 'dateJoined', header: 'Date Enrolled', width: 16 },
    ];

    // Style Header Row (Row 1)
    const headerRow = dataSheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
      };
    });

    // Populate Data Rows
    for (let i = 0; i < data.members.length; i++) {
      const m = data.members[i];
      const rNum = i + 2;

      let joinedDateStr = '';
      if (m.dateJoined) {
        try {
          const dj = new Date(m.dateJoined);
          joinedDateStr = dj.toISOString().split('T')[0];
        } catch {
          joinedDateStr = '';
        }
      }

      const row = dataSheet.addRow({
        memberCode: m.memberCode || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        middleName: m.middleName || '',
        gender: m.gender || '',
        phone: m.phoneNumber && m.phoneNumber !== 'UNVERIFIED' ? m.phoneNumber : '',
        directoryEmail: m.directoryEmail || '',
        userEmail: m.userEmail || '',
        subTeam: m.subTeamName || 'General',
        roleInUnit: m.roleInUnit || 'Member',
        status: m.status || 'ACTIVE',
        portalRegistered: m.isRegistered ? 'Yes' : 'No',
        attendanceCount: Number(m.attendanceCount ?? 0),
        dateJoined: joinedDateStr,
      });

      row.height = 20;

      // Formatting & Alternating styles
      const isEven = rNum % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1E293B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        // Alignments & Numbers
        if (colNumber === 1 || colNumber === 5 || colNumber === 12 || colNumber === 14) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colNumber === 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }

        // Phone number string text format
        if (colNumber === 6) {
          cell.numFmt = '@';
        }
      });

      // Status Pill Highlighting (Column 11: K)
      const statusCell = row.getCell(11);
      const stVal = m.status || 'ACTIVE';
      statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (stVal === 'ACTIVE') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF166534' } };
      } else if (stVal === 'NEW_MEMBER') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF3730A3' } };
      } else if (stVal === 'ON_LEAVE') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF92400E' } };
      } else if (stVal === 'INACTIVE') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        statusCell.font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
      } else if (stVal === 'SUSPENDED') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF991B1B' } };
      }

      // Portal Pill Highlighting (Column 12: L)
      const portalCell = row.getCell(12);
      if (m.isRegistered) {
        portalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        portalCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF166534' } };
      } else {
        portalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        portalCell.font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };
      }
    }

    // Auto-filter on entire table range
    dataSheet.autoFilter = { from: 'A1', to: `N${lastRow}` };

    // Add Excel Conditional Formatting rules for Column K (Status)
    try {
      dataSheet.addConditionalFormatting({
        ref: `K2:K${lastRow}`,
        rules: [
          {
            priority: 1,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['"ACTIVE"'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCFCE7' } },
              font: { color: { argb: 'FF166534' }, bold: true },
            },
          },
          {
            priority: 2,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['"NEW_MEMBER"'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFEEF2FF' } },
              font: { color: { argb: 'FF3730A3' }, bold: true },
            },
          },
          {
            priority: 3,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['"ON_LEAVE"'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } },
              font: { color: { argb: 'FF92400E' }, bold: true },
            },
          },
          {
            priority: 4,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['"INACTIVE"'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF1F5F9' } },
              font: { color: { argb: 'FF475569' } },
            },
          },
          {
            priority: 5,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['"SUSPENDED"'],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } },
              font: { color: { argb: 'FF991B1B' }, bold: true },
            },
          },
        ],
      });
    } catch (cfErr) {
      this.logger.warn('Could not register conditional formatting rules', cfErr);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }
}

