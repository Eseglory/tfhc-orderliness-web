import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { BadRequestException } from '@nestjs/common';
import { MemberStatus, MeetingStatus, WeeklyAvailabilityState } from '@prisma/client';

describe('Weekly Availability Poll & Attendance Reconciliation Engine Suite', () => {
  let service: AvailabilityService;

  const weekStart = new Date('2026-09-14T00:00:00.000Z');
  const weekClose = new Date('2026-09-18T23:59:59.000Z');

  const mockMembers = [
    { id: 'mem-1', memberCode: 'TFHC-001', firstName: 'Alice', lastName: 'Agbaje', status: MemberStatus.ACTIVE, subTeam: { name: 'Protocol' } },
    { id: 'mem-2', memberCode: 'TFHC-002', firstName: 'Bob', lastName: 'Balogun', status: MemberStatus.ACTIVE, subTeam: { name: 'Media' } },
    { id: 'mem-3', memberCode: 'TFHC-003', firstName: 'Charlie', lastName: 'Cole', status: MemberStatus.ACTIVE, subTeam: { name: 'Choir' } },
    { id: 'mem-4', memberCode: 'TFHC-004', firstName: 'Diana', lastName: 'Danladi', status: MemberStatus.ACTIVE, subTeam: { name: 'Ushering' } },
  ];

  const mockMeetings = [
    { id: 'mtg-tue', title: 'Tuesday Bible Study', startTime: new Date('2026-09-15T18:00:00Z'), endTime: new Date('2026-09-15T19:30:00Z'), locationName: 'Main Sanctuary', status: MeetingStatus.CLOSED },
    { id: 'mtg-sun', title: 'Sunday Celebration Service', startTime: new Date('2026-09-20T09:00:00Z'), endTime: new Date('2026-09-20T11:30:00Z'), locationName: 'Main Sanctuary', status: MeetingStatus.CLOSED },
  ];

  let inMemoryCycle: any = {
    id: 'cycle-2026-09-14',
    weekStart,
    opensAt: weekStart,
    closesAt: weekClose,
    state: WeeklyAvailabilityState.OPEN,
  };

  const inMemoryResponses: any[] = [];
  let inMemoryCommitments: any[] = [];
  let inMemoryAttendance: any[] = [];

  const mockCache = {
    wrap: jest.fn((k, t, fn) => fn()),
    invalidateTag: jest.fn(),
    invalidateTags: jest.fn(),
  };

  const mockPrisma = {
    weeklyAvailabilityCycle: {
      upsert: jest.fn(async ({ where, create }) => {
        if (!inMemoryCycle) {
          inMemoryCycle = { id: `cycle-${where.weekStart.toISOString().split('T')[0]}`, ...create, state: WeeklyAvailabilityState.OPEN };
        }
        return inMemoryCycle;
      }),
      findUnique: jest.fn(async ({ include }) => {
        if (!inMemoryCycle) return null;
        const res = { ...inMemoryCycle };
        if (include?.commitments) {
          const filterMemberId = include.commitments.where?.memberId;
          res.commitments = filterMemberId
            ? inMemoryCommitments.filter((c) => c.memberId === filterMemberId)
            : inMemoryCommitments;
        }
        if (include?.responses) {
          const filterMemberId = include.responses.where?.memberId;
          res.responses = filterMemberId
            ? inMemoryResponses.filter((r) => r.memberId === filterMemberId)
            : inMemoryResponses;
        }
        return res;
      }),
      findFirst: jest.fn(async () => inMemoryCycle),
      findMany: jest.fn(async () => [inMemoryCycle]),
      updateMany: jest.fn(async ({ data }) => {
        if (inMemoryCycle) Object.assign(inMemoryCycle, data);
        return { count: 1 };
      }),
    },
    member: {
      findUnique: jest.fn(async ({ where }) => mockMembers.find((m) => m.id === where.id) || null),
      findMany: jest.fn(async () => mockMembers),
      count: jest.fn(async () => mockMembers.length),
    },
    meeting: {
      findMany: jest.fn(async () => mockMeetings),
    },
    memberServiceCommitment: {
      findMany: jest.fn(async ({ where }) => {
        let list = [...inMemoryCommitments];
        if (where?.cycleId) list = list.filter((c) => c.cycleId === where.cycleId);
        if (where?.memberId) list = list.filter((c) => c.memberId === where.memberId);
        return list;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        inMemoryCommitments = inMemoryCommitments.filter(
          (c) => !(c.cycleId === where.cycleId && c.memberId === where.memberId)
        );
        return { count: 1 };
      }),
      createMany: jest.fn(async ({ data }) => {
        inMemoryCommitments.push(...data);
        return { count: data.length };
      }),
    },
    weeklyAvailabilityResponse: {
      upsert: jest.fn(async ({ where, create }) => {
        const existingIdx = inMemoryResponses.findIndex(
          (r) => r.cycleId === where.cycleId_memberId.cycleId && r.memberId === where.cycleId_memberId.memberId
        );
        if (existingIdx >= 0) {
          inMemoryResponses[existingIdx].submittedAt = new Date();
          return inMemoryResponses[existingIdx];
        }
        const created = { id: `resp-${Date.now()}`, ...create, submittedAt: new Date() };
        inMemoryResponses.push(created);
        return created;
      }),
    },
    attendanceRecord: {
      findMany: jest.fn(async ({ where }) => {
        let list = [...inMemoryAttendance];
        if (where?.meetingId?.in) list = list.filter((a) => where.meetingId.in.includes(a.meetingId));
        return list;
      }),
    },
    $transaction: jest.fn(async (fn) => fn(mockPrisma)),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T07:00:00Z')); // Monday 08:00 AM WAT
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Weekly Availability Poll Creation & Idempotency', () => {
    it('should open the weekly availability cycle for the current week', async () => {
      const cycle = await service.openCurrentWeek(new Date('2026-09-14T08:00:00Z'));
      expect(cycle).toBeDefined();
      expect(cycle.state).toBe(WeeklyAvailabilityState.OPEN);
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('availability');
    });

    it('should be idempotent: calling openCurrentWeek multiple times does not create duplicates', async () => {
      const cycle1 = await service.openCurrentWeek(new Date('2026-09-14T08:00:00Z'));
      const cycle2 = await service.openCurrentWeek(new Date('2026-09-14T12:00:00Z'));
      expect(cycle1.id).toBe(cycle2.id);
    });
  });

  describe('2. Member Multi-Service Availability Submission', () => {
    it('Member A (Alice) commits to BOTH Tuesday and Sunday services', async () => {
      const result = await service.submit('mem-1', ['mtg-tue', 'mtg-sun']);
      expect(result.selectedMeetingIds).toEqual(['mtg-tue', 'mtg-sun']);
      expect(inMemoryResponses.some((r) => r.memberId === 'mem-1')).toBe(true);
      expect(inMemoryCommitments.filter((c) => c.memberId === 'mem-1').length).toBe(2);
    });

    it('Member B (Bob) commits ONLY to Tuesday service', async () => {
      const result = await service.submit('mem-2', ['mtg-tue']);
      expect(result.selectedMeetingIds).toEqual(['mtg-tue']);
      expect(inMemoryCommitments.filter((c) => c.memberId === 'mem-2').length).toBe(1);
    });

    it('Member can update availability selections before deadline', async () => {
      // Bob updates to commit to Sunday instead of Tuesday
      const updated = await service.submit('mem-2', ['mtg-sun']);
      expect(updated.selectedMeetingIds).toEqual(['mtg-sun']);
      const bobsCommitments = inMemoryCommitments.filter((c) => c.memberId === 'mem-2');
      expect(bobsCommitments.length).toBe(1);
      expect(bobsCommitments[0].meetingId).toBe('mtg-sun');
    });

    it('rejects invalid meeting IDs not eligible for the week', async () => {
      await expect(service.submit('mem-1', ['nonexistent-meeting'])).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Authoritative Separation: Availability NEVER Creates Attendance', () => {
    it('verifies in-memory attendance table remains empty after availability submissions', () => {
      // No attendance records were created by submitting availability poll!
      expect(inMemoryAttendance.length).toBe(0);
    });
  });

  describe('4. 4-Way Reconciliation Engine (Available vs Attended)', () => {
    beforeAll(() => {
      // Bob now commits to Tuesday and Sunday again for the full scenario
      inMemoryCommitments = [
        { cycleId: 'cycle-2026-09-14', memberId: 'mem-1', meetingId: 'mtg-tue', status: 'COMMITTED' },
        { cycleId: 'cycle-2026-09-14', memberId: 'mem-1', meetingId: 'mtg-sun', status: 'COMMITTED' },
        { cycleId: 'cycle-2026-09-14', memberId: 'mem-2', meetingId: 'mtg-tue', status: 'COMMITTED' },
      ];

      // Simulate Actual Attendance for Tuesday Bible Study:
      // - Alice (mem-1): Said Available + Attended (PRESENT) -> Category 1
      // - Bob (mem-2): Said Available + Did NOT attend -> Category 2
      // - Charlie (mem-3): Did Not Indicate + Attended (PRESENT) -> Category 3
      // - Diana (mem-4): Did Not Indicate + Did Not Attend -> Category 4
      inMemoryAttendance = [
        { memberId: 'mem-1', meetingId: 'mtg-tue', status: 'ON_TIME', actualArrivalTime: new Date('2026-09-15T17:55:00Z') },
        { memberId: 'mem-3', meetingId: 'mtg-tue', status: 'ON_TIME', actualArrivalTime: new Date('2026-09-15T18:00:00Z') },
      ];
    });

    it('correctly categorizes all members into the 4 authoritative reconciliation groups', async () => {
      const reconciliation = await service.getCycleReconciliation('cycle-2026-09-14');
      expect(reconciliation.services.length).toBe(2);

      const tuesdayReport = reconciliation.services.find((s) => s.meetingId === 'mtg-tue');
      expect(tuesdayReport).toBeDefined();

      // Category 1: Available + Attended (Alice)
      expect(tuesdayReport?.categories.availableAndAttended.length).toBe(1);
      expect(tuesdayReport?.categories.availableAndAttended[0].memberId).toBe('mem-1');

      // Category 2: Available + Absent (Bob)
      expect(tuesdayReport?.categories.availableAndAbsent.length).toBe(1);
      expect(tuesdayReport?.categories.availableAndAbsent[0].memberId).toBe('mem-2');

      // Category 3: Uncommitted + Attended (Charlie)
      expect(tuesdayReport?.categories.uncommittedAndAttended.length).toBe(1);
      expect(tuesdayReport?.categories.uncommittedAndAttended[0].memberId).toBe('mem-3');

      // Category 4: Uncommitted + Absent (Diana)
      expect(tuesdayReport?.categories.uncommittedAndAbsent.length).toBe(1);
      expect(tuesdayReport?.categories.uncommittedAndAbsent[0].memberId).toBe('mem-4');

      // Overview Metrics: Total Expected = 2 (Alice + Bob), Total Attended = 2 (Alice + Charlie)
      expect(tuesdayReport?.totalExpectedAvailable).toBe(2);
      expect(tuesdayReport?.totalActualAttended).toBe(2);
      expect(tuesdayReport?.conversionRate).toBe(50); // 1 attended out of 2 expected (50%)
    });
  });
});
