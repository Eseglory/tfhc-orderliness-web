import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from '../src/modules/scoring/scoring.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { MemberStatus } from '@tfhc/shared';

describe('Advanced Attendance Analytics & Leaderboard Suite', () => {
  let scoringService: ScoringService;

  const mockMembers = [
    {
      id: 'mem-1',
      memberCode: 'TFHC-001',
      firstName: 'Glory',
      lastName: 'Eseosa',
      status: MemberStatus.ACTIVE,
      subTeamId: 'team-media',
      subTeam: { name: 'Media & IT' },
    },
    {
      id: 'mem-2',
      memberCode: 'TFHC-002',
      firstName: 'Jane',
      lastName: 'Doe',
      status: MemberStatus.ACTIVE,
      subTeamId: 'team-protocol',
      subTeam: { name: 'Protocol' },
    },
    {
      id: 'mem-3',
      memberCode: 'TFHC-003',
      firstName: 'John',
      lastName: 'Smith',
      status: MemberStatus.ACTIVE,
      subTeamId: 'team-media',
      subTeam: { name: 'Media & IT' },
    },
  ];

  const mockMeetings = [
    {
      id: 'mtg-1',
      title: 'Sunday Celebration Service',
      startTime: new Date('2026-09-06T09:00:00Z'),
      status: 'CLOSED',
      categoryId: 'cat-sunday',
      category: { id: 'cat-sunday', name: 'Sunday Service' },
      eventTypeKey: 'SERVICE',
      attendanceRecords: [
        { id: 'rec-1', memberId: 'mem-1', status: 'ON_TIME', pointsEarned: 10, member: mockMembers[0] },
        { id: 'rec-2', memberId: 'mem-2', status: 'ON_TIME', pointsEarned: 10, member: mockMembers[1] },
        { id: 'rec-3', memberId: 'mem-3', status: 'LATE', pointsEarned: 5, member: mockMembers[2] },
      ],
    },
    {
      id: 'mtg-2',
      title: 'Midweek Communion Service',
      startTime: new Date('2026-09-09T18:00:00Z'),
      status: 'CLOSED',
      categoryId: 'cat-midweek',
      category: { id: 'cat-midweek', name: 'Midweek Service' },
      eventTypeKey: 'SERVICE',
      attendanceRecords: [
        { id: 'rec-4', memberId: 'mem-1', status: 'ON_TIME', pointsEarned: 10, member: mockMembers[0] },
        { id: 'rec-5', memberId: 'mem-2', status: 'EARLY', pointsEarned: 12, member: mockMembers[1] },
        { id: 'rec-6', memberId: 'mem-3', status: 'ABSENT', pointsEarned: 0, member: mockMembers[2] },
      ],
    },
    {
      id: 'mtg-3',
      title: 'Annual Leadership Conference',
      startTime: new Date('2026-09-10T10:00:00Z'),
      status: 'CLOSED',
      categoryId: 'cat-conf',
      category: { id: 'cat-conf', name: 'Special Programme' },
      eventTypeKey: 'SPECIAL_SERVICE',
      attendanceRecords: [
        { id: 'rec-7', memberId: 'mem-1', status: 'ON_TIME', pointsEarned: 15, member: mockMembers[0] },
        { id: 'rec-8', memberId: 'mem-2', status: 'ABSENT', pointsEarned: 0, member: mockMembers[1] },
      ],
    },
  ];

  const mockPrisma = {
    member: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where?.subTeamId) {
          return Promise.resolve(mockMembers.filter((m) => m.subTeamId === where.subTeamId));
        }
        return Promise.resolve(mockMembers);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockMembers.find((m) => m.id === where.id) || null);
      }),
    },
    meeting: {
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(mockMeetings);
      }),
    },
    attendanceRecord: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        const list = mockMeetings.flatMap((m) => m.attendanceRecords.map((r) => ({ ...r, meeting: m })));
        if (where?.memberId) {
          return Promise.resolve(list.filter((r) => r.memberId === where.memberId));
        }
        return Promise.resolve(list);
      }),
    },
    subTeam: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'team-media', name: 'Media & IT' },
        { id: 'team-protocol', name: 'Protocol' },
      ]),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockImplementation(() => {
      // Mock raw aggregation return for members
      return Promise.resolve([
        {
          memberId: 'mem-1',
          expectedCount: 3,
          attendedCount: 3,
          onTimeCount: 3,
          totalPoints: 35.0,
          currentAttendanceStreak: 3,
          currentOnTimeStreak: 3,
        },
        {
          memberId: 'mem-2',
          expectedCount: 3,
          attendedCount: 2,
          onTimeCount: 2,
          totalPoints: 22.0,
          currentAttendanceStreak: 0,
          currentOnTimeStreak: 0,
        },
        {
          memberId: 'mem-3',
          expectedCount: 2,
          attendedCount: 1,
          onTimeCount: 0,
          totalPoints: 5.0,
          currentAttendanceStreak: 0,
          currentOnTimeStreak: 0,
        },
      ]);
    }),
  };

  beforeAll(async () => {
    const mockCache = {
      wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
      invalidateTag: jest.fn(),
      invalidateTags: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    scoringService = module.get<ScoringService>(ScoringService);
  });

  describe('1. Leaderboard Ranking & Deterministic Tie-Breaking', () => {
    it('should calculate leaderboard ranking with 1st, 2nd, 3rd medals', async () => {
      const leaderboard = await scoringService.getLeaderboard();

      expect(leaderboard.length).toBe(3);

      // Rank 1: Glory Eseosa (100% attendance, perfect streak)
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].medal).toBe('🥇 1st');
      expect(leaderboard[0].memberId).toBe('mem-1');
      expect(leaderboard[0].attendanceRate).toBe(100);
      expect(leaderboard[0].isPerfectAttendance).toBe(true);

      // Rank 2: Jane Doe (66.7% attendance)
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].medal).toBe('🥈 2nd');
      expect(leaderboard[1].memberId).toBe('mem-2');

      // Rank 3: John Smith (50% attendance)
      expect(leaderboard[2].rank).toBe(3);
      expect(leaderboard[2].medal).toBe('🥉 3rd');
      expect(leaderboard[2].memberId).toBe('mem-3');
    });

    it('should filter leaderboard by status (Perfect Attendance only)', async () => {
      const perfectList = await scoringService.getLeaderboard({ statusFilter: 'PERFECT' });
      expect(perfectList.length).toBe(1);
      expect(perfectList[0].memberId).toBe('mem-1');
      expect(perfectList[0].isPerfectAttendance).toBe(true);
    });

    it('should filter leaderboard by sub-team', async () => {
      const mediaList = await scoringService.getLeaderboard({ subTeamId: 'team-media' });
      expect(mediaList.length).toBe(2);
      expect(mediaList.every((m) => m.subTeamName === 'Media & IT')).toBe(true);
    });
  });

  describe('2. Comprehensive Attendance Analytics Engine', () => {
    it('should generate reconciled overview metrics, trend, and service breakdown', async () => {
      const analytics = await scoringService.getAdvancedAttendanceAnalytics({
        days: 30,
      });

      expect(analytics.overview).toBeDefined();
      expect(analytics.overview.totalAttendance).toBe(6);
      expect(analytics.overview.uniqueMembers).toBe(3);
      expect(analytics.overview.totalSessions).toBe(3);
      expect(analytics.overview.averageAttendance).toBe(2); // 6 attendances / 3 sessions

      // Trend data points
      expect(analytics.trend.length).toBe(3);

      // Activity breakdown
      expect(analytics.activityBreakdown.services).toBe(5);
      expect(analytics.activityBreakdown.events).toBe(1);

      // Service breakdown
      expect(analytics.serviceBreakdown.length).toBe(3);
      const sundayService = analytics.serviceBreakdown.find((s) => s.name === 'Sunday Celebration Service');
      expect(sundayService).toBeDefined();
      expect(sundayService?.totalAttendance).toBe(3);
      expect(sundayService?.highestAttendance).toBe(3);

      // Perfect attendance list
      expect(analytics.perfectAttendanceList.length).toBe(1);
      expect(analytics.perfectAttendanceList[0].memberId).toBe('mem-1');
    });
  });

  describe('3. Member Performance Profile', () => {
    it('should compute granular performance details for a member', async () => {
      const perf = await scoringService.getMemberPerformance('mem-1');

      expect(perf.member.id).toBe('mem-1');
      expect(perf.attendedCount).toBe(3);
      expect(perf.expectedCount).toBe(3);
      expect(perf.attendanceRate).toBe(100);
      expect(perf.isPerfectAttendance).toBe(true);
      expect(perf.missedSessions).toBe(0);
      expect(perf.servicesAttended).toBe(2);
      expect(perf.eventsAttended).toBe(1);
    });
  });
});
