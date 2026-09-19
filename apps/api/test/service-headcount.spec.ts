import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { AuditService } from '../src/common/rbac/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Official Service Headcount & Attendance Suite', () => {
  let service: AttendanceService;

  const adminUserId = 'admin-user-001';
  const usherUserId = 'usher-user-002';
  const activeMeetingId = 'active-meeting-1';
  const futureMeetingId = 'future-meeting-2';
  const cancelledMeetingId = 'cancelled-meeting-3';

  const mockActiveMeeting = {
    id: activeMeetingId,
    title: 'Sunday Celebration Service',
    status: 'ACTIVE',
    startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    meetingDate: new Date(Date.now() - 60 * 60 * 1000),
    categoryId: 'cat-sunday',
    category: { id: 'cat-sunday', name: 'Sunday Service' },
    eventType: { id: 'evt-service', name: 'Service', color: '#10b981' },
  };

  const mockFutureMeeting = {
    id: futureMeetingId,
    title: 'Upcoming Sunday Service',
    status: 'SCHEDULED',
    startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days in future
    meetingDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    categoryId: 'cat-sunday',
    category: { id: 'cat-sunday', name: 'Sunday Service' },
    eventType: { id: 'evt-service', name: 'Service', color: '#10b981' },
  };

  const mockCancelledMeeting = {
    id: cancelledMeetingId,
    title: 'Cancelled Special Meeting',
    status: 'CANCELLED',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
    meetingDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
    categoryId: 'cat-special',
    category: { id: 'cat-special', name: 'Special Service' },
    eventType: { id: 'evt-special', name: 'Special', color: '#f59e0b' },
  };

  let headcountStore: Map<string, any>;
  let attendanceStore: Map<string, any>;
  let auditLogs: any[];

  const mockPrisma: any = {
    meeting: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === activeMeetingId) return Promise.resolve(mockActiveMeeting);
        if (where.id === futureMeetingId) return Promise.resolve(mockFutureMeeting);
        if (where.id === cancelledMeetingId) return Promise.resolve(mockCancelledMeeting);
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const list = [mockActiveMeeting];
        return Promise.resolve(
          list.map((m) => ({
            ...m,
            attendanceRecords: Array.from(attendanceStore.values()).filter((r) => r.meetingId === m.id),
          }))
        );
      }),
    },
    serviceHeadcount: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.meetingId) {
          return Promise.resolve(headcountStore.get(where.meetingId) || null);
        }
        if (where.id) {
          for (const val of headcountStore.values()) {
            if (val.id === where.id) return Promise.resolve(val);
          }
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(
          Array.from(headcountStore.values()).map((h) => ({
            ...h,
            meeting: mockActiveMeeting,
            recordedBy: { id: h.recordedById, email: 'admin@tfhc.org', member: { firstName: 'Glory', lastName: 'Eseosa' } },
            lastUpdatedBy: h.lastUpdatedById
              ? { id: h.lastUpdatedById, email: 'usher@tfhc.org', member: { firstName: 'Supervising', lastName: 'Usher' } }
              : null,
          }))
        );
      }),
      create: jest.fn().mockImplementation(({ data, include }) => {
        const record = {
          id: `hc-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          meeting: mockActiveMeeting,
          recordedBy: { id: data.recordedById, email: 'admin@tfhc.org', member: { firstName: 'Glory', lastName: 'Eseosa' } },
          lastUpdatedBy: data.lastUpdatedById
            ? { id: data.lastUpdatedById, email: 'admin@tfhc.org', member: { firstName: 'Glory', lastName: 'Eseosa' } }
            : null,
        };
        headcountStore.set(data.meetingId, record);
        return Promise.resolve(record);
      }),
      update: jest.fn().mockImplementation(({ where, data, include }) => {
        const existing = headcountStore.get(activeMeetingId);
        const updated = {
          ...existing,
          ...data,
          updatedAt: new Date(),
          meeting: mockActiveMeeting,
          recordedBy: { id: existing.recordedById, email: 'admin@tfhc.org', member: { firstName: 'Glory', lastName: 'Eseosa' } },
          lastUpdatedBy: data.lastUpdatedById
            ? { id: data.lastUpdatedById, email: 'usher@tfhc.org', member: { firstName: 'Supervising', lastName: 'Usher' } }
            : null,
        };
        headcountStore.set(activeMeetingId, updated);
        return Promise.resolve(updated);
      }),
    },
    attendanceRecord: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        const records = Array.from(attendanceStore.values());
        if (where?.meetingId) return Promise.resolve(records.filter((r) => r.meetingId === where.meetingId));
        return Promise.resolve(records);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback({
        serviceHeadcount: mockPrisma.serviceHeadcount,
        meeting: mockPrisma.meeting,
        attendanceRecord: mockPrisma.attendanceRecord,
      });
    }),
  };

  const mockAudit = {
    record: jest.fn().mockImplementation((entry) => {
      auditLogs.push(entry);
      return Promise.resolve();
    }),
    recordWithin: jest.fn().mockImplementation((tx, entry) => {
      auditLogs.push(entry);
      return Promise.resolve();
    }),
  };

  const mockCache = {
    wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
    invalidateTag: jest.fn(),
    invalidateTags: jest.fn(),
  };

  beforeEach(async () => {
    headcountStore = new Map();
    attendanceStore = new Map();
    auditLogs = [];
    jest.clearAllMocks();

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

  describe('1. Recording Official Service Headcount', () => {
    it('should successfully record official physical headcount with breakdowns', async () => {
      const result = await service.recordServiceHeadcount(
        {
          meetingId: activeMeetingId,
          totalHeadcount: 347,
          maleCount: 120,
          femaleCount: 150,
          childrenCount: 77,
          notes: 'First Sunday of the Month - Thanksgiving Service',
        },
        adminUserId
      );

      expect(result).toBeDefined();
      expect(result.totalHeadcount).toBe(347);
      expect(result.maleCount).toBe(120);
      expect(result.femaleCount).toBe(150);
      expect(result.childrenCount).toBe(77);
      expect(result.notes).toBe('First Sunday of the Month - Thanksgiving Service');
      expect(result.recordedById).toBe(adminUserId);

      // Audit Log Verification
      expect(mockAudit.recordWithin).toHaveBeenCalledTimes(1);
      const auditEntry = auditLogs[0];
      expect(auditEntry.action).toBe('SERVICE_HEADCOUNT_RECORDED');
      expect(auditEntry.entity).toBe('ServiceHeadcount');
      expect(auditEntry.actorUserId).toBe(adminUserId);
      expect(auditEntry.previousData).toBeNull();
      expect(auditEntry.newData.totalHeadcount).toBe(347);

      // Cache Invalidation
      expect(mockCache.invalidateTags).toHaveBeenCalledWith([
        'attendance',
        'analytics',
        'dashboard',
        'meetings',
        'reports',
      ]);
    });

    it('should update an existing official headcount and audit previous vs new values', async () => {
      // 1. Initial creation
      await service.recordServiceHeadcount(
        {
          meetingId: activeMeetingId,
          totalHeadcount: 340,
          maleCount: 120,
          femaleCount: 145,
          childrenCount: 75,
          notes: 'Initial count by usher team',
        },
        adminUserId
      );

      // 2. Later update by supervising usher
      const updated = await service.recordServiceHeadcount(
        {
          meetingId: activeMeetingId,
          totalHeadcount: 347,
          maleCount: 120,
          femaleCount: 150,
          childrenCount: 77,
          notes: 'Recounted gallery and children department',
        },
        usherUserId
      );

      expect(updated.totalHeadcount).toBe(347);
      expect(updated.lastUpdatedById).toBe(usherUserId);

      // Verify second audit log
      expect(auditLogs.length).toBe(2);
      const updateAudit = auditLogs[1];
      expect(updateAudit.action).toBe('SERVICE_HEADCOUNT_UPDATED');
      expect(updateAudit.actorUserId).toBe(usherUserId);
      expect(updateAudit.previousData.totalHeadcount).toBe(340);
      expect(updateAudit.newData.totalHeadcount).toBe(347);
    });
  });

  describe('2. Validation & Business Rules Enforcement', () => {
    it('should reject negative total headcount', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: activeMeetingId,
            totalHeadcount: -10,
          },
          adminUserId
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject negative breakdown counts', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: activeMeetingId,
            totalHeadcount: 100,
            maleCount: -5,
          },
          adminUserId
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject demographic breakdown sum exceeding total headcount', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: activeMeetingId,
            totalHeadcount: 200,
            maleCount: 100,
            femaleCount: 90,
            childrenCount: 25, // Sum = 215 > 200
          },
          adminUserId
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject headcount entry for a future scheduled service', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: futureMeetingId,
            totalHeadcount: 150,
          },
          adminUserId
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject headcount entry for a cancelled service', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: cancelledMeetingId,
            totalHeadcount: 150,
          },
          adminUserId
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent meeting ID', async () => {
      await expect(
        service.recordServiceHeadcount(
          {
            meetingId: 'non-existent-id',
            totalHeadcount: 100,
          },
          adminUserId
        )
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Comparison with Individual App Attendance', () => {
    it('should distinctly report Official Physical Headcount alongside Digital App Check-ins', async () => {
      // Record official headcount
      await service.recordServiceHeadcount(
        {
          meetingId: activeMeetingId,
          totalHeadcount: 347,
          maleCount: 120,
          femaleCount: 150,
          childrenCount: 77,
        },
        adminUserId
      );

      // Simulate 3 digital app check-ins
      attendanceStore.set('mem1_active', { id: 'att-1', meetingId: activeMeetingId, status: 'ON_TIME' });
      attendanceStore.set('mem2_active', { id: 'att-2', meetingId: activeMeetingId, status: 'EARLY' });
      attendanceStore.set('mem3_active', { id: 'att-3', meetingId: activeMeetingId, status: 'LATE' });

      const details = await service.getServiceHeadcount(activeMeetingId);

      expect(details).toBeDefined();
      expect(details.headcount.totalHeadcount).toBe(347);
      expect(details.individualAttendance.attendedCount).toBe(3);
      expect(details.individualAttendance.totalCheckIns).toBe(3);
      expect(details.variance).toBe(344); // 347 physical - 3 app check-ins
    });
  });

  describe('4. Headcount Analytics & Aggregations', () => {
    it('should correctly aggregate attendance metrics and demographic totals', async () => {
      await service.recordServiceHeadcount(
        {
          meetingId: activeMeetingId,
          totalHeadcount: 350,
          maleCount: 130,
          femaleCount: 150,
          childrenCount: 70,
        },
        adminUserId
      );

      const analytics = await service.getHeadcountAnalytics({ days: 30 });

      expect(analytics).toBeDefined();
      expect(analytics.summary.totalHeadcount).toBe(350);
      expect(analytics.summary.averageHeadcount).toBe(350);
      expect(analytics.summary.servicesRecordedCount).toBe(1);
      expect(analytics.summary.highestService?.count).toBe(350);
      expect(analytics.summary.lowestService?.count).toBe(350);
      expect(analytics.summary.demographics.male).toBe(130);
      expect(analytics.summary.demographics.female).toBe(150);
      expect(analytics.summary.demographics.children).toBe(70);
      expect(analytics.services.length).toBe(1);
      expect(analytics.services[0].title).toBe('Sunday Celebration Service');
    });
  });
});
