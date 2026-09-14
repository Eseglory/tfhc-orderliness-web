import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { GoogleCalendarProvider } from '../src/modules/calendar/providers/google-calendar.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../src/common/cache/cache.service';

describe('Calendar Integration & Conflict Detection Suite', () => {
  let service: CalendarService;

  const mockMeetings = [
    {
      id: 'meet-1',
      title: 'Leadership Sync',
      startTime: new Date('2026-09-15T10:00:00Z'),
      endTime: new Date('2026-09-15T11:00:00Z'),
      status: 'SCHEDULED',
      locationName: 'Executive Room',
      eventType: null,
      category: { name: 'Leadership' },
      _count: { invitations: 3 },
    },
  ];

  const mockAppointments = [
    {
      id: 'app-1',
      title: 'Strategic Consultation',
      startTime: new Date('2026-09-15T14:00:00Z'),
      endTime: new Date('2026-09-15T15:00:00Z'),
      status: 'CONFIRMED',
      location: 'Office 101',
      clientName: 'Alice',
      providerName: 'Senior Consultant',
      service: { id: 'srv-1', name: 'Strategy', category: 'ADVISORY' },
    },
  ];

  const mockPrisma = {
    meeting: {
      findMany: jest.fn().mockImplementation((args?: any) => {
        if (!args?.where?.startTime) return mockMeetings;
        const lt = args.where.startTime.lt;
        return mockMeetings.filter((m) => {
          if (lt && m.startTime >= lt) return false;
          return true;
        });
      }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findMany: jest.fn().mockImplementation((args?: any) => {
        if (!args?.where?.startTime) return mockAppointments;
        const lt = args.where.startTime.lt;
        const gt = args.where.endTime?.gt;
        return mockAppointments.filter((a) => {
          if (lt && a.startTime >= lt) return false;
          if (gt && a.endTime <= gt) return false;
          return true;
        });
      }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    externalCalendarEventMapping: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    googleCalendarIntegration: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'integ-1',
        userId: 'user-admin',
        googleEmail: 'admin@organization.com',
        calendarId: 'primary',
        accessToken: 'mock-access-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        syncStatus: 'SYNCED',
        autoSyncMeetings: true,
      }),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_OAUTH_CLIENT_ID') return 'mock-client-id.apps.googleusercontent.com';
      if (key === 'GOOGLE_OAUTH_CLIENT_SECRET') return 'mock-client-secret';
      return null;
    }),
  };

  beforeEach(async () => {
    const mockCache = {
      wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
      invalidateTag: jest.fn(),
      invalidateTags: jest.fn(),
    };

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

  it('should generate Google OAuth URL with proper scopes and state', () => {
    const res = service.getAuthUrl('user-123', 'admin');
    expect(res).toBeDefined();
    expect(res).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res).toContain('access_type=offline');
    expect(res).toContain('calendar');
  });

  it('should detect conflicting meetings on overlapping time windows', async () => {
    mockPrisma.meeting.findMany.mockResolvedValueOnce([mockMeetings[0]]);
    mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

    const conflict = await service.checkConflicts({
      startTime: new Date('2026-09-15T10:30:00Z'),
      endTime: new Date('2026-09-15T11:30:00Z'),
    });

    expect(conflict.hasConflict).toBe(true);
    expect(conflict.conflictingItems).toHaveLength(1);
    expect(conflict.conflictingItems[0].title).toBe('Leadership Sync');
    expect(conflict.conflictingItems[0].domainType).toBe('MEETING');
  });

  it('should return no conflict for non-overlapping time slots', async () => {
    mockPrisma.meeting.findMany.mockResolvedValueOnce([]);
    mockPrisma.appointment.findMany.mockResolvedValueOnce([]);

    const conflict = await service.checkConflicts({
      startTime: new Date('2026-09-15T12:00:00Z'),
      endTime: new Date('2026-09-15T13:00:00Z'),
    });

    expect(conflict.hasConflict).toBe(false);
    expect(conflict.conflictingItems).toHaveLength(0);
  });

  it('should aggregate unified calendar feed with distinct domain types', async () => {
    mockPrisma.meeting.findMany.mockResolvedValueOnce(mockMeetings);
    mockPrisma.appointment.findMany.mockResolvedValueOnce(mockAppointments);
    mockPrisma.externalCalendarEventMapping.findMany.mockResolvedValueOnce([]);

    const feed = await service.getUnifiedFeed('2026-09-15T00:00:00Z', '2026-09-15T23:59:59Z');

    expect(feed).toHaveLength(2);
    expect(feed[0].domainType).toBe('MEETING');
    expect(feed[1].domainType).toBe('APPOINTMENT');
  });
});
