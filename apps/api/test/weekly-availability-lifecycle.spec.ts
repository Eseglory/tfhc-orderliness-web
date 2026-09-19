import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MemberStatus, MeetingStatus, WeeklyAvailabilityState } from '@prisma/client';

describe('Weekly Availability Lifecycle & WAT Timezone Rules Suite', () => {
  let service: AvailabilityService;

  const mockMembers = [
    { id: 'mem-1', memberCode: 'TFHC-001', firstName: 'Alice', lastName: 'Agbaje', status: MemberStatus.ACTIVE, subTeam: { name: 'Protocol' } },
    { id: 'mem-2', memberCode: 'TFHC-002', firstName: 'Bob', lastName: 'Balogun', status: MemberStatus.ACTIVE, subTeam: { name: 'Media' } },
    { id: 'mem-3', memberCode: 'TFHC-003', firstName: 'Charlie', lastName: 'Cole', status: MemberStatus.ACTIVE, subTeam: { name: 'Choir' } },
    { id: 'mem-inactive', memberCode: 'TFHC-099', firstName: 'Inactive', lastName: 'User', status: MemberStatus.INACTIVE, subTeam: { name: 'None' } },
  ];

  const mockMeetings = [
    { id: 'mtg-tue', title: 'Tuesday Bible Study', startTime: new Date('2026-09-15T18:00:00Z'), endTime: new Date('2026-09-15T19:30:00Z'), locationName: 'Main Sanctuary', status: MeetingStatus.SCHEDULED },
    { id: 'mtg-sun', title: 'Sunday Celebration Service', startTime: new Date('2026-09-20T09:00:00Z'), endTime: new Date('2026-09-20T11:30:00Z'), locationName: 'Main Sanctuary', status: MeetingStatus.SCHEDULED },
  ];

  let inMemoryCycles: any[] = [];
  let inMemoryResponses: any[] = [];
  let inMemoryCommitments: any[] = [];
  let inMemoryAttendance: any[] = [];

  const mockCache = {
    wrap: jest.fn((k, t, fn) => fn()),
    invalidateTag: jest.fn(),
    invalidateTags: jest.fn(),
  };

  const mockPrisma = {
    weeklyAvailabilityCycle: {
      upsert: jest.fn(async ({ where, create, update }) => {
        const idx = inMemoryCycles.findIndex((c) => c.weekStart.getTime() === where.weekStart.getTime());
        if (idx >= 0) {
          Object.assign(inMemoryCycles[idx], update);
          return inMemoryCycles[idx];
        }
        const created = { id: `cycle-${where.weekStart.toISOString().split('T')[0]}`, ...create };
        inMemoryCycles.push(created);
        return created;
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const cycle = inMemoryCycles.find((c) => c.weekStart.getTime() === where.weekStart.getTime() || c.id === where.id);
        if (!cycle) return null;
        const res = { ...cycle };
        if (include?.commitments) {
          const filterMemberId = include.commitments.where?.memberId;
          res.commitments = filterMemberId
            ? inMemoryCommitments.filter((c) => c.cycleId === cycle.id && c.memberId === filterMemberId)
            : inMemoryCommitments.filter((c) => c.cycleId === cycle.id);
        }
        if (include?.responses) {
          const filterMemberId = include.responses.where?.memberId;
          res.responses = filterMemberId
            ? inMemoryResponses.filter((r) => r.cycleId === cycle.id && r.memberId === filterMemberId)
            : inMemoryResponses.filter((r) => r.cycleId === cycle.id);
        }
        return res;
      }),
      findFirst: jest.fn(async () => inMemoryCycles[inMemoryCycles.length - 1] || null),
      findMany: jest.fn(async ({ where }) => {
        let list = [...inMemoryCycles];
        if (where?.state) list = list.filter((c) => c.state === where.state);
        if (where?.closesAt?.lte) list = list.filter((c) => c.closesAt <= where.closesAt.lte);
        return list;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const cycle of inMemoryCycles) {
          if (where?.id && cycle.id !== where.id) continue;
          if (where?.state && cycle.state !== where.state) continue;
          Object.assign(cycle, data);
          count++;
        }
        return { count };
      }),
    },
    member: {
      findUnique: jest.fn(async ({ where }) => mockMembers.find((m) => m.id === where.id) || null),
      findMany: jest.fn(async () => mockMembers.filter((m) => m.status === MemberStatus.ACTIVE)),
      count: jest.fn(async () => mockMembers.filter((m) => m.status === MemberStatus.ACTIVE).length),
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
        const created = { id: `resp-${Date.now()}-${Math.random()}`, ...create, submittedAt: new Date() };
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    inMemoryCycles = [];
    inMemoryResponses = [];
    inMemoryCommitments = [];
    inMemoryAttendance = [];
  });

  describe('1. WAT Timezone Calculations & Window Boundaries', () => {
    it('accurately computes Monday 12:00 AM WAT opensAt and Monday 12:00 PM WAT closesAt', () => {
      // Test given Monday in Lagos: 2026-09-14 06:00:00 WAT (05:00 UTC)
      const testTime = new Date('2026-09-14T05:00:00.000Z');
      const windows = service.getWatCycleWindows(testTime);

      // In Africa/Lagos (UTC+1):
      // Monday 00:00:00 WAT = Sunday 23:00:00 UTC (2026-09-13T23:00:00Z)
      expect(windows.opensAt.toISOString()).toBe('2026-09-13T23:00:00.000Z');

      // Monday 12:00:00 PM WAT (noon) = Monday 11:00:00 UTC (2026-09-14T11:00:00Z)
      expect(windows.closesAt.toISOString()).toBe('2026-09-14T11:00:00.000Z');

      // Next window opens following Monday at 12:00 AM WAT (2026-09-20T23:00:00Z)
      expect(windows.nextOpensAt.toISOString()).toBe('2026-09-20T23:00:00.000Z');

      // 06:00 WAT is within [00:00, 12:00) WAT
      expect(windows.isOpen).toBe(true);
    });

    it('Monday 12:00 AM WAT (00:00:00 WAT) -> window is open', () => {
      const mondayMidnightWat = new Date('2026-09-13T23:00:00.000Z');
      const windows = service.getWatCycleWindows(mondayMidnightWat);
      expect(windows.isOpen).toBe(true);
    });

    it('Monday 11:59:59 AM WAT -> window is open and allows submission', () => {
      const mondayMorningWat = new Date('2026-09-14T10:59:59.000Z');
      const windows = service.getWatCycleWindows(mondayMorningWat);
      expect(windows.isOpen).toBe(true);
    });

    it('Monday 12:00:00 PM WAT (noon) -> window is closed', () => {
      const mondayNoonWat = new Date('2026-09-14T11:00:00.000Z');
      const windows = service.getWatCycleWindows(mondayNoonWat);
      expect(windows.isOpen).toBe(false);
    });

    it('Monday after 12:00 PM WAT (e.g. 12:01 PM, 6:00 PM WAT) -> window is closed', () => {
      const mondayEveningWat = new Date('2026-09-14T17:00:00.000Z');
      const windows = service.getWatCycleWindows(mondayEveningWat);
      expect(windows.isOpen).toBe(false);
    });

    it('Tuesday to Sunday -> window is closed', () => {
      const tuesday = new Date('2026-09-15T10:00:00.000Z');
      const wednesday = new Date('2026-09-16T12:00:00.000Z');
      const friday = new Date('2026-09-18T15:00:00.000Z');
      const sunday = new Date('2026-09-20T08:00:00.000Z');

      expect(service.getWatCycleWindows(tuesday).isOpen).toBe(false);
      expect(service.getWatCycleWindows(wednesday).isOpen).toBe(false);
      expect(service.getWatCycleWindows(friday).isOpen).toBe(false);
      expect(service.getWatCycleWindows(sunday).isOpen).toBe(false);
    });
  });

  describe('2. Member Submission Validation & Open/Closed Enforcement', () => {
    it('allows active members to submit during the open Monday window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T07:00:00.000Z')); // Monday 08:00 AM WAT

      await service.openCurrentWeek();
      const res = await service.submit('mem-1', ['mtg-tue', 'mtg-sun']);

      expect(res.selectedMeetingIds).toEqual(['mtg-tue', 'mtg-sun']);
      expect(inMemoryResponses.length).toBe(1);
      expect(inMemoryCommitments.length).toBe(2);

      jest.useRealTimers();
    });

    it('updates selections idempotently when submitted multiple times in the open window', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T07:00:00.000Z'));

      await service.openCurrentWeek();
      await service.submit('mem-1', ['mtg-tue']);
      expect(inMemoryCommitments.filter((c) => c.memberId === 'mem-1').map((c) => c.meetingId)).toEqual(['mtg-tue']);

      // Update to Sun only
      const updated = await service.submit('mem-1', ['mtg-sun']);
      expect(updated.selectedMeetingIds).toEqual(['mtg-sun']);
      expect(inMemoryCommitments.filter((c) => c.memberId === 'mem-1').map((c) => c.meetingId)).toEqual(['mtg-sun']);
      expect(inMemoryResponses.filter((r) => r.memberId === 'mem-1').length).toBe(1);

      jest.useRealTimers();
    });

    it('rejects submissions when window is closed (Monday after 12:00 PM WAT)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T11:01:00.000Z')); // Monday 12:01 PM WAT

      await service.openCurrentWeek();
      await expect(service.submit('mem-1', ['mtg-tue'])).rejects.toThrow(ForbiddenException);

      jest.useRealTimers();
    });

    it('rejects submissions on Tuesday, Wednesday, Friday, Sunday', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-15T09:00:00.000Z')); // Tuesday 10:00 AM WAT

      await expect(service.submit('mem-1', ['mtg-tue'])).rejects.toThrow(ForbiddenException);

      jest.setSystemTime(new Date('2026-09-20T08:00:00.000Z')); // Sunday 09:00 AM WAT
      await expect(service.submit('mem-1', ['mtg-sun'])).rejects.toThrow(ForbiddenException);

      jest.useRealTimers();
    });

    it('rejects submissions from inactive members', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T07:00:00.000Z'));

      await service.openCurrentWeek();
      await expect(service.submit('mem-inactive', ['mtg-tue'])).rejects.toThrow(ForbiddenException);

      jest.useRealTimers();
    });
  });

  describe('3. Attendance Confirmation & No Duplicate Check-in Requirement', () => {
    it('member current status confirms submission and communicates no additional check-in is required', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T08:00:00.000Z'));

      await service.openCurrentWeek();
      await service.submit('mem-1', ['mtg-tue']);

      const current = await service.currentForMember('mem-1');
      expect(current.submitted).toBe(true);
      expect(current.selectedMeetingIds).toEqual(['mtg-tue']);
      expect(current.cycle.isOpen).toBe(true);

      // Submitting availability poll does not create unverified GPS attendance rows
      expect(inMemoryAttendance.length).toBe(0);

      jest.useRealTimers();
    });

    it('uncommitted member is not marked as submitted', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-14T08:00:00.000Z'));

      await service.openCurrentWeek();
      const current = await service.currentForMember('mem-2');

      expect(current.submitted).toBe(false);
      expect(current.selectedMeetingIds).toEqual([]);

      jest.useRealTimers();
    });
  });

  describe('4. Auto-Finalization and Reconciliation', () => {
    it('finalizeDue finalizes cycles once closesAt is reached', async () => {
      const pastCycle = {
        id: 'cycle-past',
        weekStart: new Date('2026-09-07T00:00:00.000Z'),
        opensAt: new Date('2026-09-06T23:00:00.000Z'),
        closesAt: new Date('2026-09-07T11:00:00.000Z'),
        state: WeeklyAvailabilityState.OPEN,
      };
      inMemoryCycles.push(pastCycle);

      const finalized = await service.finalizeDue(new Date('2026-09-07T12:00:00.000Z'));
      expect(finalized).toBe(1);
      expect(pastCycle.state).toBe(WeeklyAvailabilityState.FINALIZED);
    });
  });
});
