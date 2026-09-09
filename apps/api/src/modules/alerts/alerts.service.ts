import { unitPolicy } from '../../common/unit-policy';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus, AttendanceStatus } from '@tfhc/shared';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async evaluateFollowUpFlags() {
    const policy = await unitPolicy(this.prisma);
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

      if (consecutiveAbsences >= policy.followUpAbsences) {
        await this.createOrUpdateFlag(
          member.id,
          1,
          `Member has ${consecutiveAbsences} consecutive unexcused absences.`
        );
        newlyFlaggedMembers.push({ memberId: member.id, level: 1 });
      }

      // Rule 2: 3 Total Absences -> Level 2 (Attendance Warning)
      const totalAbsences = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
      if (totalAbsences >= policy.warningAbsences) {
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
      const expectedCount = records.filter(r => !['EXCUSED', 'EXEMPT'].includes(r.status)).length;
      const rate = expectedCount ? (attendedCount / expectedCount) * 100 : 0;

      if (expectedCount >= policy.minimumMeetings && rate < policy.reviewAttendanceBelow) {
        await this.createOrUpdateFlag(
          member.id,
          3,
          `Attendance rate is ${Math.round(rate)}%, below the ${policy.reviewAttendanceBelow}% benchmark threshold.`
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
