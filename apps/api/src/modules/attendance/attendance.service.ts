import { unitPolicy } from '../../common/unit-policy';
import { Prisma, AttendanceType } from '@prisma/client';
import * as crypto from 'crypto';
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
  calculateHaversineDistanceMeters,
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
    if (serverTimestamp < meeting.attendanceOpenTime) {
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
    const isGeofenceRequired =
      meeting.geofenceRadiusMeters > 0 &&
      meeting.geofenceRadiusMeters < 50000 &&
      !meeting.locationName?.toLowerCase().includes('virtual') &&
      !meeting.locationName?.toLowerCase().includes('online');

    let distanceFromVenue = 0;
    if (isGeofenceRequired) {
      const geofenceResult = validateGeofence(
        { latitude: dto.latitude, longitude: dto.longitude },
        { latitude: meeting.latitude, longitude: meeting.longitude },
        meeting.geofenceRadiusMeters,
        dto.gpsAccuracy ?? 0
      );

      if (!geofenceResult.isWithinGeofence) {
        throw new BadRequestException(geofenceResult.message);
      }
      distanceFromVenue = geofenceResult.distanceMeters;
    } else {
      if (meeting.latitude && meeting.longitude && dto.latitude && dto.longitude) {
        distanceFromVenue = calculateHaversineDistanceMeters(
          { latitude: dto.latitude, longitude: dto.longitude },
          { latitude: meeting.latitude, longitude: meeting.longitude }
        );
      }
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
      const isOnline = Boolean(
        (meeting as any).isOnline ||
        meeting.geofenceRadiusMeters >= 50000 ||
        meeting.locationName?.toLowerCase().includes('virtual') ||
        meeting.locationName?.toLowerCase().includes('online') ||
        meeting.address?.startsWith('http')
      );

      return tx.attendanceRecord.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId,
        expectedArrivalTime: meeting.expectedArrivalTime,
        actualArrivalTime: serverTimestamp,
        joinedAt: serverTimestamp,
        lastSeenAt: serverTimestamp,
        status,
        attendanceType: isOnline ? AttendanceType.ONLINE : AttendanceType.PHYSICAL,
        gpsLat: dto.latitude,
        gpsLong: dto.longitude,
        gpsAccuracy: dto.gpsAccuracy,
        distanceFromVenue,
        method: isOnline ? AttendanceMethod.ONLINE_SESSION : AttendanceMethod.SYSTEM_GEO,
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

  // -------------------------------------------------------------------------
  // Online Meeting Attendance: Primary Mechanism (Option B - Session & Heartbeat)
  // -------------------------------------------------------------------------

  async checkInOnline(dto: {
    memberId: string;
    meetingId: string;
    deviceInfo?: string;
  }) {
    if (!dto.meetingId || typeof dto.meetingId !== 'string' || !dto.meetingId.trim()) {
      throw new BadRequestException('Choose a meeting to check in');
    }
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    const serverTimestamp = new Date();

    // 1. Verify Member
    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
    });
    if (!member) throw new NotFoundException('Member profile not found');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException(`Member status is ${member.status}. Only ACTIVE members can check in.`);
    }

    // 2. Verify Meeting
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true, audiences: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'ACTIVE') {
      throw new BadRequestException('Online attendance is not currently open for this meeting');
    }
    if (serverTimestamp < meeting.attendanceOpenTime || serverTimestamp > meeting.attendanceCloseTime) {
      throw new BadRequestException('Attendance check-in is outside the allowed time window');
    }
    if (!canViewEvent(meeting.visibility, meeting.audiences, {
      memberId: member.id,
      subTeamId: member.subTeamId,
      roleInUnit: member.roleInUnit,
    })) {
      throw new BadRequestException('This event is not open to you');
    }

    // 3. Time-based Attendance Classification & Points
    const status = classifyAttendanceStatus(serverTimestamp, {
      attendanceOpenTime: meeting.attendanceOpenTime,
      expectedArrivalTime: meeting.expectedArrivalTime,
      startTime: meeting.startTime,
      gracePeriodMinutes: meeting.gracePeriodMinutes,
      attendanceCloseTime: meeting.attendanceCloseTime,
    });
    const pointsEarned = calculateAttendancePoints(
      status,
      meeting.pointWeight * meeting.category.pointWeight,
      await unitPolicy(this.prisma),
    );

    // 4. Generate cryptographically secure session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    // 5. Create or update single AttendanceRecord (guarantees ONE attendance record per member per occurrence)
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${meeting.id} FOR UPDATE`;
      const current = await tx.meeting.findUnique({ where: { id: meeting.id } });
      if (!current || current.status !== 'ACTIVE' || new Date() > current.attendanceCloseTime) {
        throw new BadRequestException('Attendance check-in is no longer open for this meeting');
      }

      const existing = await tx.attendanceRecord.findUnique({
        where: { memberId_meetingId: { memberId: dto.memberId, meetingId: dto.meetingId } },
      });

      let record;
      if (existing) {
        record = await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            sessionTokenHash,
            lastSeenAt: serverTimestamp,
            deviceInfo: dto.deviceInfo || existing.deviceInfo,
            joinedAt: existing.joinedAt ?? serverTimestamp,
            attendanceType: AttendanceType.ONLINE,
          },
          include: { meeting: { include: { category: true } }, member: true },
        });
      } else {
        record = await tx.attendanceRecord.create({
          data: {
            memberId: dto.memberId,
            meetingId: dto.meetingId,
            expectedArrivalTime: meeting.expectedArrivalTime,
            actualArrivalTime: serverTimestamp,
            joinedAt: serverTimestamp,
            lastSeenAt: serverTimestamp,
            status,
            attendanceType: AttendanceType.ONLINE,
            method: AttendanceMethod.ONLINE_SESSION,
            pointsEarned,
            sessionTokenHash,
            deviceInfo: dto.deviceInfo,
          },
          include: { meeting: { include: { category: true } }, member: true },
        });
      }
      return { record, sessionToken };
    }).then(({ record, sessionToken }) => {
      this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'calendar']);
      return {
        success: true,
        sessionToken,
        record,
        joinedAt: record.joinedAt,
        status: record.status,
        meetingId: dto.meetingId,
      };
    });
  }

  async heartbeatOnline(dto: {
    memberId: string;
    meetingId: string;
    sessionToken: string;
  }) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (!dto.meetingId || !dto.sessionToken) {
      throw new BadRequestException('Meeting ID and session token are required');
    }
    const tokenHash = crypto.createHash('sha256').update(dto.sessionToken).digest('hex');

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { memberId_meetingId: { memberId: dto.memberId, meetingId: dto.meetingId } },
      include: { meeting: true },
    });
    if (!record) {
      throw new NotFoundException('No active attendance record found');
    }
    if (record.sessionTokenHash && record.sessionTokenHash !== tokenHash) {
      throw new ForbiddenException('Invalid or expired attendance session token');
    }

    const now = new Date();
    if (record.meeting.status === 'CLOSED') {
      return {
        success: false,
        sessionClosed: true,
        durationMinutes: record.durationMinutes ?? 0,
        lastSeenAt: record.lastSeenAt,
      };
    }

    const joinedAt = record.joinedAt || record.actualArrivalTime || now;
    const durationMinutes = Math.max(1, Math.round((now.getTime() - joinedAt.getTime()) / 60000));

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        lastSeenAt: now,
        durationMinutes,
      },
    });

    return {
      success: true,
      durationMinutes: updated.durationMinutes,
      lastSeenAt: updated.lastSeenAt,
    };
  }

  async checkOutOnline(dto: {
    memberId: string;
    meetingId: string;
    sessionToken?: string;
  }) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (!dto.meetingId) throw new BadRequestException('Meeting ID is required');

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { memberId_meetingId: { memberId: dto.memberId, meetingId: dto.meetingId } },
    });
    if (!record) throw new NotFoundException('Attendance record not found');

    if (dto.sessionToken && record.sessionTokenHash) {
      const tokenHash = crypto.createHash('sha256').update(dto.sessionToken).digest('hex');
      if (tokenHash !== record.sessionTokenHash) {
        throw new ForbiddenException('Invalid session token');
      }
    }

    const now = new Date();
    const joinedAt = record.joinedAt || record.actualArrivalTime || now;
    const durationMinutes = Math.max(1, Math.round((now.getTime() - joinedAt.getTime()) / 60000));

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        leftAt: now,
        lastSeenAt: now,
        durationMinutes,
        sessionTokenHash: null,
      },
      include: { meeting: true },
    });

    this.cache.invalidateTags(['attendance', 'analytics', 'dashboard', 'leaderboard']);
    return {
      success: true,
      clockedOut: true,
      durationMinutes: updated.durationMinutes,
      leftAt: updated.leftAt,
    };
  }

  // -------------------------------------------------------------------------
  // Online Meeting Attendance: Secondary / Fallback Mechanism (Option C - Code)
  // -------------------------------------------------------------------------

  private codeAttempts = new Map<string, { count: number; resetAt: number }>();

  async generateAttendanceCode(adminUserId: string, meetingId: string, validMinutes = 45) {
    if (!meetingId) throw new BadRequestException('Meeting ID is required');
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status === 'CLOSED' || meeting.status === 'CANCELLED') {
      throw new BadRequestException('Cannot generate code for a closed or cancelled meeting');
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + Math.min(validMinutes, 120) * 60000);

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        attendanceCode: code,
        attendanceCodeExpiresAt: expiresAt,
      },
    });

    await this.audit.record({
      actorUserId: adminUserId,
      action: 'ATTENDANCE_CODE_GENERATED',
      entity: 'Meeting',
      entityId: meetingId,
      newData: { code, expiresAt },
    });

    return {
      success: true,
      code,
      expiresAt,
      validMinutes,
      meetingId,
    };
  }

  async submitAttendanceCode(dto: {
    memberId: string;
    meetingId: string;
    code: string;
  }) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (!dto.meetingId || !dto.code || !dto.code.trim()) {
      throw new BadRequestException('Meeting ID and 6-digit code are required');
    }
    const cleanCode = dto.code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new BadRequestException('Attendance code must be a 6-digit number');
    }

    const rateKey = `rate:code:${dto.memberId}:${dto.meetingId}`;
    const nowMs = Date.now();
    const attempt = this.codeAttempts.get(rateKey);
    if (attempt && attempt.resetAt > nowMs && attempt.count >= 5) {
      const waitMin = Math.ceil((attempt.resetAt - nowMs) / 60000);
      throw new BadRequestException(`Too many failed attempts. Please wait ${waitMin} minute(s) before trying again.`);
    }

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true, audiences: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'ACTIVE') {
      throw new BadRequestException('Attendance is not currently active for this meeting');
    }

    const now = new Date();
    if (!meeting.attendanceCode || meeting.attendanceCode !== cleanCode) {
      const count = (attempt && attempt.resetAt > nowMs ? attempt.count : 0) + 1;
      this.codeAttempts.set(rateKey, { count, resetAt: nowMs + 15 * 60000 });
      throw new BadRequestException('Invalid attendance code. Please check and try again.');
    }
    if (meeting.attendanceCodeExpiresAt && now > meeting.attendanceCodeExpiresAt) {
      throw new BadRequestException('This attendance code has expired. Please ask the meeting host for a new code.');
    }

    this.codeAttempts.delete(rateKey);

    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member || member.status !== 'ACTIVE') {
      throw new BadRequestException('Only active members can record attendance');
    }
    if (!canViewEvent(meeting.visibility, meeting.audiences, {
      memberId: member.id,
      subTeamId: member.subTeamId,
      roleInUnit: member.roleInUnit,
    })) {
      throw new BadRequestException('This event is not open to you');
    }

    const status = classifyAttendanceStatus(now, {
      attendanceOpenTime: meeting.attendanceOpenTime,
      expectedArrivalTime: meeting.expectedArrivalTime,
      startTime: meeting.startTime,
      gracePeriodMinutes: meeting.gracePeriodMinutes,
      attendanceCloseTime: meeting.attendanceCloseTime,
    });
    const pointsEarned = calculateAttendancePoints(
      status,
      meeting.pointWeight * meeting.category.pointWeight,
      await unitPolicy(this.prisma),
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
            lastSeenAt: now,
            attendanceType: AttendanceType.ONLINE,
            method: existing.method === AttendanceMethod.ONLINE_SESSION ? AttendanceMethod.ONLINE_SESSION : AttendanceMethod.ONLINE_CODE,
          },
          include: { meeting: { include: { category: true } }, member: true },
        });
      } else {
        record = await tx.attendanceRecord.create({
          data: {
            memberId: dto.memberId,
            meetingId: dto.meetingId,
            expectedArrivalTime: meeting.expectedArrivalTime,
            actualArrivalTime: now,
            joinedAt: now,
            lastSeenAt: now,
            status,
            attendanceType: AttendanceType.ONLINE,
            method: AttendanceMethod.ONLINE_CODE,
            pointsEarned,
          },
          include: { meeting: { include: { category: true } }, member: true },
        });
      }
      return record;
    }).then((record) => {
      this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'calendar']);
      return {
        success: true,
        record,
        status: record.status,
        method: record.method,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Online Meeting Attendance: Admin Lifecycle & Live Monitoring
  // -------------------------------------------------------------------------

  async openAttendanceSession(adminUserId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const now = new Date();
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'ACTIVE',
        attendanceOpenTime: meeting.attendanceOpenTime > now ? now : meeting.attendanceOpenTime,
      },
    });
    await this.audit.record({
      actorUserId: adminUserId,
      action: 'ATTENDANCE_SESSION_OPENED',
      entity: 'Meeting',
      entityId: meetingId,
      newData: { status: 'ACTIVE', attendanceOpenTime: updated.attendanceOpenTime },
    });
    this.cache.invalidateTags(['attendance', 'meetings', 'dashboard']);
    return { success: true, meeting: updated };
  }

  async closeAttendanceSession(adminUserId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const now = new Date();
    const openRecords = await this.prisma.attendanceRecord.findMany({
      where: { meetingId, leftAt: null, joinedAt: { not: null } },
    });
    for (const rec of openRecords) {
      const joinedAt = rec.joinedAt || rec.actualArrivalTime || now;
      const durationMinutes = Math.max(1, Math.round((now.getTime() - joinedAt.getTime()) / 60000));
      await this.prisma.attendanceRecord.update({
        where: { id: rec.id },
        data: {
          leftAt: now,
          lastSeenAt: now,
          durationMinutes,
          sessionTokenHash: null,
        },
      });
    }

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'CLOSED' },
    });

    await this.audit.record({
      actorUserId: adminUserId,
      action: 'ATTENDANCE_SESSION_CLOSED',
      entity: 'Meeting',
      entityId: meetingId,
      newData: { status: 'CLOSED' },
    });
    this.cache.invalidateTags(['attendance', 'meetings', 'dashboard', 'analytics', 'reports']);
    return { success: true, meeting: updated };
  }

  async getOnlineSessionLive(meetingId: string) {
    if (!meetingId) throw new BadRequestException('Meeting ID is required');
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        category: true,
        eventType: true,
        attendanceRecords: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
                profilePhotoUrl: true,
                roleInUnit: true,
                subTeam: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { actualArrivalTime: 'asc' },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const totalActiveMembers = await this.prisma.member.count({ where: { status: 'ACTIVE' } });
    const records = meeting.attendanceRecords;
    const now = Date.now();

    const earlyCount = records.filter((r) => r.status === 'EARLY').length;
    const onTimeCount = records.filter((r) => r.status === 'ON_TIME').length;
    const graceCount = records.filter((r) => r.status === 'GRACE_PERIOD').length;
    const lateCount = records.filter((r) => r.status === 'LATE').length;
    const presentCount = earlyCount + onTimeCount + graceCount;
    const activeInSessionCount = records.filter((r) => (r as any).lastSeenAt && (now - (r as any).lastSeenAt.getTime() < 3 * 60000) && !(r as any).leftAt).length;

    const codeActive = Boolean(
      meeting.attendanceCode &&
      meeting.attendanceCodeExpiresAt &&
      new Date() <= meeting.attendanceCodeExpiresAt
    );

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        isOnline: (meeting as any).isOnline,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        attendanceOpenTime: meeting.attendanceOpenTime,
        attendanceCloseTime: meeting.attendanceCloseTime,
        locationName: meeting.locationName,
        address: meeting.address,
        attendanceCode: codeActive ? meeting.attendanceCode : null,
        attendanceCodeExpiresAt: codeActive ? meeting.attendanceCodeExpiresAt : null,
      },
      stats: {
        totalMembers: totalActiveMembers,
        totalCheckedIn: records.length,
        presentCount,
        lateCount,
        activeInSessionCount,
        notJoinedCount: Math.max(0, totalActiveMembers - records.length),
      },
      roster: records.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        memberName: `${r.member.firstName} ${r.member.lastName}`,
        memberPhoto: r.member.profilePhotoUrl,
        subTeam: r.member.subTeam?.name || 'General',
        status: r.status,
        attendanceType: (r as any).attendanceType || 'PHYSICAL',
        method: r.method,
        joinedAt: (r as any).joinedAt || r.actualArrivalTime,
        lastSeenAt: (r as any).lastSeenAt,
        leftAt: (r as any).leftAt,
        durationMinutes: (r as any).durationMinutes || (r.actualArrivalTime && (r as any).lastSeenAt ? Math.max(1, Math.round(((r as any).lastSeenAt.getTime() - r.actualArrivalTime.getTime()) / 60000)) : null),
        pointsEarned: r.pointsEarned,
      })),
    };
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

    if (meeting.attendanceOpenTime && meeting.attendanceOpenTime > new Date()) {
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

  async getAttendanceStatus(memberId: string, meetingId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const now = new Date();

    let targetMeetingId = meetingId;
    let meeting: any = null;

    if (targetMeetingId) {
      meeting = await this.prisma.meeting.findUnique({
        where: { id: targetMeetingId },
        include: { category: true },
      });
    } else {
      // Find current open/active meeting
      meeting = await this.prisma.meeting.findFirst({
        where: {
          status: 'ACTIVE',
          attendanceOpenTime: { lte: now },
          attendanceCloseTime: { gte: now },
        },
        include: { category: true },
        orderBy: { startTime: 'asc' },
      });
      targetMeetingId = meeting?.id;
    }

    if (!targetMeetingId) {
      return {
        clockedIn: false,
        hasActiveSession: false,
        record: null,
        meeting: null,
      };
    }

    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        memberId_meetingId: {
          memberId,
          meetingId: targetMeetingId,
        },
      },
      include: {
        meeting: { include: { category: true } },
      },
    });

    const isClockedIn = Boolean(record && record.actualArrivalTime);

    return {
      clockedIn: isClockedIn,
      hasActiveSession: isClockedIn,
      record: record ?? null,
      meeting: meeting ?? record?.meeting ?? null,
    };
  }

  async clockOutMember(memberId: string, meetingId?: string, deviceInfo?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');

    let targetMeetingId = meetingId;
    if (!targetMeetingId) {
      const activeStatus = await this.getAttendanceStatus(memberId);
      targetMeetingId = activeStatus.record?.meetingId || activeStatus.meeting?.id;
    }

    if (!targetMeetingId) {
      throw new BadRequestException('No meeting selected or active for clock out');
    }

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: {
        memberId_meetingId: {
          memberId,
          meetingId: targetMeetingId,
        },
      },
      include: { meeting: true },
    });

    if (!existing) {
      throw new NotFoundException('No active clock-in record found for this meeting');
    }

    // Remove the attendance record to end the active clock-in session cleanly
    await this.prisma.attendanceRecord.delete({
      where: { id: existing.id },
    });

    this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'calendar']);

    return {
      clockedOut: true,
      clockedIn: false,
      hasActiveSession: false,
      message: 'Successfully clocked out of attendance session',
      meetingId: targetMeetingId,
    };
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
