import { unitPolicy } from '../../common/unit-policy';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExcuseStatus, AttendanceStatus, AttendanceMethod, calculateAttendancePoints } from '@tfhc/shared';

@Injectable()
export class ExcusesService {
  constructor(private prisma: PrismaService) {}

  async submitExcuse(dto: {
    memberId: string;
    meetingId: string;
    reason: string;
    category: string;
  }) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (typeof dto.meetingId !== 'string' || !dto.meetingId || typeof dto.reason !== 'string' || !dto.reason.trim() || dto.reason.length > 2000 || typeof dto.category !== 'string' || !dto.category.trim()) throw new BadRequestException('A meeting and reason are required');
    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can request absence');
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status === 'CANCELLED') throw new BadRequestException('This event has been cancelled');

    const existing = await this.prisma.absenceExcuse.findUnique({
      where: { memberId_meetingId: { memberId: dto.memberId, meetingId: dto.meetingId } },
    });
    if (existing) {
      throw new BadRequestException('You have already submitted an excuse for this meeting');
    }

    return this.prisma.absenceExcuse.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId,
        reason: dto.reason,
        category: dto.category,
        status: ExcuseStatus.PENDING,
      },
      include: { meeting: true, member: true },
    });
  }

  async reviewExcuse(dto: {
    excuseId: string;
    adminUserId: string;
    status: ExcuseStatus;
    reviewNote?: string;
  }) {
    if (![ExcuseStatus.APPROVED, ExcuseStatus.REJECTED].includes(dto.status)) throw new BadRequestException('Approve or reject the request');
    if (dto.reviewNote !== undefined && (typeof dto.reviewNote !== 'string' || dto.reviewNote.length > 2000)) throw new BadRequestException('Invalid review note');
    const excuse = await this.prisma.absenceExcuse.findUnique({
      where: { id: dto.excuseId },
      include: { meeting: true },
    });
    if (!excuse) throw new NotFoundException('Absence excuse request not found');

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.absenceExcuse.updateMany({ where: { id: dto.excuseId, status: ExcuseStatus.PENDING }, data: { status: dto.status } });
      if (!claimed.count) throw new BadRequestException('This request has already been reviewed');
      const updatedExcuse = await tx.absenceExcuse.update({
        where: { id: dto.excuseId },
        data: {
          status: dto.status,
          reviewedBy: dto.adminUserId,
          reviewNote: dto.reviewNote,
        },
      });

      if (dto.status === ExcuseStatus.APPROVED) {
        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            memberId_meetingId: {
              memberId: excuse.memberId,
              meetingId: excuse.meetingId,
            },
          },
        });

        let record;
        if (existingRecord) {
          record = await tx.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: {
              status: AttendanceStatus.EXCUSED,
              isModified: true,
              pointsEarned: 0,
            },
          });
        } else {
          record = await tx.attendanceRecord.create({
            data: {
              memberId: excuse.memberId,
              meetingId: excuse.meetingId,
              expectedArrivalTime: excuse.meeting.expectedArrivalTime,
              status: AttendanceStatus.EXCUSED,
              isModified: true,
              pointsEarned: 0,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: dto.adminUserId,
            action: 'ABSENCE_EXCUSE_APPROVED',
            entity: 'AttendanceRecord',
            entityId: record.id,
            previousData: existingRecord ? JSON.parse(JSON.stringify(existingRecord)) : null,
            newData: JSON.parse(JSON.stringify(record)),
            reason: `Excuse approved: ${dto.reviewNote || excuse.reason}`,
          },
        });
      }

      await tx.memberNotification.create({ data: {
        memberId: excuse.memberId, type: 'ABSENCE_DECISION',
        title: `Absence request ${dto.status === ExcuseStatus.APPROVED ? 'approved' : 'rejected'}`,
        body: `${excuse.meeting.title}: your absence request was ${dto.status.toLowerCase()}.${dto.reviewNote ? ` Admin note: ${dto.reviewNote}` : ''}`,
        data: { meetingId: excuse.meetingId, excuseId: excuse.id },
      } });
      return updatedExcuse;
    });
  }

  async getMyExcuses(memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.prisma.absenceExcuse.findMany({ where: { memberId }, include: { meeting: { select: { title: true, startTime: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async getPendingExcuses() {
    return this.prisma.absenceExcuse.findMany({
      where: { status: ExcuseStatus.PENDING },
      include: { member: { include: { subTeam: true } }, meeting: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async submitCorrectionRequest(dto: {
    memberId: string;
    meetingId: string;
    requestedStatus: AttendanceStatus;
    reason: string;
  }) {
    return this.prisma.correctionRequest.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId,
        requestedStatus: dto.requestedStatus,
        reason: dto.reason,
        status: ExcuseStatus.PENDING,
      },
      include: { meeting: true },
    });
  }

  async reviewCorrection(dto: {
    correctionId: string;
    adminUserId: string;
    status: ExcuseStatus;
  }) {
    if (![ExcuseStatus.APPROVED, ExcuseStatus.REJECTED].includes(dto.status)) throw new BadRequestException('Approve or reject the request');
    const correction = await this.prisma.correctionRequest.findUnique({
      where: { id: dto.correctionId },
      include: { meeting: { include: { category: true } } },
    });
    if (!correction) throw new NotFoundException('Correction request not found');

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.correctionRequest.updateMany({where:{id:dto.correctionId,status:ExcuseStatus.PENDING},data:{status:dto.status}});
      if (!claimed.count) throw new BadRequestException('This request has already been reviewed');
      const updated = await tx.correctionRequest.update({
        where: { id: dto.correctionId },
        data: {
          status: dto.status,
          reviewedBy: dto.adminUserId,
        },
      });

      if (dto.status === ExcuseStatus.APPROVED) {
        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            memberId_meetingId: {
              memberId: correction.memberId,
              meetingId: correction.meetingId,
            },
          },
        });

        let record;
        if (existingRecord) {
          record = await tx.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: {
              status: correction.requestedStatus,
              pointsEarned: calculateAttendancePoints(correction.requestedStatus as AttendanceStatus, correction.meeting.pointWeight * correction.meeting.category.pointWeight, await unitPolicy(tx)),
              method: AttendanceMethod.CORRECTION_APPROVED,
              isModified: true,
            },
          });
        }

        if (!existingRecord) {
          record = await tx.attendanceRecord.create({ data: { memberId: correction.memberId, meetingId: correction.meetingId, expectedArrivalTime: correction.meeting.expectedArrivalTime, status: correction.requestedStatus, method: AttendanceMethod.CORRECTION_APPROVED, isModified: true, pointsEarned: calculateAttendancePoints(correction.requestedStatus as AttendanceStatus, correction.meeting.pointWeight * correction.meeting.category.pointWeight, await unitPolicy(tx)) } });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: dto.adminUserId,
            action: 'CORRECTION_REQUEST_APPROVED',
            entity: 'AttendanceRecord',
            entityId: record?.id || 'N/A',
            previousData: existingRecord ? JSON.parse(JSON.stringify(existingRecord)) : null,
            newData: record ? JSON.parse(JSON.stringify(record)) : null,
            reason: `Correction approved: ${correction.reason}`,
          },
        });
      }

      await tx.memberNotification.create({data:{memberId:correction.memberId,type:'CORRECTION_DECISION',title:`Attendance correction ${dto.status.toLowerCase()}`,body:`${correction.meeting.title}: ${dto.status.toLowerCase()}`,data:{meetingId:correction.meetingId}}});
      return updated;
    });
  }

  async getPendingCorrections() {
    return this.prisma.correctionRequest.findMany({
      where: { status: ExcuseStatus.PENDING },
      include: { member: { include: { subTeam: true } }, meeting: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
