import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateAttendancePercentage,
  calculatePunctualityPercentage,
  calculateCompositeLeaderboardScore,
  calculateAttendanceStreaks,
  AttendanceStatus,
  MemberStatus,
} from '@tfhc/shared';

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  async getMemberPerformance(memberId: string, query?: { startDate?: string; endDate?: string }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const start = query?.startDate ? new Date(query.startDate) : undefined;
    const end = query?.endDate ? new Date(query.endDate) : undefined;
    if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && start > end)) throw new BadRequestException('Invalid date range');
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) end.setUTCHours(23, 59, 59, 999);
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { subTeam: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const records = await this.prisma.attendanceRecord.findMany({
      where: { memberId, ...(start || end ? { meeting: { startTime: { gte: start, lte: end } } } : {}) },
      include: { meeting: { include: { category: true } } },
      orderBy: { meeting: { startTime: 'desc' } },
    });

    const attendedRecords = records.filter(
      (r) =>
        r.status === AttendanceStatus.EARLY ||
        r.status === AttendanceStatus.ON_TIME ||
        r.status === AttendanceStatus.GRACE_PERIOD ||
        r.status === AttendanceStatus.LATE
    );

    const onTimeCount = records.filter(
      (r) => r.status === AttendanceStatus.EARLY || r.status === AttendanceStatus.ON_TIME
    ).length;

    const lateCount = records.filter((r) => r.status === AttendanceStatus.LATE).length;
    const absentCount = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
    const excusedCount = records.filter((r) => r.status === AttendanceStatus.EXCUSED).length;

    const totalPoints = records.reduce((sum, r) => sum + r.pointsEarned, 0);
    const expectedCount = records.length;
    const attendedCount = attendedRecords.length;

    const attendanceRate = calculateAttendancePercentage(attendedCount, expectedCount);
    const punctualityRate = calculatePunctualityPercentage(onTimeCount, attendedCount);
    const compositeScore = calculateCompositeLeaderboardScore(attendanceRate, punctualityRate);

    const streakData = records.map((r) => ({
      meetingDate: r.meeting.startTime,
      status: r.status as unknown as AttendanceStatus,
    }));
    const { currentAttendanceStreak, currentOnTimeStreak } = calculateAttendanceStreaks(streakData);

    return {
      member,
      expectedCount,
      attendedCount,
      onTimeCount,
      lateCount,
      absentCount,
      excusedCount,
      totalPoints: Math.round(totalPoints * 10) / 10,
      attendanceRate,
      punctualityRate,
      compositeScore,
      currentAttendanceStreak,
      currentOnTimeStreak,
      recentRecords: records.slice(0, 10),
    };
  }

  async getLeaderboard(query?: {
    subTeamId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    if (query?.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000)) throw new BadRequestException('Limit must be between 1 and 1000');
    const activeMembers = await this.prisma.member.findMany({
      where: {
        status: MemberStatus.ACTIVE,
        ...(query?.subTeamId ? { subTeamId: query.subTeamId } : {}),
      },
      include: { subTeam: true },
    });

    const leaderboardItems = await Promise.all(
      activeMembers.map(async (member) => {
        const perf = await this.getMemberPerformance(member.id, query);
        return {
          memberId: member.id,
          memberCode: member.memberCode,
          firstName: member.firstName,
          lastName: member.lastName,
          subTeamName: member.subTeam?.name || 'Unassigned',
          attendanceRate: perf.attendanceRate,
          punctualityRate: perf.punctualityRate,
          totalPoints: perf.totalPoints,
          compositeScore: perf.compositeScore,
          currentAttendanceStreak: perf.currentAttendanceStreak,
          currentOnTimeStreak: perf.currentOnTimeStreak,
          attendedCount: perf.attendedCount,
          expectedCount: perf.expectedCount,
        };
      })
    );

    // Deterministic ranking & tie-breaking:
    // 1. Composite Score Descending
    // 2. Total Points Descending
    // 3. Punctuality Rate Descending
    // 4. Last Name Ascending
    leaderboardItems.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.punctualityRate !== a.punctualityRate) return b.punctualityRate - a.punctualityRate;
      return a.lastName.localeCompare(b.lastName);
    });

    const limit = query?.limit || 50;
    return leaderboardItems.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
  }
}
