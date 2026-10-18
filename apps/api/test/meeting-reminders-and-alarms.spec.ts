import { Test, TestingModule } from '@nestjs/testing';
import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AbsenceProcessingJob } from '../src/jobs/absence-processing.job';
import { AuditService } from '../src/common/rbac/audit.service';
import { CacheService } from '../src/common/cache/cache.service';
import { MeetingStatus } from '@tfhc/shared';

describe('Meeting Reminders & Device Alarm Specification', () => {
  let meetingsService: MeetingsService;

  const mockMeetings: any[] = [];
  const mockMembers: any[] = [];
  const mockAttendance: any[] = [];
  const mockSystemSettings: Map<string, string> = new Map();

  const mockPrisma = {
    meeting: {
      findMany: jest.fn().mockImplementation((args) => {
        const statuses = args?.where?.status?.in || [];
        return mockMeetings.filter((m) => statuses.includes(m.status));
      }),
      findUnique: jest.fn().mockImplementation((args) => {
        return mockMeetings.find((m) => m.id === args?.where?.id) || null;
      }),
    },
    member: {
      findUnique: jest.fn().mockImplementation((args) => {
        if (args?.where?.userId) {
          return mockMembers.find((m) => m.userId === args.where.userId) || null;
        }
        return mockMembers.find((m) => m.id === args?.where?.id) || null;
      }),
    },
    attendanceRecord: {
      findFirst: jest.fn().mockImplementation((args) => {
        return mockAttendance.find(
          (a) => a.meetingId === args?.where?.meetingId && a.memberId === args?.where?.memberId
        ) || null;
      }),
    },
    systemSetting: {
      findUnique: jest.fn().mockImplementation((args) => {
        const val = mockSystemSettings.get(args?.where?.key);
        return val ? { key: args.where.key, value: val } : null;
      }),
      upsert: jest.fn().mockImplementation((args) => {
        mockSystemSettings.set(args.where.key, args.create.value);
        return { key: args.where.key, value: args.create.value };
      }),
    },
  };

  const mockAbsenceProcessing = {};
  const mockAudit = { log: jest.fn() };
  const mockCache = { invalidateTags: jest.fn(), get: jest.fn(), set: jest.fn() };

  beforeEach(async () => {
    mockMeetings.length = 0;
    mockMembers.length = 0;
    mockAttendance.length = 0;
    mockSystemSettings.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AbsenceProcessingJob, useValue: mockAbsenceProcessing },
        { provide: AuditService, useValue: mockAudit },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    meetingsService = module.get<MeetingsService>(MeetingsService);
  });

  describe('1. Member Upcoming Reminders & Alarm Eligibility', () => {
    it('returns upcoming eligible meetings within 48h window', async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() + 2 * 3600000);
      const closeTime = new Date(startTime.getTime() + 3600000);

      mockMembers.push({
        id: 'member-1',
        userId: 'user-1',
        subTeamId: 'general',
        roleInUnit: 'Member',
        status: 'ACTIVE',
      });

      mockMeetings.push({
        id: 'mtg-wednesday',
        title: 'Wednesday Unit Weekly Meeting',
        description: 'Midweek interactive prayer and fellowship',
        startTime,
        endTime: closeTime,
        expectedArrivalTime: startTime,
        attendanceOpenTime: startTime,
        attendanceCloseTime: closeTime,
        locationName: 'Google Meet',
        isOnline: true,
        meetingUrl: 'https://meet.google.com/xyz',
        address: 'https://meet.google.com/xyz',
        status: MeetingStatus.SCHEDULED,
        visibility: 'PUBLIC',
        audiences: [{ scope: 'ALL_MEMBERS' }],
      });

      const reminders = await meetingsService.getMemberUpcomingReminders('user-1', 'member-1');
      expect(reminders).toHaveLength(1);
      expect(reminders[0].id).toBe('mtg-wednesday');
      expect(reminders[0].title).toBe('Wednesday Unit Weekly Meeting');
      expect(reminders[0].isOnline).toBe(true);
      expect(reminders[0].meetingUrl).toBe('https://meet.google.com/xyz');
    });

    it('ignores cancelled meetings so no alarms ring for cancelled events', async () => {
      const now = new Date();
      mockMembers.push({
        id: 'member-1',
        userId: 'user-1',
        subTeamId: 'general',
        roleInUnit: 'Member',
        status: 'ACTIVE',
      });

      mockMeetings.push({
        id: 'mtg-cancelled',
        title: 'Cancelled Special Gathering',
        startTime: new Date(now.getTime() + 3600000),
        expectedArrivalTime: new Date(now.getTime() + 3600000),
        attendanceOpenTime: new Date(now.getTime() + 3600000),
        attendanceCloseTime: new Date(now.getTime() + 7200000),
        locationName: 'Main Sanctuary',
        status: MeetingStatus.CANCELLED,
        visibility: 'PUBLIC',
        audiences: [{ scope: 'ALL_MEMBERS' }],
      });

      const reminders = await meetingsService.getMemberUpcomingReminders('user-1', 'member-1');
      expect(reminders).toHaveLength(0);
    });

    it('ignores meetings where the member has already checked in or attended', async () => {
      const now = new Date();
      mockMembers.push({
        id: 'member-1',
        userId: 'user-1',
        subTeamId: 'general',
        roleInUnit: 'Member',
        status: 'ACTIVE',
      });

      mockMeetings.push({
        id: 'mtg-sunday',
        title: 'Sunday Service',
        startTime: new Date(now.getTime() + 1800000),
        expectedArrivalTime: new Date(now.getTime() + 1800000),
        attendanceOpenTime: new Date(now.getTime() + 1800000),
        attendanceCloseTime: new Date(now.getTime() + 5400000),
        locationName: 'Main Sanctuary',
        status: MeetingStatus.ACTIVE,
        visibility: 'PUBLIC',
        audiences: [{ scope: 'ALL_MEMBERS' }],
      });

      // Member already clocked in on time
      mockAttendance.push({
        id: 'att-1',
        meetingId: 'mtg-sunday',
        memberId: 'member-1',
        status: 'ON_TIME',
      });

      const reminders = await meetingsService.getMemberUpcomingReminders('user-1', 'member-1');
      expect(reminders).toHaveLength(0);
    });
  });

  describe('2. Persistent Reminder & Alarm Preferences', () => {
    it('returns sensible defaults when no preferences have been configured yet', async () => {
      const prefs = await meetingsService.getMemberReminderPreferences('user-fresh');
      expect(prefs).toEqual({
        remindersEnabled: true,
        alarmSoundEnabled: true,
        soundName: 'chime',
        snoozeMinutes: 5,
      });
    });

    it('persists and retrieves customized alarm sound and snooze interval', async () => {
      const updated = await meetingsService.saveMemberReminderPreferences('user-1', {
        remindersEnabled: true,
        alarmSoundEnabled: true,
        soundName: 'marimba',
        snoozeMinutes: 10,
      });

      expect(updated.soundName).toBe('marimba');
      expect(updated.snoozeMinutes).toBe(10);

      const retrieved = await meetingsService.getMemberReminderPreferences('user-1');
      expect(retrieved.soundName).toBe('marimba');
      expect(retrieved.snoozeMinutes).toBe(10);
    });

    it('safeguards against invalid sound names and invalid snooze intervals', async () => {
      const updated = await meetingsService.saveMemberReminderPreferences('user-1', {
        soundName: 'invalid-sound-hack',
        snoozeMinutes: 999, // not an allowed interval
      });

      // Falls back to safe default values
      expect(updated.soundName).toBe('chime');
      expect(updated.snoozeMinutes).toBe(5);
    });

    it('allows toggling alarm sound independently of visual notifications', async () => {
      const silentAlarm = await meetingsService.saveMemberReminderPreferences('user-1', {
        remindersEnabled: true,
        alarmSoundEnabled: false, // Visual reminder only, muted alarm
      });

      expect(silentAlarm.remindersEnabled).toBe(true);
      expect(silentAlarm.alarmSoundEnabled).toBe(false);
    });
  });
});
