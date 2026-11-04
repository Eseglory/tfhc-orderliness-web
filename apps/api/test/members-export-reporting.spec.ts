import { MembersReportPdfService, MemberReportItem, MemberReportAnalytics } from '../src/modules/members/members-report-pdf.service';
import { MembersReportExcelService } from '../src/modules/members/members-report-excel.service';
import * as ExcelJS from 'exceljs';

describe('Members Export Reporting & Analytics Upgrade', () => {
  let pdfService: MembersReportPdfService;
  let excelService: MembersReportExcelService;

  const mockAnalytics: MemberReportAnalytics = {
    totalMembers: 4,
    activeMembers: 3,
    inactiveMembers: 1,
    pendingMembers: 0,
    activeMembershipPercentage: 75.0,
    registeredPortalCount: 3,
    portalRegistrationPercentage: 75.0,
    totalAttendanceRecords: 42,
    averageAttendance: 10.5,
    subTeamsCount: 2,
    genderCounts: { male: 2, female: 2, unspecified: 0 },
    statusCounts: { ACTIVE: 3, INACTIVE: 1 },
    generatedAt: '2026-11-04 10:00:00',
    filterSummary: 'All Enrolled Members',
  };

  const mockMembers: MemberReportItem[] = [
    {
      id: 'm-1',
      memberCode: 'TFHC-001',
      firstName: 'Aanu',
      lastName: 'Oyeniran',
      middleName: 'Emmanuel',
      preferredName: null,
      phoneNumber: '08012345678',
      gender: 'Male',
      roleInUnit: 'Team Lead',
      status: 'ACTIVE',
      subTeamName: 'Protocol',
      directoryEmail: 'aanu.oyeniran@tfhc.org',
      userEmail: 'aanu.oyeniran@tfhc.org',
      isRegistered: true,
      attendanceCount: 18,
      lastAttendanceDate: '2026-11-01T09:00:00.000Z',
      lastAttendanceStatus: 'ON_TIME',
      dateJoined: new Date('2025-01-10'),
    },
    {
      id: 'm-2',
      memberCode: 'TFHC-002',
      firstName: 'Daniel',
      lastName: 'Oguamanam',
      middleName: null,
      preferredName: 'Dan',
      phoneNumber: '08087654321',
      gender: 'Male',
      roleInUnit: 'Assistant Lead',
      status: 'ACTIVE',
      subTeamName: 'Ushering',
      directoryEmail: 'daniel.oguamanam@tfhc.org',
      userEmail: 'daniel.oguamanam@tfhc.org',
      isRegistered: true,
      attendanceCount: 15,
      lastAttendanceDate: '2026-11-01T09:00:00.000Z',
      lastAttendanceStatus: 'EARLY',
      dateJoined: new Date('2025-02-15'),
    },
    {
      id: 'm-3',
      memberCode: 'TFHC-003',
      firstName: 'Grace',
      lastName: 'Adekunle',
      middleName: 'Blessing',
      preferredName: null,
      phoneNumber: '08123456789',
      gender: 'Female',
      roleInUnit: 'Member',
      status: 'ACTIVE',
      subTeamName: 'Protocol',
      directoryEmail: 'grace.adekunle@tfhc.org',
      userEmail: 'grace.adekunle@tfhc.org',
      isRegistered: true,
      attendanceCount: 9,
      lastAttendanceDate: '2026-10-25T09:00:00.000Z',
      lastAttendanceStatus: 'ON_TIME',
      dateJoined: new Date('2025-06-01'),
    },
    {
      id: 'm-4',
      memberCode: 'TFHC-004',
      firstName: 'Mary',
      lastName: 'Okeke',
      middleName: null,
      preferredName: null,
      phoneNumber: '08099887766',
      gender: 'Female',
      roleInUnit: 'Member',
      status: 'INACTIVE',
      subTeamName: 'Ushering',
      directoryEmail: 'mary.okeke@tfhc.org',
      userEmail: null,
      isRegistered: false,
      attendanceCount: 0,
      lastAttendanceDate: null,
      lastAttendanceStatus: null,
      dateJoined: new Date('2025-09-12'),
    },
  ];

  beforeEach(() => {
    pdfService = new MembersReportPdfService();
    excelService = new MembersReportExcelService();
  });

  describe('PDF Export: Executive-Level Analytical Report', () => {
    it('generates a valid, non-empty A4 landscape binary PDF document buffer with magic bytes', async () => {
      const buffer = await pdfService.generateMembersPdf({
        members: mockMembers,
        analytics: mockAnalytics,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1500);

      // Verify PDF header magic bytes %PDF-
      const magic = buffer.slice(0, 5).toString('ascii');
      expect(magic).toBe('%PDF-');
    });

    it('gracefully handles a multi-page dataset without layout overflow', async () => {
      // Create 60 mock members to trigger multiple landscape pages
      const largeList: MemberReportItem[] = [];
      for (let i = 1; i <= 60; i++) {
        largeList.push({
          id: `m-large-${i}`,
          memberCode: `TFHC-${String(i).padStart(3, '0')}`,
          firstName: `FirstName${i}`,
          lastName: `LastName${i}`,
          phoneNumber: `080000000${String(i).padStart(2, '0')}`,
          roleInUnit: 'Member',
          status: i % 5 === 0 ? 'INACTIVE' : i % 7 === 0 ? 'ON_LEAVE' : 'ACTIVE',
          subTeamName: i % 2 === 0 ? 'Protocol' : 'Ushering',
          directoryEmail: `member${i}@tfhc.org`,
          userEmail: `member${i}@tfhc.org`,
          isRegistered: i % 2 === 0,
          attendanceCount: i,
          dateJoined: new Date('2025-01-01'),
        });
      }

      const multiPageAnalytics: MemberReportAnalytics = {
        ...mockAnalytics,
        totalMembers: 60,
      };

      const buffer = await pdfService.generateMembersPdf({
        members: largeList,
        analytics: multiPageAnalytics,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(5000);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('handles empty datasets cleanly without throwing errors', async () => {
      const emptyAnalytics: MemberReportAnalytics = {
        totalMembers: 0,
        activeMembers: 0,
        inactiveMembers: 0,
        pendingMembers: 0,
        activeMembershipPercentage: 0,
        registeredPortalCount: 0,
        portalRegistrationPercentage: 0,
        totalAttendanceRecords: 0,
        averageAttendance: 0,
        subTeamsCount: 0,
        genderCounts: { male: 0, female: 0, unspecified: 0 },
        statusCounts: {},
        generatedAt: '2026-11-04 10:00:00',
        filterSummary: 'Empty Roster',
      };

      const buffer = await pdfService.generateMembersPdf({
        members: [],
        analytics: emptyAnalytics,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Excel Export: Interactive Analytics Workbook', () => {
    it('generates a valid, multi-sheet workbook buffer with ZIP magic bytes PK', async () => {
      const buffer = await excelService.generateMembersExcel({
        members: mockMembers,
        analytics: mockAnalytics,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(2000);

      // Verify XLSX / ZIP magic bytes PK\x03\x04
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    it('has Sheet 1 as "Analytics & Summary" and Sheet 2 as "Members Data"', async () => {
      const buffer = await excelService.generateMembersExcel({
        members: mockMembers,
        analytics: mockAnalytics,
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.worksheets[0].name).toBe('Analytics & Summary');
      expect(workbook.worksheets[1].name).toBe('Members Data');
    });

    it('Sheet 1 contains executive header and dynamic Excel formulas referencing Sheet 2', async () => {
      const buffer = await excelService.generateMembersExcel({
        members: mockMembers,
        analytics: mockAnalytics,
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const summary = workbook.getWorksheet('Analytics & Summary');
      expect(summary).toBeDefined();

      // Check Header title
      const titleCell = summary!.getCell('B1');
      expect(String(titleCell.value)).toContain("THE FATHER'S HOUSE CHURCH");

      // Check Dynamic Formula for Total Members (Cell C8)
      const totalCell = summary!.getCell('C8');
      expect((totalCell.value as any).formula).toBe("COUNTA('Members Data'!A2:A5)");
      expect((totalCell.value as any).result).toBe(4);

      // Check Dynamic Formula for Active Members (Cell C9)
      const activeCell = summary!.getCell('C9');
      expect((activeCell.value as any).formula).toBe('COUNTIF(\'Members Data\'!K2:K5, "ACTIVE")');
      expect((activeCell.value as any).result).toBe(3);

      // Check Dynamic Formula for Attendance Sum (Cell C15)
      const sumCell = summary!.getCell('C15');
      expect((sumCell.value as any).formula).toBe("SUM('Members Data'!M2:M5)");

      // Check Dynamic Formula for Attendance Average (Cell C16)
      const avgCell = summary!.getCell('C16');
      expect((avgCell.value as any).formula).toBe("IFERROR(AVERAGE('Members Data'!M2:M5), 0)");
    });

    it('Sheet 2 contains member records, frozen header row, and correct data types', async () => {
      const buffer = await excelService.generateMembersExcel({
        members: mockMembers,
        analytics: mockAnalytics,
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const dataSheet = workbook.getWorksheet('Members Data');
      expect(dataSheet).toBeDefined();

      // Row 1 is the header
      const headerRow = dataSheet!.getRow(1);
      expect(headerRow.getCell(1).value).toBe('Member ID');
      expect(headerRow.getCell(2).value).toBe('First Name');
      expect(headerRow.getCell(11).value).toBe('Membership Status');

      // Verify row count = header + 4 members = 5 rows
      expect(dataSheet!.rowCount).toBe(5);

      // Check Row 2 (Aanu)
      const row2 = dataSheet!.getRow(2);
      expect(row2.getCell(1).value).toBe('TFHC-001');
      expect(row2.getCell(2).value).toBe('Aanu');
      expect(row2.getCell(11).value).toBe('ACTIVE');
      expect(row2.getCell(12).value).toBe('Yes');
      expect(row2.getCell(13).value).toBe(18); // Number type!
    });
  });
});

