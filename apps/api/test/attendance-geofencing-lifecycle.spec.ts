import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { AuditService } from '../src/common/rbac/audit.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceStatus, AttendanceMethod } from '@tfhc/shared';

describe('Attendance, Geofencing & Lifecycle Enterprise Suite', () => {
  let service: AttendanceService;

  const churchVenue = {
    latitude: 6.6697906,
    longitude: 3.3581822,
    radiusMeters: 120,
  };

  const activeMeetingId = 'active-meeting-1';
  const futureMeetingId = 'future-meeting-2';
  const memberId = 'member-123';
  const adminUserId = 'admin-user-001';

  const mockActiveMeeting = {
    id: activeMeetingId,
    title: 'Sunday Worship Service',
    status: 'ACTIVE',
    startTime: new Date(Date.now() - 30 * 60 * 1000), // Started 30 mins ago
    expectedArrivalTime: new Date(Date.now() - 45 * 60 * 1000),
    attendanceOpenTime: new Date(Date.now() - 60 * 60 * 1000),
    attendanceCloseTime: new Date(Date.now() + 60 * 60 * 1000),
    gracePeriodMinutes: 15,
    locationName: "The Father's House Church",
    latitude: churchVenue.latitude,
    longitude: churchVenue.longitude,
    geofenceRadiusMeters: churchVenue.radiusMeters,
    pointWeight: 1.0,
    visibility: 'PUBLIC',
    category: { pointWeight: 1.0 },
    audiences: [],
  };

  const mockFutureMeeting = {
    id: futureMeetingId,
    title: 'Midweek Communion Service',
    status: 'SCHEDULED',
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // Starts in 2 hours
    expectedArrivalTime: new Date(Date.now() + 1.75 * 60 * 60 * 1000),
    attendanceOpenTime: new Date(Date.now() + 1.5 * 60 * 60 * 1000),
    attendanceCloseTime: new Date(Date.now() + 3.5 * 60 * 60 * 1000),
    gracePeriodMinutes: 15,
    locationName: "The Father's House Church",
    latitude: churchVenue.latitude,
    longitude: churchVenue.longitude,
    geofenceRadiusMeters: churchVenue.radiusMeters,
    pointWeight: 1.0,
    visibility: 'PUBLIC',
    category: { pointWeight: 1.0 },
    audiences: [],
  };

  const houseAustinMeetingId = 'meeting-house-austin';
  const houseAustinVenue = {
    name: 'House Austin of Blessing',
    latitude: 6.4474,
    longitude: 3.4723,
    radiusMeters: 100,
  };

  const mockHouseAustinMeeting = {
    id: houseAustinMeetingId,
    title: 'House Austin of Blessing',
    status: 'ACTIVE',
    startTime: new Date(Date.now() - 30 * 60 * 1000),
    expectedArrivalTime: new Date(Date.now() - 45 * 60 * 1000),
    attendanceOpenTime: new Date(Date.now() - 60 * 60 * 1000),
    attendanceCloseTime: new Date(Date.now() + 60 * 60 * 1000),
    gracePeriodMinutes: 15,
    locationName: houseAustinVenue.name,
    latitude: houseAustinVenue.latitude,
    longitude: houseAustinVenue.longitude,
    geofenceRadiusMeters: houseAustinVenue.radiusMeters,
    pointWeight: 1.0,
    visibility: 'PUBLIC',
    category: { pointWeight: 1.0 },
    audiences: [],
  };

  const unrestrictedMeetingId = 'meeting-unrestricted';
  const mockUnrestrictedMeeting = {
    id: unrestrictedMeetingId,
    title: 'Global Online / Flexible Service',
    status: 'ACTIVE',
    startTime: new Date(Date.now() - 30 * 60 * 1000),
    expectedArrivalTime: new Date(Date.now() - 45 * 60 * 1000),
    attendanceOpenTime: new Date(Date.now() - 60 * 60 * 1000),
    attendanceCloseTime: new Date(Date.now() + 60 * 60 * 1000),
    gracePeriodMinutes: 15,
    locationName: 'Online / No Location Restriction',
    latitude: 6.6697906,
    longitude: 3.3581822,
    geofenceRadiusMeters: 100000, // 100km / flexible
    pointWeight: 1.0,
    visibility: 'PUBLIC',
    category: { pointWeight: 1.0 },
    audiences: [],
  };

  const mockActiveMember = {
    id: memberId,
    memberCode: 'TFHC-001',
    firstName: 'Glory',
    lastName: 'Eseosa',
    status: 'ACTIVE',
    subTeamId: 'team-media',
    roleInUnit: 'MEMBER',
  };

  let attendanceStore: Map<string, any>;
  let auditLogStore: any[];

  const mockPrisma = {
    member: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === memberId) return Promise.resolve(mockActiveMember);
        return Promise.resolve(null);
      }),
    },
    meeting: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === activeMeetingId) return Promise.resolve(mockActiveMeeting);
        if (where.id === futureMeetingId) return Promise.resolve(mockFutureMeeting);
        if (where.id === houseAustinMeetingId) return Promise.resolve(mockHouseAustinMeeting);
        if (where.id === unrestrictedMeetingId) return Promise.resolve(mockUnrestrictedMeeting);
        return Promise.resolve(null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.status === 'ACTIVE') return Promise.resolve(mockActiveMeeting);
        return Promise.resolve(null);
      }),
    },
    attendanceRecord: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const key = `${where.memberId_meetingId.memberId}_${where.memberId_meetingId.meetingId}`;
        return Promise.resolve(attendanceStore.get(key) || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const records = Array.from(attendanceStore.values());
        if (where?.meetingId) return Promise.resolve(records.filter((r) => r.meetingId === where.meetingId));
        if (where?.memberId) return Promise.resolve(records.filter((r) => r.memberId === where.memberId));
        return Promise.resolve(records);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const key = `${data.memberId}_${data.meetingId}`;
        if (attendanceStore.has(key)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          return Promise.reject(err);
        }
        const record = { id: `rec-${Date.now()}`, ...data, createdAt: new Date() };
        attendanceStore.set(key, record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        for (const [key, val] of attendanceStore.entries()) {
          if (val.id === where.id) {
            const updated = { ...val, ...data, updatedAt: new Date() };
            attendanceStore.set(key, updated);
            return Promise.resolve(updated);
          }
        }
        return Promise.resolve(data);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        for (const [key, val] of attendanceStore.entries()) {
          if (val.id === where.id) {
            attendanceStore.delete(key);
            return Promise.resolve(val);
          }
        }
        return Promise.resolve(null);
      }),
    },
    auditLog: {
      create: jest.fn().mockImplementation(({ data }) => {
        auditLogStore.push(data);
        return Promise.resolve({ id: `audit-${Date.now()}`, ...data });
      }),
    },
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback({
        $queryRaw: jest.fn().mockResolvedValue([]),
        meeting: mockPrisma.meeting,
        attendanceRecord: mockPrisma.attendanceRecord,
        auditLog: mockPrisma.auditLog,
      });
    }),
  };

  beforeEach(async () => {
    attendanceStore = new Map();
    auditLogStore = [];
    jest.clearAllMocks();

    const mockCache = {
      wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
      invalidateTag: jest.fn(),
      invalidateTags: jest.fn(),
    };

    const mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
      recordWithin: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('1. The Core Rule: Future Event Attendance Protection', () => {
    it('should reject Member check-in for a future event that has not started', async () => {
      await expect(
        service.checkInMember({
          memberId,
          meetingId: futureMeetingId,
          latitude: churchVenue.latitude,
          longitude: churchVenue.longitude,
          gpsAccuracy: 10,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Admin manual attendance for a future event', async () => {
      await expect(
        service.recordManualAttendance({
          adminUserId,
          memberId,
          meetingId: futureMeetingId,
          status: AttendanceStatus.ON_TIME,
          reason: 'Manual check-in attempted by admin',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Geofencing & Server-Side GPS Validation', () => {
    it('should allow check-in when member is within the configured church radius (30m away)', async () => {
      // 0.0002 deg offset is approx 22 meters
      const closeLatitude = churchVenue.latitude + 0.0002;
      const closeLongitude = churchVenue.longitude + 0.0001;

      const record = await service.checkInMember({
        memberId,
        meetingId: activeMeetingId,
        latitude: closeLatitude,
        longitude: closeLongitude,
        gpsAccuracy: 8,
        deviceInfo: 'Mozilla/5.0 Mobile Safari',
      });

      expect(record).toBeDefined();
      expect(record.status).toBeDefined();
      expect(record.method).toBe(AttendanceMethod.SYSTEM_GEO);
      expect(record.distanceFromVenue).toBeLessThanOrEqual(churchVenue.radiusMeters);
    });

    it('should reject check-in when member is outside the configured radius (1.5km away)', async () => {
      // 0.015 deg is approx 1.6 km away
      const farLatitude = churchVenue.latitude + 0.015;
      const farLongitude = churchVenue.longitude + 0.015;

      await expect(
        service.checkInMember({
          memberId,
          meetingId: activeMeetingId,
          latitude: farLatitude,
          longitude: farLongitude,
          gpsAccuracy: 10,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject check-in with inaccurate GPS signal (>100m accuracy)', async () => {
      await expect(
        service.checkInMember({
          memberId,
          meetingId: activeMeetingId,
          latitude: churchVenue.latitude,
          longitude: churchVenue.longitude,
          gpsAccuracy: 150, // Weak GPS signal
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject check-in with impossible coordinates (anti-spoofing)', async () => {
      await expect(
        service.checkInMember({
          memberId,
          meetingId: activeMeetingId,
          latitude: 95.0, // Invalid latitude (> 90)
          longitude: churchVenue.longitude,
        })
      ).rejects.toThrow('Device location coordinates are outside the valid range');

      await expect(
        service.checkInMember({
          memberId,
          meetingId: activeMeetingId,
          latitude: churchVenue.latitude,
          longitude: -200.0, // Invalid longitude (< -180)
        })
      ).rejects.toThrow('Device location coordinates are outside the valid range');
    });
  });

  describe('3. Duplicate Check-in & Concurrency Protection', () => {
    it('should reject duplicate check-in for the same member and meeting', async () => {
      // First check-in
      await service.checkInMember({
        memberId,
        meetingId: activeMeetingId,
        latitude: churchVenue.latitude,
        longitude: churchVenue.longitude,
        gpsAccuracy: 10,
      });

      // Second duplicate attempt
      await expect(
        service.checkInMember({
          memberId,
          meetingId: activeMeetingId,
          latitude: churchVenue.latitude,
          longitude: churchVenue.longitude,
          gpsAccuracy: 10,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Admin Manual Attendance & Mandatory Audit Trail', () => {
    it('should record manual attendance for active meeting with audit logging', async () => {
      const record = await service.recordManualAttendance({
        adminUserId,
        memberId,
        meetingId: activeMeetingId,
        status: AttendanceStatus.ON_TIME,
        reason: 'Device battery depleted on arrival',
      });

      expect(record).toBeDefined();
      expect(record.status).toBe(AttendanceStatus.ON_TIME);
      expect(record.method).toBe(AttendanceMethod.MANUAL);

      expect(auditLogStore.length).toBe(1);
      expect(auditLogStore[0].action).toBe('MANUAL_ATTENDANCE_RECORDED');
      expect(auditLogStore[0].actorUserId).toBe(adminUserId);
      expect(auditLogStore[0].reason).toBe('Device battery depleted on arrival');
    });

    it('should reject manual attendance without a mandatory audit reason', async () => {
      await expect(
        service.recordManualAttendance({
          adminUserId,
          memberId,
          meetingId: activeMeetingId,
          status: AttendanceStatus.ON_TIME,
          reason: '   ', // Blank reason
        })
      ).rejects.toThrow('An audit reason is required');
    });

    it('should update and audit corrections to existing attendance records', async () => {
      // 1. Initial manual mark
      const initial = await service.recordManualAttendance({
        adminUserId,
        memberId,
        meetingId: activeMeetingId,
        status: AttendanceStatus.LATE,
        reason: 'Initial late mark',
      });
      expect(initial.status).toBe(AttendanceStatus.LATE);

      // 2. Admin corrects to ON_TIME with audit reason
      const corrected = await service.recordManualAttendance({
        adminUserId,
        memberId,
        meetingId: activeMeetingId,
        status: AttendanceStatus.ON_TIME,
        reason: 'Verified on-site arrival log discrepancy',
      });

      expect(corrected.status).toBe(AttendanceStatus.ON_TIME);
      expect(auditLogStore.length).toBe(2);
      expect(auditLogStore[1].reason).toBe('Verified on-site arrival log discrepancy');
      expect(auditLogStore[1].previousData.status).toBe(AttendanceStatus.LATE);
      expect(auditLogStore[1].newData.status).toBe(AttendanceStatus.ON_TIME);
    });
  });

  describe('5. Roster Queries & Member History', () => {
    it('should retrieve attendance roster for live meeting', async () => {
      await service.recordManualAttendance({
        adminUserId,
        memberId,
        meetingId: activeMeetingId,
        status: AttendanceStatus.ON_TIME,
        reason: 'Roster check-in',
      });

      const roster = await service.getMeetingAttendance(activeMeetingId);
      expect(roster.length).toBe(1);
      expect(roster[0].memberId).toBe(memberId);
    });

    it('should retrieve member attendance history', async () => {
      await service.recordManualAttendance({
        adminUserId,
        memberId,
        meetingId: activeMeetingId,
        status: AttendanceStatus.ON_TIME,
        reason: 'Member history entry',
      });

      const history = await service.getMemberAttendance(memberId);
      expect(history.length).toBe(1);
      expect(history[0].meetingId).toBe(activeMeetingId);
    });
  });

  describe('6. Attendance Status & Clock-Out Lifecycle', () => {
    it('should return clockedIn: false when member has not clocked in', async () => {
      const status = await service.getAttendanceStatus(memberId, activeMeetingId);
      expect(status.clockedIn).toBe(false);
      expect(status.hasActiveSession).toBe(false);
      expect(status.record).toBeNull();
    });

    it('should return clockedIn: true after successful check-in', async () => {
      await service.checkInMember({
        memberId,
        meetingId: activeMeetingId,
        latitude: churchVenue.latitude,
        longitude: churchVenue.longitude,
        gpsAccuracy: 10,
      });

      const status = await service.getAttendanceStatus(memberId, activeMeetingId);
      expect(status.clockedIn).toBe(true);
      expect(status.hasActiveSession).toBe(true);
      expect(status.record).not.toBeNull();
      expect(status.record.memberId).toBe(memberId);
    });

    it('should clock out member and transition back to clockedIn: false', async () => {
      await service.checkInMember({
        memberId,
        meetingId: activeMeetingId,
        latitude: churchVenue.latitude,
        longitude: churchVenue.longitude,
        gpsAccuracy: 10,
      });

      const before = await service.getAttendanceStatus(memberId, activeMeetingId);
      expect(before.clockedIn).toBe(true);

      const clockOutRes = await service.clockOutMember(memberId, activeMeetingId);
      expect(clockOutRes.clockedOut).toBe(true);
      expect(clockOutRes.clockedIn).toBe(false);

      const after = await service.getAttendanceStatus(memberId, activeMeetingId);
      expect(after.clockedIn).toBe(false);
      expect(after.record).toBeNull();
    });
  });

  describe('7. Per-Event Location Geofencing (House Austin of Blessing)', () => {
    it('should allow check-in when member is within House Austin of Blessing venue (30m away)', async () => {
      // 30m offset from House Austin coordinates
      const memberLat = houseAustinVenue.latitude + 0.0002;
      const memberLng = houseAustinVenue.longitude + 0.0002;

      const result = await service.checkInMember({
        memberId,
        meetingId: houseAustinMeetingId,
        latitude: memberLat,
        longitude: memberLng,
        gpsAccuracy: 10,
        deviceInfo: 'iPhone Test Device',
      });

      expect(result).toBeDefined();
      expect(result.memberId).toBe(memberId);
      expect(result.meetingId).toBe(houseAustinMeetingId);
      expect(result.distanceFromVenue).toBeLessThanOrEqual(houseAustinVenue.radiusMeters);
      expect(result.method).toBe(AttendanceMethod.SYSTEM_GEO);
    });

    it('should REJECT check-in to House Austin when member is at church headquarters (15km away)', async () => {
      await expect(
        service.checkInMember({
          memberId,
          meetingId: houseAustinMeetingId,
          latitude: churchVenue.latitude,
          longitude: churchVenue.longitude,
          gpsAccuracy: 15,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ALLOW check-in to an unrestricted event even from 20km away without failing geofence', async () => {
      // 20km offset from church headquarters
      const distantLat = churchVenue.latitude + 0.18;
      const distantLng = churchVenue.longitude + 0.18;

      const result = await service.checkInMember({
        memberId,
        meetingId: unrestrictedMeetingId,
        latitude: distantLat,
        longitude: distantLng,
        gpsAccuracy: 25,
        deviceInfo: 'Remote Laptop',
      });

      expect(result).toBeDefined();
      expect(result.memberId).toBe(memberId);
      expect(result.meetingId).toBe(unrestrictedMeetingId);
    });
  });
});
