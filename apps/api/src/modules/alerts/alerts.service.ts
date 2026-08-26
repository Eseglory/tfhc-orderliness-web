import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus, AttendanceStatus } from '@tfhc/shared';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async evaluateFollowUpFlags() {
    const activeMembers = await this.prisma.member.findMany({
      where: { status: MemberStatus.ACTIVE },
      include: {
        subTeam: true,
        attendanceRecords: {
          include: { meeting: true },
          orderBy: { meeting: { startTime: 'desc' } },
        },
      },
    });

    const newlyFlaggedMembers = [];

    for (const member of activeMembers) {
      const records = member.attendanceRecords;
      if (records.length === 0) continue;

      // Rule 1: 2 Consecutive Absences -> Level 1 (Follow-Up Required)
      let consecutiveAbsences = 0;
      for (const r of records) {
        if (r.status === AttendanceStatus.ABSENT) {
          consecutiveAbsences++;
        } else if (r.status !== AttendanceStatus.EXCUSED && r.status !== AttendanceStatus.EXEMPT) {
          break;
        }
      }

      if (consecutiveAbsences >= 2) {
        await this.createOrUpdateFlag(
          member.id,
          1,
          `Member has ${consecutiveAbsences} consecutive unexcused absences.`
        );
        newlyFlaggedMembers.push({ memberId: member.id, level: 1 });
      }

      // Rule 2: 3 Total Absences -> Level 2 (Attendance Warning)
      const totalAbsences = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
      if (totalAbsences >= 3) {
        await this.createOrUpdateFlag(
          member.id,
          2,
          `Member has ${totalAbsences} total absences.`
        );
        newlyFlaggedMembers.push({ memberId: member.id, level: 2 });
      }

      // Rule 3: <70% Attendance Rate -> Level 3 (Leadership Review)
      const attendedCount = records.filter(
        (r) =>
          r.status === AttendanceStatus.EARLY ||
          r.status === AttendanceStatus.ON_TIME ||
          r.status === AttendanceStatus.GRACE_PERIOD ||
          r.status === AttendanceStatus.LATE
      ).length;
      const rate = (attendedCount / records.length) * 100;

      if (records.length >= 5 && rate < 70) {
        await this.createOrUpdateFlag(
          member.id,
          3,
          `Attendance rate is ${Math.round(rate)}%, below the 70% benchmark threshold.`
        );
        newlyFlaggedMembers.push({ memberId: member.id, level: 3 });
      }
    }

    return newlyFlaggedMembers;
  }

  private async createOrUpdateFlag(memberId: string, flagLevel: number, flagReason: string) {
    const existing = await this.prisma.followUpFlag.findFirst({
      where: { memberId, flagLevel, isResolved: false },
    });

    if (!existing) {
      await this.prisma.followUpFlag.create({
        data: {
          memberId,
          flagLevel,
          flagReason,
          isResolved: false,
        },
      });
    }
  }

  async getActiveFlags() {
    return this.prisma.followUpFlag.findMany({
      where: { isResolved: false },
      include: {
        member: { include: { subTeam: true } },
      },
      orderBy: [{ flagLevel: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async resolveFlag(flagId: string, notes?: string) {
    return this.prisma.followUpFlag.update({
      where: { id: flagId },
      data: {
        isResolved: true,
        notes,
      },
    });
  }
}
