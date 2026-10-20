import { AttendanceType, AttendanceMethod, AttendanceStatus, MeetingStatus } from '@tfhc/shared';
import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from '../src/modules/attendance/attendance.service';

describe('Wednesday Meeting Attendance Clock-In Specification Suite', () => {
  let service: AttendanceService;

  const mockMember = {
    id: 'member-wed-101',
    status: 'ACTIVE',
    subTeamId: 'team-wed',
    roleInUnit: 'Member',
    userId: 'user-wed-101',
  };

  // Wednesday Meeting: 8:00 PM to 9:00 PM WAT (19:00:00 UTC to 20:00:00 UTC)
  const wednesdayStartUtc = new Date('2026-10-21T19:00:00.000Z');
  const wednesdayEndUtc = new Date('2026-10-21T20:00:00.000Z');

  let mockMeeting: any;
  let mockAttendanceRecords: any[] = [];

  const mockPrisma: any = {
    member: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === mockMember.id) return Promise.resolve(mockMember);
        return Promise.resolve(null);
      }),
      count: jest.fn().mockResolvedValue(24),
    },
    meeting: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === mockMeeting.id) {
          return Promise.resolve({
            ...mockMeeting,
            attendanceRecords: mockAttendanceRecords.filter((r) => r.meetingId === where.id),
          });
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        Object.assign(mockMeeting, data);
        return Promise.resolve({ ...mockMeeting, ...data });
      }),
    },
    attendanceRecord: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.memberId_meetingId) {
          const found = mockAttendanceRecords.find(
            (r) =>
              r.memberId === where.memberId_meetingId.memberId &&
              r.meetingId === where.memberId_meetingId.meetingId,
          );
          if (found) {
            return Promise.resolve({
              ...found,
              meeting: mockMeeting,
              member: mockMember,
            });
          }
        }
        return Promise.resolve(null);
      }),
      upsert: jest.fn().mockImplementation(({ where, update, create }: any) => {
        const existingIdx = mockAttendanceRecords.findIndex(
          (r) =>
            r.memberId === where.memberId_meetingId.memberId &&
            r.meetingId === where.memberId_meetingId.meetingId,
        );
        if (existingIdx >= 0) {
          const updated = { ...mockAttendanceRecords[existingIdx], ...update };
          mockAttendanceRecords[existingIdx] = updated;
          return Promise.resolve({ ...updated, meeting: mockMeeting, member: mockMember });
        } else {
          const created = { id: `rec-${Date.now()}`, ...create };
          mockAttendanceRecords.push(created);
          return Promise.resolve({ ...created, meeting: mockMeeting, member: mockMember });
        }
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const idx = mockAttendanceRecords.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          mockAttendanceRecords[idx] = { ...mockAttendanceRecords[idx], ...data };
          return Promise.resolve({ ...mockAttendanceRecords[idx], meeting: mockMeeting, member: mockMember });
        }
        return Promise.resolve({ id: where.id, ...data, meeting: mockMeeting, member: mockMember });
      }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const mockCache: any = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
    invalidateTags: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit: any = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAttendanceRecords = [];

    mockMeeting = {
      id: 'meeting-wed-oct21',
      title: 'Wednesday Unit Weekly Meeting',
      serviceScheduleId: 'wednesday-unit-meeting',
      status: MeetingStatus.SCHEDULED,
      startTime: wednesdayStartUtc,
      endTime: wednesdayEndUtc,
      expectedArrivalTime: wednesdayStartUtc,
      attendanceOpenTime: wednesdayStartUtc,
      attendanceCloseTime: wednesdayEndUtc,
      pointWeight: 1,
      gracePeriodMinutes: 10,
      isOnline: true,
      locationName: 'Online / Google Meet',
      address: 'https://meet.google.com/wkx-kgew-iqe',
      geofenceRadiusMeters: 100000,
      visibility: 'PUBLIC',
      audiences: [{ scope: 'ALL_MEMBERS', memberId: null, subTeamId: null }],
      category: { id: 'cat-meeting', name: 'Unit Meeting', pointWeight: 1 },
      attendanceCode: '584920', // Dynamic generated 6-digit code
      attendanceCodeExpiresAt: new Date(wednesdayEndUtc.getTime() + 59999), // Valid through 9:00:59 PM
    };

    service = new AttendanceService(mockPrisma, mockCache, mockAudit);
  });

  describe('1. Attendance Clock-in Window (8:00 PM to 9:00 PM WAT)', () => {
    it('sets generated code expiry to the scheduled end even for a longer requested duration', async () => {
      const result = await service.generateAttendanceCode('admin', mockMeeting.id, 180);
      expect(result.expiresAt).toEqual(wednesdayEndUtc);
    });

    it('corrects legacy extended expiry and reports the code expired at the exact end', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(wednesdayEndUtc);
      try {
        const result = await service.getAttendanceCodeForAdmin('admin', mockMeeting.id);
        expect(result.validFrom).toEqual(wednesdayStartUtc);
        expect(result.validUntil).toEqual(wednesdayEndUtc);
        expect(result.status).toBe('EXPIRED');
        expect(mockMeeting.attendanceCodeExpiresAt).toEqual(wednesdayEndUtc);
      } finally { jest.useRealTimers(); }
    });
    it('rejects clock-in attempt before 8:00 PM (e.g. 7:59 PM WAT)', async () => {
      // 7:59:00 PM WAT = 18:59:00 UTC (1 minute before start)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T18:59:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '584920',
        }),
      ).rejects.toThrow('Attendance Not Yet Available');

      jest.useRealTimers();
    });

    it('successfully accepts clock-in at 8:00 PM sharp (20:00 WAT / 19:00 UTC)', async () => {
      // 8:00:00 PM WAT = 19:00:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:00:00.000Z'));

      const result = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '584920',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('PRESENT');
      expect(result.method).toBe(AttendanceMethod.ONLINE_CODE);
      expect(mockMeeting.status).toBe(MeetingStatus.ACTIVE); // Auto-activated from SCHEDULED

      jest.useRealTimers();
    });

    it('successfully accepts clock-in during mid-meeting at 8:30 PM (20:30 WAT / 19:30 UTC)', async () => {
      // 8:30:00 PM WAT = 19:30:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:30:00.000Z'));

      const result = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '584920',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('PRESENT');
      expect(result.method).toBe(AttendanceMethod.ONLINE_CODE);

      jest.useRealTimers();
    });

    it.each(['2026-10-21T20:00:00.000Z', '2026-10-21T20:00:00.001Z', '2026-10-21T20:00:30.000Z'])('rejects code at or after the exact end: %s', async instant => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(instant));
      try {
        await expect(service.submitAttendanceCode({ memberId: mockMember.id, meetingId: mockMeeting.id, code: '584920' })).rejects.toThrow('Attendance Closed');
      } finally { jest.useRealTimers(); }
    });

    it('rejects code one millisecond before start', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(wednesdayStartUtc.getTime() - 1));
      try {
        await expect(service.submitAttendanceCode({ memberId: mockMember.id, meetingId: mockMeeting.id, code: '584920' })).rejects.toThrow('Attendance Not Yet Available');
      } finally { jest.useRealTimers(); }
    });

    it('rejects clock-in after 9:00 PM window has closed (e.g. 9:02 PM WAT / 20:02 UTC)', async () => {
      // 9:02:00 PM WAT = 20:02:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T20:02:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '584920',
        }),
      ).rejects.toThrow('Attendance Closed');

      jest.useRealTimers();
    });
  });

  describe('2. Dynamic Attendance Code Validation & Security', () => {
    it('accepts the dynamically stored attendance code', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:15:00.000Z'));

      const result = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '584920',
      });

      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();

      jest.useRealTimers();
    });

    it('rejects incorrect codes with Attendance Code Invalid error', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:15:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '111111',
        }),
      ).rejects.toThrow('Attendance Code Invalid');

      jest.useRealTimers();
    });

    it('rejects the old hardcoded code 786974 when it does not match meeting code', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:15:00.000Z'));

      // Meeting has dynamic code '584920', old hardcoded '786974' must be rejected
      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '786974',
        }),
      ).rejects.toThrow('Attendance Code Invalid');

      jest.useRealTimers();
    });
  });

  describe('3. Admin Code Retrieval & Status Display', () => {
    it('retrieves active code for admin and sets expiration through meeting end', async () => {
      mockMeeting.attendanceCodeExpiresAt = null; // Simulating uninitialized expiration

      const adminData = await service.getAttendanceCodeForAdmin('admin-user-1', mockMeeting.id);

      expect(adminData.attendanceCode).toBe('584920');
      expect(adminData.validFrom).toEqual(wednesdayStartUtc);
      expect(adminData.validUntil.getTime()).toBeGreaterThanOrEqual(wednesdayEndUtc.getTime());
      expect(mockMeeting.attendanceCodeExpiresAt).not.toBeNull();
    });

    it('returns status ACTIVE when queried during meeting hours (8:15 PM WAT)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:15:00.000Z'));

      const adminData = await service.getAttendanceCodeForAdmin('admin-user-1', mockMeeting.id);
      expect(adminData.status).toBe('ACTIVE');

      jest.useRealTimers();
    });

    it('returns status NOT_ACTIVE before meeting start time', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T18:30:00.000Z'));

      const adminData = await service.getAttendanceCodeForAdmin('admin-user-1', mockMeeting.id);
      expect(adminData.status).toBe('NOT_ACTIVE');
      expect(adminData.startsInMinutes).toBe(30);

      jest.useRealTimers();
    });
  });

  describe('4. Idempotency & Attendance Confirmation', () => {
    it('returns alreadyRecorded: true if member submits attendance code again', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-21T19:05:00.000Z'));

      // First submission
      const first = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '584920',
      });
      expect(first.success).toBe(true);
      expect(first.alreadyRecorded).toBe(false);

      // Second submission
      const second = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '584920',
      });
      expect(second.success).toBe(true);
      expect(second.alreadyRecorded).toBe(true);
      expect(second.message).toContain('already marked PRESENT');

      jest.useRealTimers();
    });
  });
});
