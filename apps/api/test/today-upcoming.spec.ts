import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { GoogleCalendarProvider } from '../src/modules/calendar/providers/google-calendar.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../src/common/cache/cache.service';

describe('Today & Upcoming Classification & Ordering Suite', () => {
  let service: CalendarService;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Past meeting (2 days ago)
  const pastMeeting = {
    id: 'meet-past',
    title: 'Past Governance Meeting',
    startTime: new Date(now.getTime() - 2 * 86400000),
    endTime: new Date(now.getTime() - 2 * 86400000 + 3600000),
    status: 'CLOSED',
    locationName: 'Executive Room',
    eventType: null,
    category: { name: 'Leadership' },
    _count: { invitations: 3, attendanceRecords: 3 },
  };

  // Today meeting (today noon)
  const todayMeeting = {
    id: 'meet-today',
    title: 'Today Operations Checkpoint',
    startTime: new Date(`${todayStr}T12:00:00Z`),
    endTime: new Date(`${todayStr}T13:00:00Z`),
    status: 'SCHEDULED',
    locationName: 'Main Sanctuary',
    eventType: null,
    category: { name: 'Operations' },
    _count: { invitations: 5, attendanceRecords: 0 },
  };

  // Tomorrow meeting (1 day in future)
  const tomorrowMeeting = {
    id: 'meet-tomorrow',
    title: 'Tomorrow Leadership Sync',
    startTime: new Date(now.getTime() + 1 * 86400000 + 3600000),
    endTime: new Date(now.getTime() + 1 * 86400000 + 7200000),
    status: 'SCHEDULED',
    locationName: 'Auditorium B',
    eventType: null,
    category: { name: 'Leadership' },
    _count: { invitations: 10, attendanceRecords: 0 },
  };

  // Next week meeting (5 days in future)
  const nextWeekMeeting = {
    id: 'meet-next-week',
    title: 'Next Week General Assembly',
    startTime: new Date(now.getTime() + 5 * 86400000),
    endTime: new Date(now.getTime() + 5 * 86400000 + 3600000),
    status: 'SCHEDULED',
    locationName: 'Main Auditorium',
    eventType: { key: 'EVENT', name: 'Special Event', color: '#6366f1' },
    category: { name: 'Gathering' },
    _count: { invitations: 50, attendanceRecords: 0 },
  };

  // Next month meeting (30 days in future)
  const nextMonthMeeting = {
    id: 'meet-next-month',
    title: 'Next Month Strategic Conference',
    startTime: new Date(now.getTime() + 30 * 86400000),
    endTime: new Date(now.getTime() + 30 * 86400000 + 3600000),
    status: 'SCHEDULED',
    locationName: 'Convention Center',
    eventType: { key: 'EVENT', name: 'Conference', color: '#6366f1' },
    category: { name: 'Conference' },
    _count: { invitations: 100, attendanceRecords: 0 },
  };

  const mockPrisma = {
    meeting: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
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

    service = module.get<CalendarService>(CalendarService);
  });

  it('should separate Today and Upcoming activities with chronological ascending order for Upcoming', async () => {
    // Today query returns todayMeeting
    mockPrisma.meeting.findMany
      .mockResolvedValueOnce([todayMeeting]) // todayMeetings
      .mockResolvedValueOnce([tomorrowMeeting, nextWeekMeeting, nextMonthMeeting]); // upcomingMeetings (ASC order)

    mockPrisma.meeting.findFirst.mockResolvedValueOnce(null); // activeMeeting

    const result = await service.getTodayUpcoming();

    expect(result).toBeDefined();
    expect(result.timezone).toBe('Africa/Lagos');
    expect(result.today).toHaveLength(1);
    expect(result.today[0].id).toBe('meet-today');

    expect(result.upcoming).toHaveLength(3);
    // Chronological ASC: tomorrow -> next week -> next month
    expect(result.upcoming[0].id).toBe('meet-tomorrow');
    expect(result.upcoming[1].id).toBe('meet-next-week');
    expect(result.upcoming[2].id).toBe('meet-next-month');

    // Ensure past meeting is NOT in upcoming
    const idsInUpcoming = result.upcoming.map((item) => item.id);
    expect(idsInUpcoming).not.toContain('meet-past');
    expect(idsInUpcoming).not.toContain('meet-today');
  });

  it('should return empty Today list when no meetings exist today', async () => {
    mockPrisma.meeting.findMany
      .mockResolvedValueOnce([]) // todayMeetings empty
      .mockResolvedValueOnce([tomorrowMeeting, nextWeekMeeting]); // upcomingMeetings

    mockPrisma.meeting.findFirst.mockResolvedValueOnce(null);

    const result = await service.getTodayUpcoming();

    expect(result.today).toHaveLength(0);
    expect(result.upcoming).toHaveLength(2);
    expect(result.upcoming[0].id).toBe('meet-tomorrow');
  });
});
