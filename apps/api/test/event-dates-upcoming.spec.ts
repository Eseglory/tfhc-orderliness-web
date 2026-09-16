import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { GoogleCalendarProvider } from '../src/modules/calendar/providers/google-calendar.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../src/common/cache/cache.service';
import { occurrences, SERVICE_SCHEDULES } from '../src/modules/recurring-services/service-schedules';

describe('Event & Service Dates, Timezone and Upcoming Chronological Suite', () => {
  let calendarService: CalendarService;

  // Assume current time is Tuesday, September 15, 2026 at 16:30:00 Lagos time (+01:00) -> 15:30:00 UTC
  const mockNow = new Date('2026-09-15T15:30:00.000Z');

  const mockPrisma = {
    meeting: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    member: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'TFHC_TIMEZONE') return 'Africa/Lagos';
      return null;
    }),
  };

  const mockCache = {
    wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
    invalidateTags: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        GoogleCalendarProvider,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    calendarService = module.get<CalendarService>(CalendarService);
  });

  describe('Recurring service occurrence generation for today and this week', () => {
    it('generates today (Sep 15 Tuesday) Mid-Week Service at correct UTC time (17:45 UTC = 18:45 Lagos)', () => {
      const tuesdaySchedule = SERVICE_SCHEDULES.find((s) => s.id === 'tuesday-midweek')!;
      const occs = occurrences(tuesdaySchedule, mockNow);

      expect(occs.length).toBeGreaterThanOrEqual(1);
      // First occurrence should be today, Sep 15
      expect(occs[0].startTime.toISOString()).toBe('2026-09-15T17:45:00.000Z');
      expect(occs[0].endTime?.toISOString()).toBe('2026-09-15T19:15:00.000Z');
    });

    it('generates this Thursday (Sep 17) Divine Intervention Service', () => {
      const thursdaySchedule = SERVICE_SCHEDULES.find((s) => s.id === 'thursday-divine')!;
      const occs = occurrences(thursdaySchedule, mockNow);

      expect(occs.length).toBeGreaterThanOrEqual(1);
      expect(occs[0].startTime.toISOString()).toBe('2026-09-17T07:00:00.000Z');
    });

    it('generates Sunday (Sep 20) First, Second, and Third services', () => {
      const sundayFirst = SERVICE_SCHEDULES.find((s) => s.id === 'sunday-first')!;
      const occs = occurrences(sundayFirst, mockNow);

      expect(occs.length).toBeGreaterThanOrEqual(1);
      expect(occs[0].startTime.toISOString()).toBe('2026-09-20T06:00:00.000Z');
    });
  });

  describe('Chronological ordering and filtering in getTodayUpcoming', () => {
    it('orders today items and future upcoming items in strictly ascending order', async () => {
      const serviceToday = {
        id: 'service-sep-15',
        title: 'Mid-Week Service',
        startTime: new Date('2026-09-15T17:45:00.000Z'),
        endTime: new Date('2026-09-15T19:15:00.000Z'),
        status: 'SCHEDULED',
        locationName: 'Main Sanctuary',
        eventType: { key: 'SERVICE', name: 'Service', color: '#10b981' },
        category: { name: 'Midweek Service' },
        _count: { invitations: 10, attendanceRecords: 0 },
      };

      const serviceThursday = {
        id: 'service-sep-17',
        title: 'Divine Intervention Service',
        startTime: new Date('2026-09-17T07:00:00.000Z'),
        endTime: new Date('2026-09-17T09:00:00.000Z'),
        status: 'SCHEDULED',
        locationName: 'Main Sanctuary',
        eventType: { key: 'SERVICE', name: 'Service', color: '#10b981' },
        category: { name: 'Midweek Service' },
        _count: { invitations: 10, attendanceRecords: 0 },
      };

      const eventFriday = {
        id: 'event-sep-18',
        title: 'Youth Prayer Summit',
        startTime: new Date('2026-09-18T18:00:00.000Z'),
        endTime: new Date('2026-09-18T20:00:00.000Z'),
        status: 'SCHEDULED',
        locationName: 'Youth Hall',
        eventType: { key: 'SPECIAL_SERVICE', name: 'Special Event', color: '#6366f1' },
        category: { name: 'Special Programme' },
        _count: { invitations: 30, attendanceRecords: 0 },
      };

      const serviceSunday = {
        id: 'service-sep-20',
        title: 'First Service',
        startTime: new Date('2026-09-20T06:00:00.000Z'),
        endTime: new Date('2026-09-20T07:00:00.000Z'),
        status: 'SCHEDULED',
        locationName: 'Main Sanctuary',
        eventType: { key: 'SERVICE', name: 'Service', color: '#10b981' },
        category: { name: 'Sunday Service' },
        _count: { invitations: 50, attendanceRecords: 0 },
      };

      const eventOctober = {
        id: 'event-oct-01',
        title: 'Independence Thanksgiving Service',
        startTime: new Date('2026-10-01T08:00:00.000Z'),
        endTime: new Date('2026-10-01T11:00:00.000Z'),
        status: 'SCHEDULED',
        locationName: 'Main Sanctuary',
        eventType: { key: 'SPECIAL_SERVICE', name: 'Special Service', color: '#6366f1' },
        category: { name: 'Special Programme' },
        _count: { invitations: 200, attendanceRecords: 0 },
      };

      mockPrisma.meeting.findMany
        .mockResolvedValueOnce([serviceToday]) // today's query
        .mockResolvedValueOnce([serviceThursday, eventFriday, serviceSunday, eventOctober]); // upcoming query

      mockPrisma.meeting.findFirst.mockResolvedValueOnce(null);

      const res = await calendarService.getTodayUpcoming();

      expect(res.today).toHaveLength(1);
      expect(res.today[0].id).toBe('service-sep-15');
      expect(res.today[0].title).toBe('Mid-Week Service');

      expect(res.upcoming).toHaveLength(4);
      expect(res.upcoming[0].id).toBe('service-sep-17');
      expect(res.upcoming[1].id).toBe('event-sep-18');
      expect(res.upcoming[2].id).toBe('service-sep-20');
      expect(res.upcoming[3].id).toBe('event-oct-01');

      // October event must only appear AFTER all September events
      const times = res.upcoming.map((u) => new Date(u.startTime).getTime());
      for (let i = 0; i < times.length - 1; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i + 1]);
      }
    });

    it('does not select a future meeting as the active meeting for today', async () => {
      // If a future meeting on Sep 20 somehow has status ACTIVE, findFirst query filters it out
      mockPrisma.meeting.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.meeting.findFirst.mockResolvedValueOnce(null);

      const res = await calendarService.getTodayUpcoming();
      expect(res.activeMeeting).toBeNull();
    });
  });
});
