import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExcusesService } from '../src/modules/excuses/excuses.service';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CacheService } from '../src/common/cache/cache.service';
import { ExcuseStatus, AttendanceStatus } from '@tfhc/shared';

describe('Excuse & Permission Request — Complete Approval Workflow', () => {
  let service: ExcusesService;
  let prisma: any;

  const mockMember = {
    id: 'mem-101',
    userId: 'usr-101',
    memberCode: 'TFHC-001',
    firstName: 'John',
    lastName: 'Doe',
    status: 'ACTIVE',
    roleInUnit: 'Member',
    subTeamId: 'team-1',
  };

  const mockMeeting = {
    id: 'meet-201',
    title: 'Sunday Worship Service',
    meetingDate: new Date('2026-09-20T08:00:00Z'),
    startTime: new Date('2026-09-20T08:00:00Z'),
    expectedArrivalTime: new Date('2026-09-20T07:45:00Z'),
    attendanceOpenTime: new Date('2026-09-20T07:30:00Z'),
    attendanceCloseTime: new Date('2026-09-20T10:00:00Z'),
    status: 'SCHEDULED',
    visibility: 'PUBLIC',
    audiences: [],
    pointWeight: 1.0,
    category: { name: 'Sunday Service', pointWeight: 1.0 },
  };

  const mockMeeting2 = {
    id: 'meet-202',
    title: 'Wednesday Midweek Service',
    meetingDate: new Date('2026-09-23T18:00:00Z'),
    startTime: new Date('2026-09-23T18:00:00Z'),
    expectedArrivalTime: new Date('2026-09-23T17:45:00Z'),
    attendanceOpenTime: new Date('2026-09-23T17:30:00Z'),
    attendanceCloseTime: new Date('2026-09-23T20:00:00Z'),
    status: 'SCHEDULED',
    visibility: 'PUBLIC',
    audiences: [],
    pointWeight: 1.0,
    category: { name: 'Midweek Service', pointWeight: 1.0 },
  };

  let inMemoryExcuses: any[] = [];
  let inMemoryAttendance: any[] = [];
  let inMemoryAuditLogs: any[] = [];
  let inMemoryNotifications: any[] = [];
  let inMemoryApprovalRequests: any[] = [];

  beforeEach(async () => {
    inMemoryExcuses = [];
    inMemoryAttendance = [];
    inMemoryAuditLogs = [];
    inMemoryNotifications = [];
    inMemoryApprovalRequests = [];

    const mockTx = {
      absenceExcuse: {
        updateMany: jest.fn(async ({ where, data }) => {
          const matching = inMemoryExcuses.filter(
            (e) => e.id === where.id && (where.status === undefined || e.status === where.status),
          );
          matching.forEach((e) => Object.assign(e, data));
          return { count: matching.length };
        }),
        update: jest.fn(async ({ where, data }) => {
          const found = inMemoryExcuses.find((e) => e.id === where.id);
          if (!found) throw new Error('Not found');
          Object.assign(found, data);
          return { ...found, meeting: mockMeeting, member: mockMember };
        }),
      },
      attendanceRecord: {
        findUnique: jest.fn(async ({ where }) => {
          const { memberId, meetingId } = where.memberId_meetingId || {};
          return inMemoryAttendance.find((a) => a.memberId === memberId && a.meetingId === meetingId) || null;
        }),
        update: jest.fn(async ({ where, data }) => {
          const found = inMemoryAttendance.find((a) => a.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        }),
        create: jest.fn(async ({ data }) => {
          const rec = { id: `att-${Date.now()}-${Math.random()}`, ...data };
          inMemoryAttendance.push(rec);
          return rec;
        }),
      },
      meeting: {
        findMany: jest.fn(async ({ where }) => {
          const start = where.startTime?.gte;
          const end = where.startTime?.lte;
          return [mockMeeting, mockMeeting2].filter((m) => m.startTime >= start && m.startTime <= end);
        }),
      },
      auditLog: {
        create: jest.fn(async ({ data }) => {
          const log = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
          inMemoryAuditLogs.push(log);
          return log;
        }),
      },
      memberNotification: {
        create: jest.fn(async ({ data }) => {
          const notif = { id: `notif-${Date.now()}`, ...data, createdAt: new Date() };
          inMemoryNotifications.push(notif);
          return notif;
        }),
      },
    };

    prisma = {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
      member: {
        findUnique: jest.fn(async ({ where }) => (where.id === mockMember.id ? mockMember : null)),
      },
      meeting: {
        findUnique: jest.fn(async ({ where }) => (where.id === mockMeeting.id ? mockMeeting : null)),
      },
      absenceExcuse: {
        findUnique: jest.fn(async ({ where }) => inMemoryExcuses.find((e) => e.id === where.id) || null),
        findFirst: jest.fn(async ({ where }) => {
          return (
            inMemoryExcuses.find((e) => {
              if (where.memberId && e.memberId !== where.memberId) return false;
              if (where.meetingId && e.meetingId !== where.meetingId) return false;
              if (where.status?.in && !where.status.in.includes(e.status)) return false;
              return true;
            }) || null
          );
        }),
        findMany: jest.fn(async () => inMemoryExcuses),
        create: jest.fn(async ({ data }) => {
          const excuse = {
            id: `excuse-${Date.now()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            member: mockMember,
            meeting: data.meetingId ? mockMeeting : null,
          };
          inMemoryExcuses.push(excuse);
          return excuse;
        }),
        update: jest.fn(async ({ where, data }) => {
          const found = inMemoryExcuses.find((e) => e.id === where.id);
          if (found) Object.assign(found, data);
          return { ...found, member: mockMember, meeting: found?.meetingId ? mockMeeting : null };
        }),
      },
      attendanceRecord: {
        findMany: jest.fn(async () => inMemoryAttendance),
      },
      auditLog: {
        create: jest.fn(async ({ data }) => {
          inMemoryAuditLogs.push(data);
          return data;
        }),
      },
    };

    const mockApprovals = {
      open: jest.fn(async (input) => {
        const req = { id: `app-req-${Date.now()}`, ...input, status: 'PENDING' };
        inMemoryApprovalRequests.push(req);
        return req;
      }),
      registerFinalizer: jest.fn(),
      getById: jest.fn(async (id) => ({
        id,
        status: 'PENDING',
        currentStepOrder: 1,
        steps: [{ order: 1, name: 'Leader Review', state: 'current' }],
      })),
      act: jest.fn(),
      cancel: jest.fn(),
    };

    const mockCache = {
      wrap: jest.fn().mockImplementation((key, ttl, fn) => fn()),
      invalidateTag: jest.fn(),
      invalidateTags: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcusesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApprovalsService, useValue: mockApprovals },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ExcusesService>(ExcusesService);
  });

  describe('1. Member Submission Flow', () => {
    test('submits a specific meeting excuse and creates pending excuse + approval request', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Under the weather with flu',
        category: 'SICKNESS',
      });

      expect(excuse).toBeDefined();
      expect(excuse.status).toBe(ExcuseStatus.PENDING);
      expect(excuse.memberId).toBe(mockMember.id);
      expect(excuse.meetingId).toBe(mockMeeting.id);
      expect(excuse.category).toBe('SICKNESS');
      expect(inMemoryApprovalRequests).toHaveLength(1);
    });

    test('rejects duplicate pending excuse for the same meeting', async () => {
      await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'First request',
        category: 'WORK',
      });

      await expect(
        service.submitExcuse({
          memberId: mockMember.id,
          meetingId: mockMeeting.id,
          reason: 'Duplicate request',
          category: 'WORK',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    test('submits a general unavailability leave period with date range', async () => {
      const startDate = new Date('2026-09-18T00:00:00Z');
      const endDate = new Date('2026-09-25T23:59:59Z');

      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        startDate,
        endDate,
        reason: 'Annual corporate offsite out of country',
        category: 'TRAVEL',
      });

      expect(excuse).toBeDefined();
      expect(excuse.status).toBe(ExcuseStatus.PENDING);
      expect(excuse.meetingId).toBeNull();
      expect(excuse.startDate).toEqual(startDate);
      expect(excuse.endDate).toEqual(endDate);
      expect(excuse.requestType).toBe('GENERAL_UNAVAILABILITY');
    });

    test('rejects invalid date range where start date > end date', async () => {
      await expect(
        service.submitExcuse({
          memberId: mockMember.id,
          startDate: new Date('2026-09-30T00:00:00Z'),
          endDate: new Date('2026-09-20T00:00:00Z'),
          reason: 'Invalid dates',
          category: 'TRAVEL',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Approver Workflow & Attendance Impact', () => {
    test('approving a specific meeting excuse marks AttendanceRecord as EXCUSED with 0 points and sends notification', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Work shift overlap',
        category: 'WORK',
      });

      // Clear approvalRequestId so it runs through the direct decision path in reviewExcuse
      excuse.approvalRequestId = null;

      const reviewed = await service.reviewExcuse({
        excuseId: excuse.id,
        adminUserId: 'admin-999',
        status: ExcuseStatus.APPROVED,
        reviewNote: 'Approved. Enjoy your shift.',
      });

      expect(reviewed.status).toBe(ExcuseStatus.APPROVED);
      expect(inMemoryAttendance).toHaveLength(1);
      expect(inMemoryAttendance[0].status).toBe(AttendanceStatus.EXCUSED);
      expect(inMemoryAttendance[0].pointsEarned).toBe(0);
      expect(inMemoryAuditLogs).toHaveLength(1);
      expect(inMemoryAuditLogs[0].action).toBe('ABSENCE_EXCUSE_APPROVED');
      expect(inMemoryNotifications).toHaveLength(1);
      expect(inMemoryNotifications[0].type).toBe('ABSENCE_DECISION');
    });

    test('approving general leave marks all meetings in the date range as EXCUSED', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        startDate: new Date('2026-09-18T00:00:00Z'),
        endDate: new Date('2026-09-25T23:59:59Z'),
        reason: 'Mission trip',
        category: 'TRAVEL',
      });

      excuse.approvalRequestId = null;

      await service.reviewExcuse({
        excuseId: excuse.id,
        adminUserId: 'admin-999',
        status: ExcuseStatus.APPROVED,
        reviewNote: 'Safe travels and blessings on the trip!',
      });

      // Both mockMeeting (Sept 20) and mockMeeting2 (Sept 23) should have EXCUSED records created
      expect(inMemoryAttendance).toHaveLength(2);
      expect(inMemoryAttendance[0].status).toBe(AttendanceStatus.EXCUSED);
      expect(inMemoryAttendance[1].status).toBe(AttendanceStatus.EXCUSED);
      expect(inMemoryAuditLogs).toHaveLength(2);
    });

    test('rejecting an excuse requires a reason, does not excuse attendance, and logs audit record', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Tired',
        category: 'PERSONAL',
      });

      excuse.approvalRequestId = null;

      // Without reason -> BadRequestException
      await expect(
        service.reviewExcuse({
          excuseId: excuse.id,
          adminUserId: 'admin-999',
          status: ExcuseStatus.REJECTED,
          reviewNote: '',
        }),
      ).rejects.toThrow(BadRequestException);

      // With reason -> succeeds
      const rejected = await service.reviewExcuse({
        excuseId: excuse.id,
        adminUserId: 'admin-999',
        status: ExcuseStatus.REJECTED,
        reviewNote: 'Reason does not meet the criteria for excused absence.',
      });

      expect(rejected.status).toBe(ExcuseStatus.REJECTED);
      expect(inMemoryAttendance).toHaveLength(0); // No excused attendance record
      expect(inMemoryAuditLogs).toHaveLength(1);
      expect(inMemoryAuditLogs[0].action).toBe('ABSENCE_EXCUSE_REJECTED');
    });
  });

  describe('3. Requester Cancellation & Idempotency', () => {
    test('requester can cancel their own pending excuse', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Need to cancel later',
        category: 'WORK',
      });

      const cancelled = await service.cancelExcuse(excuse.id, mockMember.id, mockMember.userId);
      expect(cancelled.status).toBe(ExcuseStatus.CANCELLED);
    });

    test('another member cannot cancel someone else\'s excuse', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Private request',
        category: 'WORK',
      });

      await expect(
        service.cancelExcuse(excuse.id, 'mem-other-user', 'usr-other'),
      ).rejects.toThrow(ForbiddenException);
    });

    test('reviewing an already reviewed excuse is prevented', async () => {
      const excuse = await service.submitExcuse({
        memberId: mockMember.id,
        meetingId: mockMeeting.id,
        reason: 'Initial',
        category: 'WORK',
      });

      excuse.approvalRequestId = null;

      await service.reviewExcuse({
        excuseId: excuse.id,
        adminUserId: 'admin-999',
        status: ExcuseStatus.APPROVED,
        reviewNote: 'Approved first time',
      });

      await expect(
        service.reviewExcuse({
          excuseId: excuse.id,
          adminUserId: 'admin-999',
          status: ExcuseStatus.APPROVED,
          reviewNote: 'Approved second time',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
