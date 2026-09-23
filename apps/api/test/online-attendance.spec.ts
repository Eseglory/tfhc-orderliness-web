import * as crypto from 'crypto';
import { AttendanceType, AttendanceMethod, AttendanceStatus, MeetingStatus } from '@prisma/client';
import { AttendanceService } from '../src/modules/attendance/attendance.service';

describe('Online Meeting Attendance Suite', () => {
  let service: AttendanceService;

  const mockMember = {
    id: 'member-101',
    status: 'ACTIVE',
    subTeamId: 'team-1',
    roleInUnit: 'Member',
  };

  const mockMeeting: any = {
    id: 'meeting-wed-online',
    title: 'Wednesday Unit Weekly Meeting',
    status: MeetingStatus.ACTIVE,
    isOnline: true,
    locationName: 'Online / Google Meet',
    address: 'https://meet.google.com/ord-tfhc-wed',
    geofenceRadiusMeters: 100000,
    attendanceOpenTime: new Date(Date.now() - 30 * 60000),
    expectedArrivalTime: new Date(Date.now() - 10 * 60000),
    startTime: new Date(Date.now() - 5 * 60000),
    attendanceCloseTime: new Date(Date.now() + 60 * 60000),
    gracePeriodMinutes: 10,
    pointWeight: 1.0,
    visibility: 'PUBLIC',
    audiences: [{ scope: 'ALL_MEMBERS' }],
    category: { pointWeight: 1.0 },
    attendanceCode: '739421',
    attendanceCodeExpiresAt: new Date(Date.now() + 30 * 60000),
  };

  let mockAttendanceRecords: any[] = [];

  const mockPrisma: any = {
    member: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === mockMember.id) return Promise.resolve(mockMember);
        return Promise.resolve(null);
      }),
      count: jest.fn().mockResolvedValue(27),
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
          return Promise.resolve(found ? { ...found } : null);
        }
        if (where.id) {
          const found = mockAttendanceRecords.find((r) => r.id === where.id);
          return Promise.resolve(found ? { ...found } : null);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          mockAttendanceRecords.filter((r) => {
            if (where.meetingId && r.meetingId !== where.meetingId) return false;
            return true;
          }),
        );
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const record = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          member: {
            id: mockMember.id,
            firstName: 'John',
            lastName: 'Doe',
            profilePhotoUrl: null,
            subTeam: { name: 'Orderliness' },
          },
          meeting: {
            id: mockMeeting.id,
            title: mockMeeting.title,
            category: mockMeeting.category,
          },
        };
        mockAttendanceRecords.push(record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const index = mockAttendanceRecords.findIndex((r) => r.id === where.id);
        if (index >= 0) {
          mockAttendanceRecords[index] = { ...mockAttendanceRecords[index], ...data, updatedAt: new Date() };
          return Promise.resolve({ ...mockAttendanceRecords[index] });
        }
        return Promise.resolve(null);
      }),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: mockMeeting.id }]),
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(mockPrisma);
      }
      return cb;
    }),
  };

  const mockCache: any = {
    wrap: jest.fn().mockImplementation((_k, _ttl, fn) => fn()),
    invalidateTags: jest.fn(),
  };

  const mockAudit: any = {
    record: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    mockAttendanceRecords = [];
    jest.clearAllMocks();
    service = new AttendanceService(mockPrisma, mockCache, mockAudit);
  });

  describe('1. Online Meeting Check-In (Primary Mechanism - Option B)', () => {
    it('successfully checks in a member online and generates a secure session token', async () => {
      const res = await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        deviceInfo: 'Mozilla/5.0 Web/Macintosh',
      });

      expect(res.success).toBe(true);
      expect(res.sessionToken).toBeDefined();
      expect(typeof res.sessionToken).toBe('string');
      expect(res.sessionToken.length).toBe(64); // 32 bytes hex = 64 chars
      expect(res.record.attendanceType).toBe(AttendanceType.ONLINE);
      expect(res.record.method).toBe(AttendanceMethod.ONLINE_SESSION);
      expect(res.record.joinedAt).toBeDefined();
      expect(res.record.lastSeenAt).toBeDefined();
      expect(mockAttendanceRecords.length).toBe(1);
    });

    it('rejects check-in if meeting is closed', async () => {
      mockMeeting.status = MeetingStatus.CLOSED;

      await expect(
        service.checkInOnline({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
        }),
      ).rejects.toThrow('Online attendance is not currently open');

      mockMeeting.status = MeetingStatus.ACTIVE;
    });
  });

  describe('2. Attendance Heartbeat & Duration Calculation', () => {
    it('updates lastSeenAt and calculates elapsed duration in minutes', async () => {
      // Check in
      const checkInRes = await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
      });

      // Simulate 15 minutes elapsed
      const record = mockAttendanceRecords[0];
      record.joinedAt = new Date(Date.now() - 15 * 60000);

      // Heartbeat
      const hbRes = await service.heartbeatOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        sessionToken: checkInRes.sessionToken,
      });

      expect(hbRes.success).toBe(true);
      expect(hbRes.durationMinutes).toBeGreaterThanOrEqual(15);
      expect(hbRes.lastSeenAt).toBeDefined();
    });

    it('rejects heartbeat with invalid or forged session token', async () => {
      await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
      });

      await expect(
        service.heartbeatOnline({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          sessionToken: 'forged-invalid-token-1234567890abcdef',
        }),
      ).rejects.toThrow('Invalid or expired attendance session token');
    });
  });

  describe('3. Attendance Checkout & Finalization', () => {
    it('finalizes duration and clears session token hash on check out', async () => {
      const checkInRes = await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
      });

      const record = mockAttendanceRecords[0];
      record.joinedAt = new Date(Date.now() - 25 * 60000);

      const outRes = await service.checkOutOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        sessionToken: checkInRes.sessionToken,
      });

      expect(outRes.success).toBe(true);
      expect(outRes.clockedOut).toBe(true);
      expect(outRes.durationMinutes).toBeGreaterThanOrEqual(25);
      expect(outRes.leftAt).toBeDefined();
      expect(mockAttendanceRecords[0].sessionTokenHash).toBeNull();
    });
  });

  describe('4. Attendance Code Generation & Fallback (Option C)', () => {
    it('generates a 6-digit dynamic attendance code with expiration', async () => {
      const genRes = await service.generateAttendanceCode('admin-1', mockMeeting.id, 45);

      expect(genRes.success).toBe(true);
      expect(genRes.code).toMatch(/^\d{6}$/);
      expect(genRes.expiresAt).toBeDefined();
      expect(mockMeeting.attendanceCode).toBe(genRes.code);
    });

    it('validates correct attendance code and records attendance', async () => {
      mockMeeting.attendanceCode = '654321';
      mockMeeting.attendanceCodeExpiresAt = new Date(Date.now() + 20 * 60000);

      const submitRes = await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '654321',
      });

      expect(submitRes.success).toBe(true);
      expect(submitRes.record.attendanceType).toBe(AttendanceType.ONLINE);
      expect(submitRes.record.method).toBe(AttendanceMethod.ONLINE_CODE);
      expect(mockAttendanceRecords.length).toBe(1);
    });

    it('rejects incorrect attendance code and enforces rate limiting after 5 attempts', async () => {
      mockMeeting.attendanceCode = '888999';
      mockMeeting.attendanceCodeExpiresAt = new Date(Date.now() + 20 * 60000);

      for (let i = 0; i < 5; i++) {
        await expect(
          service.submitAttendanceCode({
            memberId: mockMember.id,
            meetingId: mockMeeting.id,
            code: '000000',
          }),
        ).rejects.toThrow('Invalid attendance code');
      }

      // 6th attempt should be blocked by rate limiter
      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '888999',
        }),
      ).rejects.toThrow('Too many failed attempts');
    });

    it('rejects expired attendance code', async () => {
      mockMeeting.attendanceCode = '112233';
      mockMeeting.attendanceCodeExpiresAt = new Date(Date.now() - 5 * 60000); // Expired

      await expect(
        service.submitAttendanceCode({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          code: '112233',
        }),
      ).rejects.toThrow('This attendance code has expired');
    });
  });

  describe('5. Duplicate Attendance Prevention Invariant', () => {
    it('maintains exactly ONE attendance record if member checks in via session and then enters code', async () => {
      // Step 1: Check in via session
      await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
      });
      expect(mockAttendanceRecords.length).toBe(1);

      // Step 2: Also submit code
      mockMeeting.attendanceCode = '739421';
      mockMeeting.attendanceCodeExpiresAt = new Date(Date.now() + 30 * 60000);

      await service.submitAttendanceCode({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });

      // Invariant: still exactly 1 record for this member & meeting
      expect(mockAttendanceRecords.length).toBe(1);
      expect(mockAttendanceRecords[0].memberId).toBe(mockMember.id);
      expect(mockAttendanceRecords[0].meetingId).toBe(mockMeeting.id);
    });
  });

  describe('6. Admin Live Attendance Session Monitoring', () => {
    it('provides real-time attendance counts and member roster', async () => {
      await service.checkInOnline({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
      });

      const live = await service.getOnlineSessionLive(mockMeeting.id);

      expect(live.meeting.id).toBe(mockMeeting.id);
      expect(live.stats.totalCheckedIn).toBe(1);
      expect(live.stats.activeInSessionCount).toBe(1);
      expect(live.roster.length).toBe(1);
      expect(live.roster[0].memberName).toBe('John Doe');
      expect(live.roster[0].attendanceType).toBe(AttendanceType.ONLINE);
    });
  });
});
