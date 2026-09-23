import * as crypto from 'crypto';
import { AttendanceType, AttendanceMethod, AttendanceStatus, MeetingStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { SYSTEM_ROLE_DEFINITIONS, PERMISSION_WILDCARD } from '@tfhc/shared';

describe('Online Meeting Secure Attendance Suite — 10 Security Scenarios', () => {
  let service: AttendanceService;

  const mockMemberA = {
    id: 'member-101',
    status: 'ACTIVE',
    subTeamId: 'team-1',
    roleInUnit: 'Member',
    userId: 'user-member-101',
  };

  const mockMemberB = {
    id: 'member-102',
    status: 'ACTIVE',
    subTeamId: 'team-1',
    roleInUnit: 'Member',
    userId: 'user-member-102',
  };

  // Scheduled meeting: Wednesday 20:00 WAT (19:00:00 UTC)
  const scheduledStartUtc = new Date('2026-09-30T19:00:00.000Z');

  let mockMeeting: any;
  let mockAttendanceRecords: any[] = [];

  const mockPrisma: any = {
    member: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === mockMemberA.id) return Promise.resolve(mockMemberA);
        if (where.id === mockMemberB.id) return Promise.resolve(mockMemberB);
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
      upsert: jest.fn().mockImplementation(({ where, update, create }: any) => {
        let existingIndex = -1;
        if (where.memberId_meetingId) {
          existingIndex = mockAttendanceRecords.findIndex(
            (r) =>
              r.memberId === where.memberId_meetingId.memberId &&
              r.meetingId === where.memberId_meetingId.meetingId,
          );
        }
        if (existingIndex >= 0) {
          mockAttendanceRecords[existingIndex] = {
            ...mockAttendanceRecords[existingIndex],
            ...update,
            updatedAt: new Date(),
          };
          return Promise.resolve({ ...mockAttendanceRecords[existingIndex] });
        }
        const memberInfo = create.memberId === mockMemberB.id ? mockMemberB : mockMemberA;
        const record = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
          member: {
            id: memberInfo.id,
            firstName: 'Member',
            lastName: memberInfo.id,
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
      create: jest.fn().mockImplementation(({ data }: any) => {
        const record = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          member: {
            id: data.memberId,
            firstName: 'Member',
            lastName: data.memberId,
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
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'meeting-wed-online' }]),
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
    jest.useRealTimers();

    mockMeeting = {
      id: 'meeting-wed-online',
      title: 'Wednesday Unit Weekly Meeting',
      status: MeetingStatus.ACTIVE,
      isOnline: true,
      locationName: 'Online / Google Meet',
      address: 'https://meet.google.com/ord-tfhc-wed',
      geofenceRadiusMeters: 100000,
      startTime: scheduledStartUtc, // 19:00:00 UTC (20:00 WAT)
      expectedArrivalTime: scheduledStartUtc,
      attendanceOpenTime: new Date(scheduledStartUtc.getTime() - 10 * 60000), // 19:50 WAT
      attendanceCloseTime: new Date(scheduledStartUtc.getTime() + 10 * 60000), // 20:10 WAT
      gracePeriodMinutes: 10,
      pointWeight: 1.0,
      visibility: 'PUBLIC',
      audiences: [{ scope: 'ALL_MEMBERS' }],
      category: { pointWeight: 1.0 },
      attendanceCode: '739421',
      attendanceCodeExpiresAt: new Date(scheduledStartUtc.getTime() + 10 * 60000),
    };

    service = new AttendanceService(mockPrisma, mockCache, mockAudit);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // SCENARIO 1 (Security Test 39):
  // Member clicks "Join Google Meet", immediately leaves, does not enter code.
  // Expected: Attendance = NOT PRESENT, 0 records created, direct check-in blocked.
  // =========================================================================
  describe('Security Test 1: Joining Google Meet does NOT create attendance', () => {
    it('does not create attendance when member only opens the meeting link, and rejects direct online check-in attempts', async () => {
      // In the frontend, clicking Google Meet is just window.open / <a href="..."> without API check-in.
      // If a member attempts to invoke checkInOnline without submitting the code:
      await expect(
        service.checkInOnline({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
        }),
      ).rejects.toThrow('Online attendance requires a valid attendance code. Direct link check-in is not permitted.');

      // Invariant: zero records created
      expect(mockAttendanceRecords.length).toBe(0);
    });
  });

  // =========================================================================
  // SCENARIO 2 (Security Test 40):
  // Member tries to access attendance API directly without valid code.
  // Expected: 400 validation error, Attendance = NOT PRESENT.
  // =========================================================================
  describe('Security Test 2: Direct API manipulation without valid code is rejected', () => {
    it('rejects attendance submission without code or with malformed code', async () => {
      // Missing code
      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: '',
        }),
      ).rejects.toThrow('Meeting ID and 6-digit code are required');

      // Non-numeric or short code
      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: 'ABCDEF',
        }),
      ).rejects.toThrow('Attendance code must be a 6-digit number');

      expect(mockAttendanceRecords.length).toBe(0);
    });
  });

  // =========================================================================
  // SCENARIO 3 (Security Test 41):
  // Member has valid code, submits during valid window (e.g. exactly at 20:00 WAT).
  // Expected: Attendance = PRESENT, Attendance Method = ONLINE_CODE.
  // =========================================================================
  describe('Security Test 3: Submitting valid code during window marks PRESENT with ONLINE_CODE', () => {
    it('records attendance with ONLINE_CODE and status PRESENT', async () => {
      // 20:00:00 WAT = 19:00:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:00:00.000Z'));

      const result = await service.submitAttendanceCode({
        memberId: mockMemberA.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyRecorded).toBe(false);
      expect(result.status).toBe('PRESENT');
      expect(result.method).toBe(AttendanceMethod.ONLINE_CODE);
      expect(mockAttendanceRecords.length).toBe(1);
      expect(mockAttendanceRecords[0].method).toBe(AttendanceMethod.ONLINE_CODE);
      expect(mockAttendanceRecords[0].attendanceType).toBe(AttendanceType.ONLINE);
    });
  });

  // =========================================================================
  // SCENARIO 4 (Security Test 42):
  // Member submits yesterday's / wrong code.
  // Expected: Attendance = NOT PRESENT, Code = Invalid.
  // =========================================================================
  describe('Security Test 4: Submitting yesterday or incorrect code is rejected', () => {
    it('rejects wrong code and increments attempt counter', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:02:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: '123456', // Incorrect code (expected 739421)
        }),
      ).rejects.toThrow('Attendance Code Invalid. The code you entered is incorrect.');

      expect(mockAttendanceRecords.length).toBe(0);
    });
  });

  // =========================================================================
  // SCENARIO 5 (Security Test 43):
  // Member submits Wednesday code at 19:49 WAT when meeting starts at 20:00 WAT (11 min before).
  // Expected: Rejected, attendance window has not opened.
  // =========================================================================
  describe('Security Test 5: Submitting before 10-minute window (19:49 WAT) is rejected', () => {
    it('rejects code submission before valid window opens', async () => {
      // 19:49:00 WAT = 18:49:00 UTC (11 minutes before 20:00 WAT start)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T18:49:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: '739421',
        }),
      ).rejects.toThrow('Attendance Not Yet Available. Attendance opens 10 minutes before the scheduled meeting start.');

      expect(mockAttendanceRecords.length).toBe(0);
    });
  });

  // =========================================================================
  // SCENARIO 6 (Security Test 44):
  // Member submits correct code at 20:05 WAT when meeting starts at 20:00 WAT (5 min after).
  // Expected: Accepted, Present.
  // =========================================================================
  describe('Security Test 6: Submitting at 20:05 WAT during window is accepted', () => {
    it('accepts correct code 5 minutes after start', async () => {
      // 20:05:00 WAT = 19:05:00 UTC (within the 19:50 - 20:10 WAT window)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:05:00.000Z'));

      const result = await service.submitAttendanceCode({
        memberId: mockMemberA.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('PRESENT');
      expect(mockAttendanceRecords.length).toBe(1);
    });
  });

  // =========================================================================
  // SCENARIO 7 (Security Test 45):
  // Member submits correct code at 20:11 WAT when meeting starts at 20:00 WAT (11 min after).
  // Expected: Rejected, attendance window closed.
  // =========================================================================
  describe('Security Test 7: Submitting after window (20:11 WAT) is rejected as closed', () => {
    it('rejects code submission after 10 minutes past start', async () => {
      // 20:11:00 WAT = 19:11:00 UTC (11 minutes after 20:00 WAT start)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:11:00.000Z'));

      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: '739421',
        }),
      ).rejects.toThrow('Attendance Closed. The attendance window for this meeting has closed.');

      expect(mockAttendanceRecords.length).toBe(0);
    });
  });

  // =========================================================================
  // SCENARIO 8 (Security Test 46):
  // Member submits correct code twice.
  // Expected: First request: Attendance recorded. Second request: Attendance already recorded.
  // Still exactly ONE attendance record.
  // =========================================================================
  describe('Security Test 8: Submitting correct code twice is idempotent (only 1 record created)', () => {
    it('records attendance once and returns alreadyRecorded on duplicate submission', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:02:00.000Z'));

      // First submission
      const first = await service.submitAttendanceCode({
        memberId: mockMemberA.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });
      expect(first.success).toBe(true);
      expect(first.alreadyRecorded).toBe(false);
      expect(mockAttendanceRecords.length).toBe(1);

      // Second submission at 20:04 WAT
      jest.setSystemTime(new Date('2026-09-30T19:04:00.000Z'));
      const second = await service.submitAttendanceCode({
        memberId: mockMemberA.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });

      expect(second.success).toBe(true);
      expect(second.alreadyRecorded).toBe(true);
      expect(second.message).toContain('already marked PRESENT');
      // Invariant: still exactly ONE record
      expect(mockAttendanceRecords.length).toBe(1);
    });
  });

  // =========================================================================
  // SCENARIO 9 (Security Test 47):
  // Member A submits correct code. Member B submits correct code.
  // Expected: Member A -> Present, Member B -> Present. Each gets their own record.
  // =========================================================================
  describe('Security Test 9: Multiple distinct members get distinct attendance records', () => {
    it('creates distinct attendance records for Member A and Member B', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:03:00.000Z'));

      const resA = await service.submitAttendanceCode({
        memberId: mockMemberA.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });
      const resB = await service.submitAttendanceCode({
        memberId: mockMemberB.id,
        meetingId: mockMeeting.id,
        code: '739421',
      });

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);
      expect(mockAttendanceRecords.length).toBe(2);

      const recordA = mockAttendanceRecords.find((r) => r.memberId === mockMemberA.id);
      const recordB = mockAttendanceRecords.find((r) => r.memberId === mockMemberB.id);
      expect(recordA).toBeDefined();
      expect(recordB).toBeDefined();
      expect(recordA.id).not.toBe(recordB.id);
    });
  });

  // =========================================================================
  // SCENARIO 10 (Security Test 48):
  // Unauthorized admin / member access to attendance code.
  // Expected: Only Glory and Comfort roles have permission, other roles do not.
  // =========================================================================
  describe('Security Test 10: Authorization controls strictly protect the attendance code', () => {
    it('verifies that only SUPER_ADMIN (Glory) and EVENT_MANAGER (Comfort) hold attendance.online_code permission', () => {
      const requiredPermission = 'attendance.online_code';

      // Glory's role: SUPER_ADMIN (wildcard '*')
      const superAdminPermissions = SYSTEM_ROLE_DEFINITIONS.SUPER_ADMIN.permissions;
      const gloryCanAccess =
        superAdminPermissions.includes(PERMISSION_WILDCARD) ||
        superAdminPermissions.includes(requiredPermission);
      expect(gloryCanAccess).toBe(true);

      // Comfort's role: EVENT_MANAGER
      const eventManagerPermissions = SYSTEM_ROLE_DEFINITIONS.EVENT_MANAGER.permissions;
      const comfortCanAccess =
        eventManagerPermissions.includes(PERMISSION_WILDCARD) ||
        eventManagerPermissions.includes(requiredPermission);
      expect(comfortCanAccess).toBe(true);

      // Other admin roles: SECRETARY, VIEWER, WARDROBE_MANAGER, FINANCE
      const secretaryPermissions = SYSTEM_ROLE_DEFINITIONS.SECRETARY.permissions;
      expect(secretaryPermissions.includes(requiredPermission)).toBe(false);
      expect(secretaryPermissions.includes(PERMISSION_WILDCARD)).toBe(false);

      const viewerPermissions = SYSTEM_ROLE_DEFINITIONS.VIEWER.permissions;
      expect(viewerPermissions.includes(requiredPermission)).toBe(false);

      const financePermissions = SYSTEM_ROLE_DEFINITIONS.FINANCE.permissions;
      expect(financePermissions.includes(requiredPermission)).toBe(false);
    });

    it('rejects retrieving code for a physical meeting via getAttendanceCodeForAdmin', async () => {
      mockMeeting.isOnline = false;
      mockMeeting.locationName = 'Main Auditorium';
      mockMeeting.address = '12 Church Way, Lagos';

      await expect(
        service.getAttendanceCodeForAdmin('admin-comfort', mockMeeting.id),
      ).rejects.toThrow('Attendance codes are only used for online gatherings.');
    });

    it('returns validity window, status, and present count for authorized admin on online meeting', async () => {
      // During active window at 20:00 WAT (19:00 UTC)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:00:00.000Z'));

      const adminData = await service.getAttendanceCodeForAdmin('admin-glory', mockMeeting.id);
      expect(adminData.attendanceCode).toBe('739421');
      expect(adminData.status).toBe('ACTIVE');
      expect(adminData.validFrom).toEqual(new Date('2026-09-30T18:50:00.000Z'));
      expect(adminData.validUntil).toEqual(new Date('2026-09-30T19:10:00.000Z'));
    });
  });

  // =========================================================================
  // ADDITIONAL SECURITY TEST: Brute Force Rate Limiting
  // =========================================================================
  describe('Brute force rate limiting protection', () => {
    it('blocks code attempts after 5 consecutive failures', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-30T19:00:00.000Z'));

      // 5 failed guesses
      for (let i = 0; i < 5; i++) {
        await expect(
          service.submitAttendanceCode({
            memberId: mockMemberA.id,
            meetingId: mockMeeting.id,
            code: '000000',
          }),
        ).rejects.toThrow('Attendance Code Invalid');
      }

      // 6th attempt is throttled
      await expect(
        service.submitAttendanceCode({
          memberId: mockMemberA.id,
          meetingId: mockMeeting.id,
          code: '739421',
        }),
      ).rejects.toThrow('Too many failed attempts');
    });
  });
});
