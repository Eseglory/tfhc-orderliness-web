import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService, ReportQueryDto } from '../src/modules/reports/reports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { MemberStatus, MeetingStatus, AttendanceStatus } from '@tfhc/shared';
import { ServiceCommitmentStatus } from '@prisma/client';

describe('Weekly Availability & Attendance Reporting Engine Suite', () => {
  let reportsService: ReportsService;

  // Mock Members (6 members to test all 6 matrix cases cleanly)
  const mockMembers = [
    { id: 'mem-1', memberCode: 'TFHC-001', firstName: 'Alice', lastName: 'Agbaje', status: MemberStatus.ACTIVE, subTeamId: 'team-protocol', subTeam: { id: 'team-protocol', name: 'Protocol' }, roleInUnit: 'Member' },
    { id: 'mem-2', memberCode: 'TFHC-002', firstName: 'Bob', lastName: 'Balogun', status: MemberStatus.ACTIVE, subTeamId: 'team-media', subTeam: { id: 'team-media', name: 'Media' }, roleInUnit: 'Member' },
    { id: 'mem-3', memberCode: 'TFHC-003', firstName: 'Charlie', lastName: 'Cole', status: MemberStatus.ACTIVE, subTeamId: 'team-choir', subTeam: { id: 'team-choir', name: 'Choir' }, roleInUnit: 'Member' },
    { id: 'mem-4', memberCode: 'TFHC-004', firstName: 'Diana', lastName: 'Danladi', status: MemberStatus.ACTIVE, subTeamId: 'team-ushering', subTeam: { id: 'team-ushering', name: 'Ushering' }, roleInUnit: 'Member' },
    { id: 'mem-5', memberCode: 'TFHC-005', firstName: 'Edward', lastName: 'Eze', status: MemberStatus.ACTIVE, subTeamId: 'team-protocol', subTeam: { id: 'team-protocol', name: 'Protocol' }, roleInUnit: 'Member' },
    { id: 'mem-6', memberCode: 'TFHC-006', firstName: 'Faith', lastName: 'Fashola', status: MemberStatus.ACTIVE, subTeamId: 'team-choir', subTeam: { id: 'team-choir', name: 'Choir' }, roleInUnit: 'Member' },
  ];

  // Mock Meetings (in September 2026)
  const mockMeetings = [
    {
      id: 'mtg-sun-1',
      title: 'Sunday Celebration Service - 1st Week',
      startTime: new Date('2026-09-06T09:00:00.000Z'),
      endTime: new Date('2026-09-06T11:30:00.000Z'),
      locationName: 'Main Sanctuary',
      status: MeetingStatus.CLOSED,
      categoryId: 'cat-sunday',
      category: { id: 'cat-sunday', name: 'Sunday Service' },
      eventTypeId: 'evt-regular',
      eventType: { id: 'evt-regular', name: 'Regular Worship', color: '#6366f1' },
      supervisingMinisterId: 'mem-1',
      supervisingMinister: { id: 'mem-1', firstName: 'Alice', lastName: 'Agbaje' },
      headcount: { totalHeadcount: 250, maleCount: 100, femaleCount: 110, childrenCount: 40, notes: 'Full sanctuary' },
    },
    {
      id: 'mtg-sun-2',
      title: 'Sunday Celebration Service - 2nd Week',
      startTime: new Date('2026-09-13T09:00:00.000Z'),
      endTime: new Date('2026-09-13T11:30:00.000Z'),
      locationName: 'Main Sanctuary',
      status: MeetingStatus.CLOSED,
      categoryId: 'cat-sunday',
      category: { id: 'cat-sunday', name: 'Sunday Service' },
      eventTypeId: 'evt-regular',
      eventType: { id: 'evt-regular', name: 'Regular Worship', color: '#6366f1' },
      supervisingMinisterId: 'mem-1',
      supervisingMinister: { id: 'mem-1', firstName: 'Alice', lastName: 'Agbaje' },
      headcount: { totalHeadcount: 280, maleCount: 115, femaleCount: 125, childrenCount: 40, notes: 'Anointing Service' },
    },
  ];

  // Mock Availability Cycles (Cycle 1 for Sep 6 meeting corresponds to week starting 2026-08-31)
  // Let's ensure cycles match WAT weekStart calculations
  const cycle1WeekStart = new Date(Date.UTC(2026, 7, 31)); // Aug 31, 2026 (Mon)
  const cycle2WeekStart = new Date(Date.UTC(2026, 8, 7)); // Sep 7, 2026 (Mon)

  const mockCycles = [
    {
      id: 'cycle-1',
      weekStart: cycle1WeekStart,
      responses: [
        { id: 'resp-1', cycleId: 'cycle-1', memberId: 'mem-1', submittedAt: new Date() }, // Alice submitted
        { id: 'resp-2', cycleId: 'cycle-1', memberId: 'mem-2', submittedAt: new Date() }, // Bob submitted
        { id: 'resp-3', cycleId: 'cycle-1', memberId: 'mem-3', submittedAt: new Date() }, // Charlie submitted
        { id: 'resp-4', cycleId: 'cycle-1', memberId: 'mem-4', submittedAt: new Date() }, // Diana submitted
        // Edward and Faith did not submit (NO_RESPONSE)
      ],
      commitments: [
        // Alice committed -> AVAILABLE
        { id: 'com-1', cycleId: 'cycle-1', memberId: 'mem-1', meetingId: 'mtg-sun-1', status: ServiceCommitmentStatus.COMMITTED },
        // Bob committed -> AVAILABLE
        { id: 'com-2', cycleId: 'cycle-1', memberId: 'mem-2', meetingId: 'mtg-sun-1', status: ServiceCommitmentStatus.COMMITTED },
        // Charlie declined -> NOT_AVAILABLE
        { id: 'com-3', cycleId: 'cycle-1', memberId: 'mem-3', meetingId: 'mtg-sun-1', status: ServiceCommitmentStatus.NOT_COMMITTED },
        // Diana declined -> NOT_AVAILABLE
        { id: 'com-4', cycleId: 'cycle-1', memberId: 'mem-4', meetingId: 'mtg-sun-1', status: ServiceCommitmentStatus.NOT_COMMITTED },
      ],
    },
    {
      id: 'cycle-2',
      weekStart: cycle2WeekStart,
      responses: [
        { id: 'resp-21', cycleId: 'cycle-2', memberId: 'mem-1', submittedAt: new Date() },
        { id: 'resp-22', cycleId: 'cycle-2', memberId: 'mem-2', submittedAt: new Date() },
      ],
      commitments: [
        { id: 'com-21', cycleId: 'cycle-2', memberId: 'mem-1', meetingId: 'mtg-sun-2', status: ServiceCommitmentStatus.COMMITTED },
        { id: 'com-22', cycleId: 'cycle-2', memberId: 'mem-2', meetingId: 'mtg-sun-2', status: ServiceCommitmentStatus.COMMITTED },
      ],
    },
  ];

  // Mock Attendance Records for meeting 1 (mtg-sun-1):
  // mem-1 (Alice): Attended -> AVAILABLE + ATTENDED
  // mem-2 (Bob): Absent -> AVAILABLE + DID NOT ATTEND
  // mem-3 (Charlie): Attended -> NOT AVAILABLE + ATTENDED
  // mem-4 (Diana): Absent -> NOT AVAILABLE + DID NOT ATTEND
  // mem-5 (Edward): Attended -> NO RESPONSE + ATTENDED
  // mem-6 (Faith): Absent -> NO RESPONSE + DID NOT ATTEND
  const mockAttendanceRecords = [
    {
      id: 'att-1',
      memberId: 'mem-1',
      meetingId: 'mtg-sun-1',
      status: AttendanceStatus.ON_TIME,
      actualArrivalTime: new Date('2026-09-06T08:45:00.000Z'),
      method: 'SYSTEM_GEO_QR',
      pointsEarned: 1.0,
    },
    // mem-2 (Bob) has no attendance record or is marked ABSENT
    {
      id: 'att-2',
      memberId: 'mem-2',
      meetingId: 'mtg-sun-1',
      status: AttendanceStatus.ABSENT,
      actualArrivalTime: null,
      method: 'MANUAL',
      pointsEarned: 0,
    },
    // mem-3 (Charlie): Attended
    {
      id: 'att-3',
      memberId: 'mem-3',
      meetingId: 'mtg-sun-1',
      status: AttendanceStatus.LATE,
      actualArrivalTime: new Date('2026-09-06T09:20:00.000Z'),
      method: 'SYSTEM_GEO',
      pointsEarned: 0.5,
    },
    // mem-5 (Edward): Attended without response
    {
      id: 'att-5',
      memberId: 'mem-5',
      meetingId: 'mtg-sun-1',
      status: AttendanceStatus.EARLY,
      actualArrivalTime: new Date('2026-09-06T08:30:00.000Z'),
      method: 'SYSTEM_GEO_QR',
      pointsEarned: 1.2,
    },
  ];

  const mockPrisma = {
    meeting: {
      findMany: jest.fn(async ({ where }) => {
        let list = [...mockMeetings];
        if (where?.id) {
          if (typeof where.id === 'string') list = list.filter((m) => m.id === where.id);
          else if (where.id.in) list = list.filter((m) => where.id.in.includes(m.id));
        }
        if (where?.categoryId) list = list.filter((m) => m.categoryId === where.categoryId);
        if (where?.supervisingMinisterId) list = list.filter((m) => m.supervisingMinisterId === where.supervisingMinisterId);
        return list;
      }),
      findUnique: jest.fn(async ({ where }) => mockMeetings.find((m) => m.id === where.id) || null),
    },
    weeklyAvailabilityCycle: {
      findMany: jest.fn(async () => mockCycles),
    },
    member: {
      findMany: jest.fn(async ({ where }) => {
        let list = [...mockMembers];
        if (where?.id) list = list.filter((m) => m.id === where.id);
        if (where?.subTeamId) list = list.filter((m) => m.subTeamId === where.subTeamId);
        return list;
      }),
      findUnique: jest.fn(async ({ where }) => mockMembers.find((m) => m.id === where.id) || null),
      count: jest.fn(async () => mockMembers.length),
    },
    attendanceRecord: {
      findMany: jest.fn(async ({ where }) => {
        let list = [...mockAttendanceRecords];
        if (where?.meetingId?.in) list = list.filter((a) => where.meetingId.in.includes(a.meetingId));
        if (where?.memberId?.in) list = list.filter((a) => where.memberId.in.includes(a.memberId));
        return list;
      }),
    },
    subTeam: {
      findMany: jest.fn(async () => [
        { id: 'team-protocol', name: 'Protocol' },
        { id: 'team-media', name: 'Media' },
        { id: 'team-choir', name: 'Choir' },
        { id: 'team-ushering', name: 'Ushering' },
      ]),
    },
    meetingCategory: {
      findMany: jest.fn(async () => [{ id: 'cat-sunday', name: 'Sunday Service' }]),
    },
    eventType: {
      findMany: jest.fn(async () => [{ id: 'evt-regular', name: 'Regular Worship', color: '#6366f1' }]),
    },
    systemSetting: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ key: 'unit_policy', value: '{}' })),
    },
  };

  const mockCache = {
    wrap: jest.fn((k, t, fn) => fn()),
    invalidateTags: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    reportsService = module.get<ReportsService>(ReportsService);
  });

  describe('1. Authoritative 6-Way Status Categorization', () => {
    it('correctly classifies all 6 distinct combinations for mtg-sun-1', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
      });

      expect(report.records).toHaveLength(6);

      const byMember = new Map(report.records.map((r) => [r.memberCode, r]));

      // TFHC-001 (Alice): Available + Attended
      const alice = byMember.get('TFHC-001')!;
      expect(alice.availabilityStatus).toBe('AVAILABLE');
      expect(alice.attendanceStatus).toBe('ATTENDED');
      expect(alice.combinedStatus).toBe('AVAILABLE_ATTENDED');

      // TFHC-002 (Bob): Available + Did Not Attend
      const bob = byMember.get('TFHC-002')!;
      expect(bob.availabilityStatus).toBe('AVAILABLE');
      expect(bob.attendanceStatus).toBe('ABSENT');
      expect(bob.combinedStatus).toBe('AVAILABLE_ABSENT');

      // TFHC-003 (Charlie): Not Available + Attended
      const charlie = byMember.get('TFHC-003')!;
      expect(charlie.availabilityStatus).toBe('NOT_AVAILABLE');
      expect(charlie.attendanceStatus).toBe('ATTENDED');
      expect(charlie.combinedStatus).toBe('UNAVAILABLE_ATTENDED');

      // TFHC-004 (Diana): Not Available + Did Not Attend
      const diana = byMember.get('TFHC-004')!;
      expect(diana.availabilityStatus).toBe('NOT_AVAILABLE');
      expect(diana.attendanceStatus).toBe('ABSENT');
      expect(diana.combinedStatus).toBe('UNAVAILABLE_ABSENT');

      // TFHC-005 (Edward): No Response + Attended
      const edward = byMember.get('TFHC-005')!;
      expect(edward.availabilityStatus).toBe('NO_RESPONSE');
      expect(edward.attendanceStatus).toBe('ATTENDED');
      expect(edward.combinedStatus).toBe('NO_RESPONSE_ATTENDED');

      // TFHC-006 (Faith): No Response + Did Not Attend
      const faith = byMember.get('TFHC-006')!;
      expect(faith.availabilityStatus).toBe('NO_RESPONSE');
      expect(faith.attendanceStatus).toBe('ABSENT');
      expect(faith.combinedStatus).toBe('NO_RESPONSE_ABSENT');
    });

    it('accurately computes summary metrics and conversion rates', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
      });

      const { summary } = report;
      expect(summary.totalRecords).toBe(6);
      expect(summary.totalAvailable).toBe(2); // Alice & Bob
      expect(summary.totalUnavailable).toBe(2); // Charlie & Diana
      expect(summary.totalNoResponse).toBe(2); // Edward & Faith

      expect(summary.availableAndAttended).toBe(1); // Alice
      expect(summary.availableAndAbsent).toBe(1); // Bob
      expect(summary.unavailableAndAttended).toBe(1); // Charlie
      expect(summary.unavailableAndAbsent).toBe(1); // Diana
      expect(summary.noResponseAndAttended).toBe(1); // Edward
      expect(summary.noResponseAndAbsent).toBe(1); // Faith

      expect(summary.totalAttended).toBe(3); // Alice, Charlie, Edward
      expect(summary.totalAbsent).toBe(3); // Bob, Diana, Faith

      // Conversion Rate: (Available + Attended) / (Total Available) = 1 / 2 = 50.0%
      expect(summary.conversionRate).toBe(50);

      // Availability Response Rate: 4 responses / 6 total members = 66.7%
      expect(summary.availabilityResponseRate).toBe(66.7);

      // Attendance Rate: 3 attended / 6 total = 50.0%
      expect(summary.attendanceRate).toBe(50);
    });
  });

  describe('2. Combinable Dynamic Filtering', () => {
    it('filters by combinedStatus = AVAILABLE_ABSENT (Available + Did Not Attend)', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
        combinedStatus: 'AVAILABLE_ABSENT',
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].memberCode).toBe('TFHC-002'); // Bob
      expect(report.records[0].combinedStatus).toBe('AVAILABLE_ABSENT');
    });

    it('filters by combinedStatus = NO_RESPONSE_ATTENDED (Walk-ins / Uncommitted attendees)', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
        combinedStatus: 'NO_RESPONSE_ATTENDED',
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].memberCode).toBe('TFHC-005'); // Edward
      expect(report.records[0].combinedStatus).toBe('NO_RESPONSE_ATTENDED');
    });

    it('filters by subTeamId + availabilityStatus', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
        subTeamId: 'team-protocol',
        availabilityStatus: 'AVAILABLE',
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].memberCode).toBe('TFHC-001'); // Alice is Protocol & Available
    });

    it('filters by search term (name, code, subTeam, meeting)', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
        search: 'Agbaje',
      });

      expect(report.records).toHaveLength(1);
      expect(report.records[0].memberName).toBe('Alice Agbaje');
    });

    it('filters by month in WAT (e.g. "2026-09")', async () => {
      const report = await reportsService.getAvailabilityAttendanceReport({
        month: '2026-09',
      });

      expect(report.since.getUTCFullYear()).toBe(2026);
      expect(report.serviceSummaries).toHaveLength(2);
      expect(report.monthlySummaries).toHaveLength(1);
      expect(report.monthlySummaries[0].monthLabel).toContain('September 2026');
    });
  });

  describe('3. Person-Level Historical Report', () => {
    it('returns complete historical commitment record and totals for a selected member', async () => {
      const personReport = await reportsService.getPersonReport('mem-1');

      expect(personReport.member.fullName).toBe('Alice Agbaje');
      expect(personReport.stats.totalServices).toBeGreaterThan(0);
      expect(personReport.stats.servicesAvailable).toBeGreaterThanOrEqual(1);
      expect(personReport.stats.servicesAttended).toBeGreaterThanOrEqual(1);
      expect(personReport.history).toBeDefined();
    });
  });

  describe('4. Service-Level Reconciliation Report', () => {
    it('returns service details and 6-way rosters with headcount variance', async () => {
      const serviceReport = await reportsService.getServiceReport('mtg-sun-1');

      expect(serviceReport.meeting.title).toBe('Sunday Celebration Service - 1st Week');
      expect(serviceReport.meeting.headcount?.totalHeadcount).toBe(250);

      expect(serviceReport.categorized.availableAndAttended).toHaveLength(1);
      expect(serviceReport.categorized.availableAndAbsent).toHaveLength(1);
      expect(serviceReport.categorized.unavailableAndAttended).toHaveLength(1);
      expect(serviceReport.categorized.unavailableAndAbsent).toHaveLength(1);
      expect(serviceReport.categorized.noResponseAndAttended).toHaveLength(1);
      expect(serviceReport.categorized.noResponseAndAbsent).toHaveLength(1);

      expect(serviceReport.summary.conversionRate).toBe(50);
    });
  });

  describe('5. Pagination, Sorting & Exports', () => {
    it('paginates records server-side correctly', async () => {
      const page1 = await reportsService.getAvailabilityAttendanceReport({
        meetingId: 'mtg-sun-1',
        page: 1,
        limit: 2,
      });

      expect(page1.records).toHaveLength(2);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);
      expect(page1.totalPages).toBe(3);
      expect(page1.total).toBe(6);
    });

    it('generates valid Excel workbook respecting active filters', async () => {
      const excelBuffer = await reportsService.generateFilteredExcel({
        meetingId: 'mtg-sun-1',
        combinedStatus: 'AVAILABLE_ATTENDED',
      });

      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(excelBuffer.length).toBeGreaterThan(1000);
    });

    it('generates valid UTF-8 CSV string with BOM', async () => {
      const csvString = await reportsService.generateFilteredCsv({
        meetingId: 'mtg-sun-1',
      });

      expect(typeof csvString).toBe('string');
      expect(csvString.startsWith('\uFEFF')).toBe(true);
      expect(csvString).toContain('Member Code');
      expect(csvString).toContain('TFHC-001');
    });
  });
});
