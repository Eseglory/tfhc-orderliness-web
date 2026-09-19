import { unitPolicy } from '../../common/unit-policy';
import { Prisma } from '@prisma/client';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/rbac/audit.service';
import { canViewEvent } from '../../common/event-visibility';
import {
  validateGeofence,
  classifyAttendanceStatus,
  calculateAttendancePoints,
  AttendanceStatus,
  AttendanceMethod,
} from '@tfhc/shared';

export interface RecordServiceHeadcountDto {
  meetingId: string;
  totalHeadcount: number;
  maleCount?: number | null;
  femaleCount?: number | null;
  childrenCount?: number | null;
  notes?: string | null;
}

export interface HeadcountAnalyticsQuery {
  days?: number;
  from?: string;
  to?: string;
  categoryId?: string;
  eventTypeId?: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private audit: AuditService,
  ) {}

  async checkInMember(dto: {
    memberId: string;
    meetingId: string;
    latitude: number;
    longitude: number;
    gpsAccuracy?: number;
    deviceInfo?: string;
  }) {
    if (typeof dto.meetingId !== 'string' || !dto.meetingId.trim()) throw new BadRequestException('Choose a service to check in');
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (dto.gpsAccuracy !== undefined && (!Number.isFinite(dto.gpsAccuracy) || dto.gpsAccuracy < 0)) throw new BadRequestException('GPS accuracy must be a non-negative number');
    const serverTimestamp = new Date();

    if (!Number.isFinite(dto.latitude) || !Number.isFinite(dto.longitude)) {
      throw new BadRequestException('A valid device location is required to check in');
    }
    if (
      dto.latitude < -90 || dto.latitude > 90 ||
      dto.longitude < -180 || dto.longitude > 180
    ) {
      throw new BadRequestException('Device location coordinates are outside the valid range');
    }

    // 1. Verify Member
    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
    });
    if (!member) {
      throw new NotFoundException('Member profile not found');
    }
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Member status is ${member.status}. Only ACTIVE members can check in.`
      );
    }

    // 2. Verify Meeting
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true, audiences: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.status !== 'ACTIVE') {
      throw new BadRequestException('Attendance check-in is not currently open for this meeting');
    }
    if (meeting.startTime > serverTimestamp) {
      throw new BadRequestException('Attendance cannot be clocked for a future event or service');
    }
    if (
      !canViewEvent(meeting.visibility, meeting.audiences, {
        memberId: member.id,
        subTeamId: member.subTeamId,
        roleInUnit: member.roleInUnit,
      })
    ) {
      throw new BadRequestException('This event is not open to you');
    }

    if (serverTimestamp < meeting.attendanceOpenTime || serverTimestamp > meeting.attendanceCloseTime) {
      throw new BadRequestException('Attendance check-in is outside the allowed time window');
    }

    // 3. Check for Duplicate Check-in
    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        memberId_meetingId: {
          memberId: dto.memberId,
          meetingId: dto.meetingId,
        },
      },
    });
    if (existingRecord) {
      throw new ConflictException(
        'Attendance has already been recorded for this meeting'
      );
    }

    // 4. Server-Side Geofence Validation (Haversine Formula)
    const geofenceResult = validateGeofence(
      { latitude: dto.latitude, longitude: dto.longitude },
      { latitude: meeting.latitude, longitude: meeting.longitude },
      meeting.geofenceRadiusMeters,
      dto.gpsAccuracy ?? 0
    );

    if (!geofenceResult.isWithinGeofence) {
      throw new BadRequestException(geofenceResult.message);
    }

    // 6. Time-based Attendance Classification
    const status = classifyAttendanceStatus(serverTimestamp, {
      attendanceOpenTime: meeting.attendanceOpenTime,
      expectedArrivalTime: meeting.expectedArrivalTime,
      startTime: meeting.startTime,
      gracePeriodMinutes: meeting.gracePeriodMinutes,
      attendanceCloseTime: meeting.attendanceCloseTime,
    });

    // 7. Calculate Points
    const pointsEarned = calculateAttendancePoints(
      status,
      meeting.pointWeight * meeting.category.pointWeight, await unitPolicy(this.prisma)
    );

    // Serialize check-in against meeting close-out, which updates this same row.
    // The unique attendance key also protects against duplicate requests.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${meeting.id} FOR UPDATE`;
      const current = await tx.meeting.findUnique({ where: { id: meeting.id } });
      if (!current || current.status !== 'ACTIVE' || new Date() > current.attendanceCloseTime) {
        throw new BadRequestException('Attendance check-in is no longer open for this meeting');
      }
      return tx.attendanceRecord.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId,
        expectedArrivalTime: meeting.expectedArrivalTime,
        actualArrivalTime: serverTimestamp,
        status,
        gpsLat: dto.latitude,
        gpsLong: dto.longitude,
        gpsAccuracy: dto.gpsAccuracy,
        distanceFromVenue: geofenceResult.distanceMeters,
        method: AttendanceMethod.SYSTEM_GEO,
        pointsEarned,
        deviceInfo: dto.deviceInfo,
      },
      include: {
        meeting: { include: { category: true } },
        member: true,
      },
      });
    }).then((record) => {
      this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'calendar']);
      return record;
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Attendance has already been recorded for this meeting');
      }
      throw error;
    });
  }

  async recordManualAttendance(dto: {
    adminUserId: string;
    memberId: string;
    meetingId: string;
    status: AttendanceStatus;
    reason: string;
    actualArrivalTime?: string;
  }) {
    const arrival = dto.actualArrivalTime ? new Date(dto.actualArrivalTime) : undefined;
    if (arrival && (!Number.isFinite(arrival.getTime()) || arrival > new Date())) throw new BadRequestException('Arrival time must be a valid past time');
    if (!Object.values(AttendanceStatus).includes(dto.status)) throw new BadRequestException('Invalid attendance status');
    if (typeof dto.reason !== 'string' || !dto.reason.trim()) throw new BadRequestException('An audit reason is required');
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    if (meeting.startTime > new Date()) {
      throw new BadRequestException('Attendance cannot be recorded for a future scheduled event or meeting');
    }

    const pointsEarned = calculateAttendancePoints(
      dto.status,
      meeting.pointWeight * meeting.category.pointWeight, await unitPolicy(this.prisma)
    );

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({
        where: { memberId_meetingId: { memberId: dto.memberId, meetingId: dto.meetingId } },
      });

      let record;
      if (existing) {
        record = await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: dto.status,
            ...(arrival ? {actualArrivalTime:arrival} : {}),
            method: AttendanceMethod.MANUAL,
            pointsEarned,
            isModified: true,
          },
        });
      } else {
        record = await tx.attendanceRecord.create({
          data: {
            memberId: dto.memberId,
            meetingId: dto.meetingId,
            expectedArrivalTime: meeting.expectedArrivalTime,
            actualArrivalTime: arrival ?? new Date(),
            status: dto.status,
            method: AttendanceMethod.MANUAL,
            pointsEarned,
            isModified: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: dto.adminUserId,
          action: 'MANUAL_ATTENDANCE_RECORDED',
          entity: 'AttendanceRecord',
          entityId: record.id,
          previousData: existing ? JSON.parse(JSON.stringify(existing)) : null,
          newData: JSON.parse(JSON.stringify(record)),
          reason: dto.reason,
        },
      });

      return record;
    }).then((record) => {
      this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'calendar']);
      return record;
    });
  }

  async getMeetingAttendance(meetingId: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { meetingId },
      include: { member: true },
      orderBy: { actualArrivalTime: 'asc' },
    });
  }

  async getMemberAttendance(memberId: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.prisma.attendanceRecord.findMany({
      where: { memberId },
      include: { meeting: { include: { category: true } } },
      orderBy: { meeting: { startTime: 'desc' } },
    });
  }

  async recordServiceHeadcount(dto: RecordServiceHeadcountDto, actorUserId: string) {
    if (!dto.meetingId || typeof dto.meetingId !== 'string' || !dto.meetingId.trim()) {
      throw new BadRequestException('A valid service ID is required');
    }
    if (typeof dto.totalHeadcount !== 'number' || !Number.isInteger(dto.totalHeadcount) || dto.totalHeadcount < 0) {
      throw new BadRequestException('Total headcount must be a non-negative whole number');
    }

    const checkCount = (val: number | null | undefined, name: string) => {
      if (val !== undefined && val !== null) {
        if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
          throw new BadRequestException(`${name} must be a non-negative whole number`);
        }
      }
    };

    checkCount(dto.maleCount, 'Male count');
    checkCount(dto.femaleCount, 'Female count');
    checkCount(dto.childrenCount, 'Children count');

    const male = dto.maleCount ?? 0;
    const female = dto.femaleCount ?? 0;
    const children = dto.childrenCount ?? 0;
    const demographicSum = male + female + children;

    if (demographicSum > dto.totalHeadcount) {
      throw new BadRequestException(
        `Sum of male (${male}), female (${female}), and children (${children}) (${demographicSum}) cannot exceed total headcount (${dto.totalHeadcount})`
      );
    }

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true, eventType: true },
    });
    if (!meeting) {
      throw new NotFoundException('Service/event not found');
    }
    if (meeting.status === 'CANCELLED') {
      throw new BadRequestException('Cannot record or modify headcount for a cancelled service');
    }
    if (meeting.startTime > new Date()) {
      throw new BadRequestException('Headcount cannot be recorded for a future scheduled service');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.serviceHeadcount.findUnique({
        where: { meetingId: dto.meetingId },
      });

      let record;
      const dataPayload = {
        totalHeadcount: dto.totalHeadcount,
        maleCount: dto.maleCount ?? null,
        femaleCount: dto.femaleCount ?? null,
        childrenCount: dto.childrenCount ?? null,
        notes: dto.notes ? dto.notes.trim() : null,
        lastUpdatedById: actorUserId,
      };

      if (existing) {
        record = await tx.serviceHeadcount.update({
          where: { id: existing.id },
          data: dataPayload,
          include: {
            meeting: { include: { category: true, eventType: true } },
            recordedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
            lastUpdatedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
          },
        });

        await this.audit.recordWithin(tx, {
          actorUserId,
          action: 'SERVICE_HEADCOUNT_UPDATED',
          entity: 'ServiceHeadcount',
          entityId: record.id,
          previousData: JSON.parse(JSON.stringify(existing)),
          newData: JSON.parse(JSON.stringify(record)),
          reason: dto.notes || 'Service headcount updated',
        });
      } else {
        record = await tx.serviceHeadcount.create({
          data: {
            meetingId: dto.meetingId,
            ...dataPayload,
            recordedById: actorUserId,
          },
          include: {
            meeting: { include: { category: true, eventType: true } },
            recordedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
            lastUpdatedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
          },
        });

        await this.audit.recordWithin(tx, {
          actorUserId,
          action: 'SERVICE_HEADCOUNT_RECORDED',
          entity: 'ServiceHeadcount',
          entityId: record.id,
          previousData: null,
          newData: JSON.parse(JSON.stringify(record)),
          reason: dto.notes || 'Official service headcount recorded',
        });
      }

      return record;
    }).then(async (record) => {
      this.cache.invalidateTags(['attendance', 'analytics', 'dashboard', 'meetings', 'reports']);
      const appAttendance = await this.prisma.attendanceRecord.findMany({
        where: { meetingId: dto.meetingId },
        select: { status: true },
      });
      const attendedCount = appAttendance.filter((r) =>
        ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
      ).length;
      return {
        ...record,
        individualAttendance: {
          totalCheckIns: appAttendance.length,
          attendedCount,
          absentCount: appAttendance.filter((r) => r.status === 'ABSENT').length,
          excusedCount: appAttendance.filter((r) => r.status === 'EXCUSED').length,
        },
        variance: record.totalHeadcount - attendedCount,
      };
    });
  }

  async getServiceHeadcount(meetingId: string) {
    if (!meetingId || typeof meetingId !== 'string') {
      throw new BadRequestException('A valid service ID is required');
    }
    const [headcount, meeting, appAttendance] = await Promise.all([
      this.prisma.serviceHeadcount.findUnique({
        where: { meetingId },
        include: {
          recordedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
          lastUpdatedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { id: true, title: true, startTime: true, status: true, category: true, eventType: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { meetingId },
        select: { status: true },
      }),
    ]);

    if (!meeting) throw new NotFoundException('Service/event not found');

    const attendedCount = appAttendance.filter((r) =>
      ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
    ).length;

    return {
      meeting,
      headcount,
      individualAttendance: {
        totalCheckIns: appAttendance.length,
        attendedCount,
        absentCount: appAttendance.filter((r) => r.status === 'ABSENT').length,
        excusedCount: appAttendance.filter((r) => r.status === 'EXCUSED').length,
      },
      variance: headcount ? headcount.totalHeadcount - attendedCount : null,
    };
  }

  async getHeadcountAnalytics(query: HeadcountAnalyticsQuery) {
    const days = query.days !== undefined ? Number(query.days) : 90;
    const now = query.to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999+01:00` : query.to) : new Date();
    const since = query.from ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.from) ? `${query.from}T00:00:00+01:00` : query.from) : new Date(now.getTime() - days * 86400000);

    if (!Number.isFinite(now.getTime()) || !Number.isFinite(since.getTime()) || since > now) {
      throw new BadRequestException('Choose a valid reporting date range');
    }

    const whereMeeting: Prisma.MeetingWhereInput = {
      startTime: { gte: since, lte: now },
      status: { not: 'CANCELLED' },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.eventTypeId ? { eventTypeId: query.eventTypeId } : {}),
    };

    const [headcountRecords, meetings] = await Promise.all([
      this.prisma.serviceHeadcount.findMany({
        where: {
          meeting: whereMeeting,
        },
        include: {
          meeting: {
            select: {
              id: true,
              title: true,
              startTime: true,
              status: true,
              category: { select: { id: true, name: true } },
              eventType: { select: { id: true, name: true, color: true } },
            },
          },
          recordedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
          lastUpdatedBy: { select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { meeting: { startTime: 'asc' } },
      }),
      this.prisma.meeting.findMany({
        where: whereMeeting,
        select: {
          id: true,
          title: true,
          startTime: true,
          category: { select: { name: true } },
          attendanceRecords: { select: { status: true } },
        },
      }),
    ]);

    const appAttendanceByMeeting = new Map<string, number>();
    for (const m of meetings) {
      const attended = m.attendanceRecords.filter((r) =>
        ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
      ).length;
      appAttendanceByMeeting.set(m.id, attended);
    }

    let totalHeadcount = 0;
    let totalMale = 0;
    let totalFemale = 0;
    let totalChildren = 0;
    let totalAppAttendance = 0;

    let highest: { meetingId: string; title: string; date: Date; count: number } | null = null;
    let lowest: { meetingId: string; title: string; date: Date; count: number } | null = null;

    const services = headcountRecords.map((h) => {
      const appAtt = appAttendanceByMeeting.get(h.meetingId) ?? 0;
      totalHeadcount += h.totalHeadcount;
      totalMale += h.maleCount ?? 0;
      totalFemale += h.femaleCount ?? 0;
      totalChildren += h.childrenCount ?? 0;
      totalAppAttendance += appAtt;

      if (!highest || h.totalHeadcount > highest.count) {
        highest = {
          meetingId: h.meetingId,
          title: h.meeting.title,
          date: h.meeting.startTime,
          count: h.totalHeadcount,
        };
      }
      if (!lowest || h.totalHeadcount < lowest.count) {
        lowest = {
          meetingId: h.meetingId,
          title: h.meeting.title,
          date: h.meeting.startTime,
          count: h.totalHeadcount,
        };
      }

      return {
        id: h.id,
        meetingId: h.meetingId,
        title: h.meeting.title,
        date: h.meeting.startTime,
        category: h.meeting.category?.name ?? 'General',
        eventType: h.meeting.eventType?.name ?? null,
        totalHeadcount: h.totalHeadcount,
        maleCount: h.maleCount,
        femaleCount: h.femaleCount,
        childrenCount: h.childrenCount,
        individualAppAttendance: appAtt,
        variance: h.totalHeadcount - appAtt,
        notes: h.notes,
        recordedBy: h.recordedBy ? (h.recordedBy.member ? `${h.recordedBy.member.firstName} ${h.recordedBy.member.lastName}` : h.recordedBy.email) : 'System',
        recordedAt: h.createdAt,
        lastUpdatedBy: h.lastUpdatedBy ? (h.lastUpdatedBy.member ? `${h.lastUpdatedBy.member.firstName} ${h.lastUpdatedBy.member.lastName}` : h.lastUpdatedBy.email) : null,
        lastUpdatedAt: h.updatedAt,
      };
    });

    const count = services.length;
    const averageHeadcount = count > 0 ? Math.round((totalHeadcount / count) * 10) / 10 : 0;
    const averageAppAttendance = count > 0 ? Math.round((totalAppAttendance / count) * 10) / 10 : 0;

    return {
      period: { since, until: now, days },
      summary: {
        servicesRecordedCount: count,
        totalHeadcount,
        averageHeadcount,
        averageAppAttendance,
        totalAppAttendance,
        highestService: highest,
        lowestService: lowest,
        demographics: {
          male: totalMale,
          female: totalFemale,
          children: totalChildren,
        },
      },
      services,
    };
  }
}
