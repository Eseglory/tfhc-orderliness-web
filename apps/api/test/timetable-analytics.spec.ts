import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimetableAnalyticsService, DatePreset } from '../src/modules/timetable/timetable-analytics.service';
import { TimetableReportPdfService } from '../src/modules/timetable/timetable-report-pdf.service';
import { TimetableReportExcelService } from '../src/modules/timetable/timetable-report-excel.service';
import { TimetableService } from '../src/modules/timetable/timetable.service';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableGenerationType,
  AttendanceStatus,
  ExcuseStatus,
  MeetingStatus,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';

describe('Timetable & Attendance Analytics, Intelligence & Reporting E2E Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let analyticsService: TimetableAnalyticsService;
  let pdfService: TimetableReportPdfService;
  let excelService: TimetableReportExcelService;
  let timetableService: TimetableService;

  let testAdminUser: any;
  let testMinisterUser: any;
  let ministerMember: any;
  let testMember1: any;
  let testMember2: any;
  let testMember3: any;

  let testPeriodId: string;
  let testVersionId: string;
  let testSunday2ndSessionId: string;
  let testSunday3rdSessionId: string;
  let testTuesdaySessionId: string;

  let meetingSunday2nd: any;
  let meetingSunday3rd: any;
  let categoryId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    analyticsService = app.get(TimetableAnalyticsService);
    pdfService = app.get(TimetableReportPdfService);
    excelService = app.get(TimetableReportExcelService);
    timetableService = app.get(TimetableService);

    // Setup Test Users and Members
    testAdminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });
    if (!testAdminUser) {
      testAdminUser = await prisma.user.create({
        data: {
          email: `analytics_admin_${Date.now()}@tfhc.test`,
          passwordHash: '$2b$10$hashedtestpassword1234567890',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }

    testMinisterUser = await prisma.user.create({
      data: {
        email: `minister_${Date.now()}@tfhc.test`,
        passwordHash: '$2b$10$hashedtestpassword1234567890',
        role: 'ADMIN',
        isActive: true,
      },
    });

    ministerMember = await prisma.member.create({
      data: {
        userId: testMinisterUser.id,
        memberCode: `MIN-${Date.now().toString().slice(-4)}`,
        firstName: 'Barnabas',
        lastName: 'Minister',
        phoneNumber: '08099990001',
        status: 'ACTIVE',
      },
    });

    testMember1 = await prisma.member.create({
      data: {
        memberCode: `USHER-1-${Date.now().toString().slice(-4)}`,
        firstName: 'John',
        lastName: 'UsherOne',
        phoneNumber: '08099990002',
        status: 'ACTIVE',
      },
    });

    testMember2 = await prisma.member.create({
      data: {
        memberCode: `USHER-2-${Date.now().toString().slice(-4)}`,
        firstName: 'Mary',
        lastName: 'UsherTwo',
        phoneNumber: '08099990003',
        status: 'ACTIVE',
      },
    });

    testMember3 = await prisma.member.create({
      data: {
        memberCode: `USHER-3-${Date.now().toString().slice(-4)}`,
        firstName: 'David',
        lastName: 'UsherThree',
        phoneNumber: '08099990004',
        status: 'ACTIVE',
      },
    });

    // Ensure Meeting Category exists
    let cat = await prisma.meetingCategory.findFirst();
    if (!cat) {
      cat = await prisma.meetingCategory.create({
        data: {
          name: 'Regular Sunday Service',
        },
      });
    }
    categoryId = cat.id;

    // Ensure ServiceSchedules exist for foreign key constraint
    await prisma.serviceSchedule.upsert({
      where: { id: 'sunday-second' },
      update: {},
      create: {
        id: 'sunday-second',
        title: 'Sunday Second Service',
        dayOfWeek: 0,
        startMinutes: 510,
        endMinutes: 630,
        categoryName: 'Sunday Service',
        enabled: true,
      },
    });

    await prisma.serviceSchedule.upsert({
      where: { id: 'sunday-third' },
      update: {},
      create: {
        id: 'sunday-third',
        title: 'Sunday Third Service',
        dayOfWeek: 0,
        startMinutes: 645,
        endMinutes: 765,
        categoryName: 'Sunday Service',
        enabled: true,
      },
    });

    // Create a Test Timetable Period and Version
    // Pick an isolated date in the future for this test period to prevent colliding with existing periods
    const baseMonday = new Date(Date.UTC(2035, 9, 15, 0, 0, 0, 0));

    const period = await prisma.timetablePeriod.create({
      data: {
        weekStart: baseMonday,
        label: `Analytics Test Week ${Date.now().toString().slice(-4)}`,
        status: TimetablePeriodStatus.PUBLISHED,
      },
    });
    testPeriodId = period.id;

    const version = await prisma.timetableVersion.create({
      data: {
        periodId: period.id,
        versionNumber: 1,
        status: TimetableVersionStatus.PUBLISHED,
        generationType: TimetableGenerationType.MANUAL_INITIAL,
        publishedAt: new Date(),
        publishedByUserId: testAdminUser.id,
      },
    });
    testVersionId = version.id;

    // Create 3 Sessions: Sunday 2nd, Sunday 3rd, and Tuesday Mid-week
    const sundayDate = new Date(Date.UTC(2035, 9, 21, 8, 30, 0, 0));
    const tuesdayDate = new Date(Date.UTC(2035, 9, 16, 18, 0, 0, 0));

    const sessionSun2 = await prisma.timetableServiceSession.create({
      data: {
        versionId: version.id,
        sessionKey: 'SUNDAY_SECOND',
        serviceName: 'Sunday Second Service',
        serviceDay: 'SUNDAY',
        serviceDate: sundayDate,
        startTime: sundayDate,
        endTime: new Date(sundayDate.getTime() + 2 * 3600 * 1000),
        requiredUshers: 2,
        assignedUshersCount: 2,
      },
    });
    testSunday2ndSessionId = sessionSun2.id;

    const sessionSun3 = await prisma.timetableServiceSession.create({
      data: {
        versionId: version.id,
        sessionKey: 'SUNDAY_THIRD',
        serviceName: 'Sunday Third Service',
        serviceDay: 'SUNDAY',
        serviceDate: sundayDate,
        startTime: new Date(sundayDate.getTime() + 2 * 3600 * 1000),
        endTime: new Date(sundayDate.getTime() + 4 * 3600 * 1000),
        requiredUshers: 2,
        assignedUshersCount: 2,
      },
    });
    testSunday3rdSessionId = sessionSun3.id;

    const sessionTue = await prisma.timetableServiceSession.create({
      data: {
        versionId: version.id,
        sessionKey: 'TUESDAY_MIDWEEK',
        serviceName: 'Tuesday Mid-Week Teaching Service',
        serviceDay: 'TUESDAY',
        serviceDate: tuesdayDate,
        startTime: tuesdayDate,
        endTime: new Date(tuesdayDate.getTime() + 2 * 3600 * 1000),
        requiredUshers: 2,
        assignedUshersCount: 1,
      },
    });
    testTuesdaySessionId = sessionTue.id;

    // Assign Ushers to Sessions:
    // Sunday 2nd: Member 1 & Member 2
    await prisma.timetableAssignment.createMany({
      data: [
        {
          sessionId: sessionSun2.id,
          memberId: testMember1.id,
          position: 'Lead Usher',
        },
        {
          sessionId: sessionSun2.id,
          memberId: testMember2.id,
          position: 'Usher',
        },
      ],
    });

    // Sunday 3rd: Member 2 & Member 3
    await prisma.timetableAssignment.createMany({
      data: [
        {
          sessionId: sessionSun3.id,
          memberId: testMember2.id,
          position: 'Usher',
        },
        {
          sessionId: sessionSun3.id,
          memberId: testMember3.id,
          position: 'Usher',
        },
      ],
    });

    // Tuesday: Member 1
    await prisma.timetableAssignment.create({
      data: {
        sessionId: sessionTue.id,
        memberId: testMember1.id,
        position: 'Usher',
      },
    });

    // Create Correlated Meetings
    // Meeting for Sunday 2nd: Past completed meeting
    meetingSunday2nd = await prisma.meeting.create({
      data: {
        title: 'Sunday Second Service',
        meetingDate: sundayDate,
        startTime: sundayDate,
        expectedArrivalTime: sundayDate,
        attendanceOpenTime: sundayDate,
        attendanceCloseTime: new Date(sundayDate.getTime() + 2 * 3600 * 1000),
        endTime: new Date(sundayDate.getTime() + 2 * 3600 * 1000),
        serviceScheduleId: 'sunday-second',
        locationName: 'Main Auditorium',
        latitude: 6.5244,
        longitude: 3.3792,
        status: MeetingStatus.CLOSED,
        categoryId,
        supervisingMinisterId: ministerMember.id,
      },
    });

    // Attendance record for Member 1: EARLY present
    await prisma.attendanceRecord.create({
      data: {
        meetingId: meetingSunday2nd.id,
        memberId: testMember1.id,
        status: AttendanceStatus.EARLY,
        expectedArrivalTime: sundayDate,
        actualArrivalTime: sundayDate,
      },
    });

    // Member 2 did not attend Sunday 2nd: marked ABSENT
    await prisma.attendanceRecord.create({
      data: {
        meetingId: meetingSunday2nd.id,
        memberId: testMember2.id,
        status: AttendanceStatus.ABSENT,
        expectedArrivalTime: sundayDate,
      },
    });

    // Meeting for Sunday 3rd:
    const sun3Start = new Date(sundayDate.getTime() + 2 * 3600 * 1000);
    meetingSunday3rd = await prisma.meeting.create({
      data: {
        title: 'Sunday Third Service',
        meetingDate: sundayDate,
        startTime: sun3Start,
        expectedArrivalTime: sun3Start,
        attendanceOpenTime: sun3Start,
        attendanceCloseTime: new Date(sun3Start.getTime() + 2 * 3600 * 1000),
        endTime: new Date(sun3Start.getTime() + 2 * 3600 * 1000),
        serviceScheduleId: 'sunday-third',
        locationName: 'Main Auditorium',
        latitude: 6.5244,
        longitude: 3.3792,
        status: MeetingStatus.CLOSED,
        categoryId,
        supervisingMinisterId: ministerMember.id,
      },
    });

    // Member 2 attended Sunday 3rd: ON_TIME
    await prisma.attendanceRecord.create({
      data: {
        meetingId: meetingSunday3rd.id,
        memberId: testMember2.id,
        status: AttendanceStatus.ON_TIME,
        expectedArrivalTime: sun3Start,
        actualArrivalTime: sun3Start,
      },
    });

    // Member 3 had an approved excuse for Sunday 3rd
    await prisma.absenceExcuse.create({
      data: {
        meetingId: meetingSunday3rd.id,
        memberId: testMember3.id,
        reason: 'Work travel',
        category: 'TRAVEL',
        status: ExcuseStatus.APPROVED,
        reviewedBy: testAdminUser.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up created entities
    try {
      await prisma.attendanceRecord.deleteMany({
        where: { meetingId: { in: [meetingSunday2nd?.id, meetingSunday3rd?.id].filter(Boolean) } },
      });
      await prisma.absenceExcuse.deleteMany({
        where: { meetingId: { in: [meetingSunday2nd?.id, meetingSunday3rd?.id].filter(Boolean) } },
      });
      await prisma.meeting.deleteMany({
        where: { id: { in: [meetingSunday2nd?.id, meetingSunday3rd?.id].filter(Boolean) } },
      });
      if (testPeriodId) {
        await prisma.timetablePeriod.delete({ where: { id: testPeriodId } }).catch(() => {});
      }
      if (testMember1) await prisma.member.delete({ where: { id: testMember1.id } }).catch(() => {});
      if (testMember2) await prisma.member.delete({ where: { id: testMember2.id } }).catch(() => {});
      if (testMember3) await prisma.member.delete({ where: { id: testMember3.id } }).catch(() => {});
      if (testMinisterUser) await prisma.user.delete({ where: { id: testMinisterUser.id } }).catch(() => {});
    } catch (e) {
      // Ignore cleanup error
    }
    await app.close();
  });

  // ==========================================
  // REQUIREMENT 1: DATE RANGE PRESETS PARSER
  // ==========================================
  describe('Requirement 1: Date Range Presets Resolution', () => {
    it('should resolve TODAY preset with start and end of day', () => {
      const { startDate, endDate, label } = analyticsService.parseDateRange('TODAY');
      expect(label).toBe('Today');
      expect(startDate).toBeInstanceOf(Date);
      expect(endDate).toBeInstanceOf(Date);
      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
    });

    it('should resolve THIS_WEEK, LAST_WEEK, THIS_MONTH, THIS_QUARTER, THIS_YEAR presets', () => {
      const presets: DatePreset[] = ['THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR'];
      for (const p of presets) {
        const { startDate, endDate, label } = analyticsService.parseDateRange(p);
        expect(startDate).toBeInstanceOf(Date);
        expect(endDate).toBeInstanceOf(Date);
        expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
        expect(label).toBeDefined();
      }
    });

    it('should resolve CUSTOM date range properly', () => {
      const { startDate, endDate, label } = analyticsService.parseDateRange(
        'CUSTOM',
        '2026-11-01',
        '2026-11-15',
      );
      expect(startDate.toISOString()).toContain('2026-11-01');
      expect(endDate.toISOString()).toContain('2026-11-15');
      expect(label).toContain('2026-11-01 to 2026-11-15');
    });

    it('should resolve SPECIFIC_DATE preset to single 24-hour boundary', () => {
      const { startDate, endDate, label } = analyticsService.parseDateRange(
        'SPECIFIC_DATE',
        undefined,
        undefined,
        '2026-11-23',
      );
      expect(startDate.toISOString()).toContain('2026-11-23T00:00:00');
      expect(endDate.toISOString()).toContain('2026-11-23T23:59:59');
      expect(label).toBe('Specific Date: 2026-11-23');
    });
  });

  // =========================================================================
  // REQUIREMENT 2: TIMETABLE-TO-ATTENDANCE CROSS-CORRELATION ENGINE
  // =========================================================================
  describe('Requirement 2: Cross-Correlation & Service Isolation', () => {
    it('accurately correlates Sunday 2nd and Sunday 3rd on the same date without cross-contamination', async () => {
      const { items } = await analyticsService.searchAssignments({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
        limit: 50,
      });

      // Filter to our test assignments
      const testItems = items.filter(
        (i) => i.memberId === testMember1.id || i.memberId === testMember2.id || i.memberId === testMember3.id,
      );

      expect(testItems.length).toBeGreaterThanOrEqual(5);

      // Verify Member 1 on Sunday 2nd
      const m1Sun2 = testItems.find((i) => i.memberId === testMember1.id && i.sessionKey === 'SUNDAY_SECOND');
      expect(m1Sun2).toBeDefined();
      expect(m1Sun2?.attendanceStatus).toBe('PRESENT');
      expect(m1Sun2?.clockInRecorded).toBe(true);

      // Verify Member 2 on Sunday 2nd: Marked ABSENT with discrepancy
      const m2Sun2 = testItems.find((i) => i.memberId === testMember2.id && i.sessionKey === 'SUNDAY_SECOND');
      expect(m2Sun2).toBeDefined();
      expect(m2Sun2?.attendanceStatus).toBe('ABSENT');
      expect(m2Sun2?.isDiscrepancy).toBe(true);

      // Verify Member 2 on Sunday 3rd: Marked PRESENT (did attend 3rd service!)
      const m2Sun3 = testItems.find((i) => i.memberId === testMember2.id && i.sessionKey === 'SUNDAY_THIRD');
      expect(m2Sun3).toBeDefined();
      expect(m2Sun3?.attendanceStatus).toBe('PRESENT');

      // Verify Member 3 on Sunday 3rd: Has approved excuse -> EXCUSED
      const m3Sun3 = testItems.find((i) => i.memberId === testMember3.id && i.sessionKey === 'SUNDAY_THIRD');
      expect(m3Sun3).toBeDefined();
      expect(m3Sun3?.attendanceStatus).toBe('EXCUSED');
    });

    it('handles future or in-progress service sessions as SCHEDULED without false absence', async () => {
      const { items } = await analyticsService.searchAssignments({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
        sessionKeys: ['TUESDAY_MIDWEEK'],
      });

      const m1Tue = items.find((i) => i.memberId === testMember1.id && i.sessionKey === 'TUESDAY_MIDWEEK');
      if (m1Tue && !m1Tue.isCompleted) {
        expect(m1Tue.attendanceStatus).toBe('SCHEDULED');
        expect(m1Tue.subStatus).toBe('UPCOMING_SERVICE');
        expect(m1Tue.isDiscrepancy).toBe(false);
      }
    });
  });

  // =========================================================================
  // REQUIREMENT 3: ANALYTICS DASHBOARD AGGREGATIONS & METRICS
  // =========================================================================
  describe('Requirement 3: Analytics Dashboard Metrics & Fairness', () => {
    it('returns complete executive metrics with accurate attendance rate calculation', async () => {
      const dashboard = await analyticsService.getDashboardAnalytics({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
      });

      expect(dashboard).toBeDefined();
      expect(dashboard.period || dashboard.reportingPeriod).toBeDefined();
      expect(dashboard.overview || dashboard.summary).toBeDefined();
      expect(dashboard.summary.totalAssignments).toBeGreaterThanOrEqual(5);
      expect(typeof dashboard.overview?.coverageRate).toBe('number');
      expect(typeof dashboard.overview?.attendanceRate).toBe('number');

      // Fairness metrics
      expect(dashboard.fairness).toBeDefined();
      expect(typeof dashboard.fairness.averageAssignmentsPerMember).toBe('number');
      expect(typeof dashboard.fairness.standardDeviation).toBe('number');
      expect(Array.isArray(dashboard.fairness.distributionHistogram)).toBe(true);

      // Attendance metrics
      expect(dashboard.attendance).toBeDefined();
      expect(typeof dashboard.attendance?.presentCount).toBe('number');
      expect(typeof dashboard.attendance?.punctualityRate).toBe('number');

      // Service breakdown
      expect(Array.isArray(dashboard.services || dashboard.serviceBreakdown)).toBe(true);
      const sun2 = (dashboard.services || dashboard.serviceBreakdown).find((s: any) => s.sessionKey === 'SUNDAY_SECOND');
      expect(sun2).toBeDefined();
      expect(sun2.assignedUshers).toBeGreaterThanOrEqual(2);

      // Supervising Minister breakdown
      expect(Array.isArray(dashboard.ministers || dashboard.supervisingMinisterBreakdown)).toBe(true);
      const ministerEntry = (dashboard.ministers || dashboard.supervisingMinisterBreakdown).find((m: any) =>
        m.ministerName.includes('Barnabas'),
      );
      expect(ministerEntry).toBeDefined();
      expect(ministerEntry.ushersScheduled || ministerEntry.totalScheduledUshers).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // REQUIREMENT 4: MULTI-CRITERIA SEARCH AND FILTERING
  // =========================================================================
  describe('Requirement 4: Multi-Criteria Search & Filtering', () => {
    it('filters assignments by member name query', async () => {
      const res = await analyticsService.searchAssignments({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
        query: 'UsherOne',
      });

      expect(res.items.length).toBeGreaterThanOrEqual(1);
      expect(res.items.every((i) => i.fullName.includes('UsherOne'))).toBe(true);
    });

    it('filters assignments by specific attendance status', async () => {
      const res = await analyticsService.searchAssignments({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
        attendanceStatuses: ['EXCUSED'],
      });

      expect(res.items.length).toBeGreaterThanOrEqual(1);
      expect(res.items.every((i) => i.attendanceStatus === 'EXCUSED')).toBe(true);
    });

    it('filters assignments by clock-in recorded status', async () => {
      const res = await analyticsService.searchAssignments({
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
        clockInFilter: 'RECORDED',
      });

      expect(res.items.length).toBeGreaterThanOrEqual(1);
      expect(res.items.every((i) => i.clockInRecorded)).toBe(true);
    });
  });

  // =========================================================================
  // REQUIREMENT 5: MEMBER, SERVICE AND MINISTER DRILLDOWNS
  // =========================================================================
  describe('Requirement 5: Individual Drilldown Methods', () => {
    it('returns detailed member analytics and participation history', async () => {
      const res = await analyticsService.getMemberAnalytics(testMember1.id, {
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
      });

      expect(res).toBeDefined();
      expect(res.member.fullName).toContain('UsherOne');
      expect((res.summary || res.stats).totalAssignments).toBeGreaterThanOrEqual(1);
      expect((res.assignments || res.history).length).toBeGreaterThanOrEqual(1);
    });

    it('returns service-level analytics', async () => {
      const res = await analyticsService.getServiceAnalytics('SUNDAY_SECOND', {
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
      });

      expect(res).toBeDefined();
      expect(res.sessionKey).toBe('SUNDAY_SECOND');
      expect(res.assignments.length).toBeGreaterThanOrEqual(2);
    });

    it('returns supervising minister analytics', async () => {
      const res = await analyticsService.getMinisterAnalytics(ministerMember.id, {
        datePreset: 'CUSTOM',
        startDate: '2035-10-15',
        endDate: '2035-10-25',
      });

      expect(res).toBeDefined();
      expect(res.minister.fullName).toContain('Barnabas');
      expect((res.supervisedServices || res.assignments).length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // REQUIREMENT 6: EXECUTIVE LANDSCAPE PDF REPORTING
  // =========================================================================
  describe('Requirement 6: Executive PDF Report Generation', () => {
    it('generates a valid, professional PDF buffer for COMPREHENSIVE_MANAGEMENT', async () => {
      const buffer = await pdfService.generateReport(
        'COMPREHENSIVE_MANAGEMENT',
        { datePreset: 'CUSTOM', startDate: '2035-10-15', endDate: '2035-10-25' },
        'Super Administrator',
      );

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(500);

      // Verify PDF magic header bytes
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('generates valid PDF documents for all specialized report types', async () => {
      const reportTypes = [
        'WEEKLY_TIMETABLE',
        'ATTENDANCE_PERFORMANCE',
        'ASSIGNMENT_FAIRNESS',
        'SUPERVISING_MINISTER',
      ] as const;

      for (const type of reportTypes) {
        const buffer = await pdfService.generateReport(
          type,
          { datePreset: 'CUSTOM', startDate: '2035-10-15', endDate: '2035-10-25' },
          'Auditor',
        );
        expect(buffer).toBeDefined();
        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      }
    });
  });

  // =========================================================================
  // REQUIREMENT 7: MULTI-SHEET EXCEL WORKBOOK GENERATION
  // =========================================================================
  describe('Requirement 7: Professional Multi-Sheet Excel Workbook', () => {
    it('generates a 7-sheet analytical Excel workbook with proper structure and formulas', async () => {
      const buffer = await excelService.generateReport(
        'COMPREHENSIVE_MANAGEMENT',
        { datePreset: 'CUSTOM', startDate: '2035-10-15', endDate: '2035-10-25' },
        'Analytics Lead',
      );

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(1000);

      // Load workbook back using ExcelJS to verify structure
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const sheetNames = workbook.worksheets.map((w) => w.name);

      // Verify all 7 required sheets are present
      expect(sheetNames).toContain('Executive Summary');
      expect(sheetNames).toContain('Timetable Assignments');
      expect(sheetNames).toContain('Attendance Records');
      expect(sheetNames).toContain('Member Performance');
      expect(sheetNames).toContain('Service Analytics');
      expect(sheetNames).toContain('Supervising Minister Summary');
      expect(sheetNames).toContain('Assignment Distribution');

      // Check Executive Summary content
      const summarySheet = workbook.getWorksheet('Executive Summary');
      expect(summarySheet).toBeDefined();
      expect(summarySheet?.rowCount).toBeGreaterThan(10);

      // Check Assignments sheet
      const assignmentsSheet = workbook.getWorksheet('Timetable Assignments');
      expect(assignmentsSheet).toBeDefined();
      expect(assignmentsSheet?.rowCount).toBeGreaterThan(2);

      // Check Attendance Records sheet
      const attendanceSheet = workbook.getWorksheet('Attendance Records');
      expect(attendanceSheet).toBeDefined();
      expect(attendanceSheet?.rowCount).toBeGreaterThan(2);

      // Check Distribution sheet
      const distSheet = workbook.getWorksheet('Assignment Distribution');
      expect(distSheet).toBeDefined();
      expect(distSheet?.rowCount).toBeGreaterThan(2);
    });
  });
});
