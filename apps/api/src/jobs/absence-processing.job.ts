import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus, MemberStatus, AttendanceStatus } from '@tfhc/shared';

@Injectable()
export class AbsenceProcessingJob {
  private readonly logger = new Logger(AbsenceProcessingJob.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async processClosedMeetings() {
    const now = new Date();

    // Find meetings whose attendance window has closed but are not yet marked CLOSED
    const expiredMeetings = await this.prisma.meeting.findMany({
      where: {
        status: MeetingStatus.ACTIVE,
        attendanceCloseTime: { lte: now },
      },
    });

    if (expiredMeetings.length === 0) return;

    this.logger.log(`Found ${expiredMeetings.length} meeting(s) due for automatic close-out.`);

    for (const meeting of expiredMeetings) {
      await this.closeMeetingAndProcessAbsences(meeting.id);
    }
  }

  async closeMeetingAndProcessAbsences(meetingId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Atomic state update
      const updated = await tx.meeting.updateMany({
        where: { id: meetingId, status: MeetingStatus.ACTIVE },
        data: { status: MeetingStatus.CLOSED },
      });

      if (updated.count === 0) return; // Already processed by another worker

      const meeting = await tx.meeting.findUnique({ where: { id: meetingId } });

      // Optional parallel services only expect committed members and actual attendees.
      const activeMembers = await tx.member.findMany({
        where: { status: MemberStatus.ACTIVE, ...(meeting.isCompulsory ? {} : { OR: [{ eventResponses: { some: { meetingId, attending: true } } }, { AND: [{ eventResponses: { none: { meetingId } } }, { serviceCommitments: { some: { meetingId, status: 'COMMITTED' } } }] }, { attendanceRecords: { some: { meetingId } } }] }) },
      });

      // 3. Query members who already checked in or submitted an approved excuse
      const existingRecords = await tx.attendanceRecord.findMany({
        where: { meetingId },
      });
      const checkedInMemberIds = new Set(existingRecords.map((r) => r.memberId));

      // 4. Batch insert ABSENT records for missing active members
      const absentMembers = activeMembers.filter((m) => !checkedInMemberIds.has(m.id));

      if (absentMembers.length > 0) {
        await tx.attendanceRecord.createMany({
          data: absentMembers.map((m) => ({
            memberId: m.id,
            meetingId,
            expectedArrivalTime: meeting.expectedArrivalTime,
            status: AttendanceStatus.ABSENT,
            pointsEarned: 0,
          })),
        });
      }

      // 5. Generate Immutable Meeting Summary
      const allRecords = await tx.attendanceRecord.findMany({ where: { meetingId } });

      const expectedCount = allRecords.filter(r => !['EXCUSED', 'EXEMPT'].includes(r.status)).length;
      const earlyCount = allRecords.filter((r) => r.status === AttendanceStatus.EARLY).length;
      const onTimeCount = allRecords.filter((r) => r.status === AttendanceStatus.ON_TIME).length;
      const gracePeriodCount = allRecords.filter((r) => r.status === AttendanceStatus.GRACE_PERIOD).length;
      const lateCount = allRecords.filter((r) => r.status === AttendanceStatus.LATE).length;
      const excusedCount = allRecords.filter((r) => r.status === AttendanceStatus.EXCUSED).length;
      const absentCount = allRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length;

      const presentCount = earlyCount + onTimeCount + gracePeriodCount + lateCount;
      const attendanceRate = expectedCount > 0 ? (presentCount / expectedCount) * 100 : 0;
      const punctualityRate = presentCount > 0 ? ((earlyCount + onTimeCount) / presentCount) * 100 : 0;

      await tx.meetingSummary.create({
        data: {
          meetingId,
          expectedCount,
          presentCount,
          absentCount,
          earlyCount,
          onTimeCount,
          gracePeriodCount,
          lateCount,
          excusedCount,
          attendanceRate: Math.round(attendanceRate * 10) / 10,
          punctualityRate: Math.round(punctualityRate * 10) / 10,
        },
      });

      this.logger.log(
        `Closed meeting ${meetingId}. Summary: Expected=${expectedCount}, Present=${presentCount}, Absent=${absentCount}`
      );
    });
  }
}
