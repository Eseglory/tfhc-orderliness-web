import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExcuseStatus, AttendanceStatus, AttendanceMethod } from '@tfhc/shared';

@Injectable()
export class ExcusesService {
  constructor(private prisma: PrismaService) {}

  async submitExcuse(dto: {
    memberId: string;
    meetingId: string;
    reason: string;
    category: string;
  }) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: dto.meetingId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

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
    const excuse = await this.prisma.absenceExcuse.findUnique({
      where: { id: dto.excuseId },
      include: { meeting: true },
    });
    if (!excuse) throw new NotFoundException('Absence excuse request not found');

    return this.prisma.$transaction(async (tx) => {
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

      return updatedExcuse;
    });
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
    const correction = await this.prisma.correctionRequest.findUnique({
      where: { id: dto.correctionId },
      include: { meeting: { include: { category: true } } },
    });
    if (!correction) throw new NotFoundException('Correction request not found');

    return this.prisma.$transaction(async (tx) => {
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
              method: AttendanceMethod.CORRECTION_APPROVED,
              isModified: true,
            },
          });
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
