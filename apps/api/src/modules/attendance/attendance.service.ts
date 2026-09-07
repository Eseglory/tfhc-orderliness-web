import { Prisma } from '@prisma/client';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  validateGeofence,
  classifyAttendanceStatus,
  calculateAttendancePoints,
  AttendanceStatus,
  AttendanceMethod,
} from '@tfhc/shared';
import * as crypto from 'crypto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async checkInMember(dto: {
    memberId: string;
    meetingId: string;
    latitude: number;
    longitude: number;
    gpsAccuracy?: number;
    qrPayload?: string;
    deviceInfo?: string;
  }) {
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
      include: { category: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.status !== 'ACTIVE') {
      throw new BadRequestException('Attendance check-in is not currently open for this meeting');
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

    // 5. Dynamic QR Verification (Option B) is mandatory for meetings configured with a QR secret.
    if (meeting.qrSecret) {
      if (!dto.qrPayload) {
        throw new BadRequestException('A current meeting QR code is required to check in');
      }
      try {
        const parsed = JSON.parse(dto.qrPayload);
        const expectedSignature = crypto
          .createHmac('sha256', meeting.qrSecret)
          .update(`${parsed.meetingId}:${parsed.timestamp}`)
          .digest('hex');

        if (parsed.meetingId !== meeting.id || parsed.signature !== expectedSignature) {
          throw new BadRequestException('Invalid or forged QR code scanned');
        }

        // QR payloads are short-lived and may not be issued in the future.
        const ageSeconds = (Date.now() - parsed.timestamp) / 1000;
        if (!Number.isFinite(ageSeconds) || ageSeconds < -5 || ageSeconds > 60) {
          throw new BadRequestException('Scanned QR code has expired. Please rescan current screen.');
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Failed to validate QR code payload format');
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
      meeting.pointWeight * meeting.category.pointWeight
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
        method: dto.qrPayload ? AttendanceMethod.SYSTEM_GEO_QR : AttendanceMethod.SYSTEM_GEO,
        pointsEarned,
        deviceInfo: dto.deviceInfo,
      },
      include: {
        meeting: { include: { category: true } },
        member: true,
      },
      });
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
  }) {
    if (!Object.values(AttendanceStatus).includes(dto.status)) throw new BadRequestException('Invalid attendance status');
    if (typeof dto.reason !== 'string' || !dto.reason.trim()) throw new BadRequestException('An audit reason is required');
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
      include: { category: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const pointsEarned = calculateAttendancePoints(
      dto.status,
      meeting.pointWeight * meeting.category.pointWeight
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
            actualArrivalTime: new Date(),
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
}
