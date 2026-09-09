import { unitPolicy, DEFAULT_UNIT_POLICY } from '../../common/unit-policy';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async teams() { return this.prisma.subTeam.findMany({select:{id:true,name:true},orderBy:{name:'asc'}}); }

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
      orderBy: [{ meeting: { startTime: 'desc' } }, { id: 'desc' }],
    });

    return this.summarizePerformance(member, records, await unitPolicy(this.prisma));
  }

  private summarizePerformance(member: any, records: any[], policy = DEFAULT_UNIT_POLICY) {
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
    const expectedCount = records.filter(r => r.status !== AttendanceStatus.EXCUSED && r.status !== AttendanceStatus.EXEMPT).length;
    const attendedCount = attendedRecords.length;

    const attendanceRate = calculateAttendancePercentage(attendedCount, expectedCount);
    const punctualityRate = calculatePunctualityPercentage(onTimeCount, attendedCount);
    const compositeScore = calculateCompositeLeaderboardScore(attendanceRate, punctualityRate, policy.attendanceWeight, policy.punctualityWeight);

    const streakData = records.map((r) => ({
      meetingDate: r.meeting.startTime,
      status: r.status as unknown as AttendanceStatus,
    }));
    const { currentAttendanceStreak, currentOnTimeStreak } = calculateAttendanceStreaks(streakData);

    return {
      member,
      expectedCount,
      scoringWeights: { attendance: policy.attendanceWeight, punctuality: policy.punctualityWeight },
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

  private readonly pendingLeaderboards = new Map<string, Promise<any[]>>();

  async getLeaderboard(query?: { subTeamId?: string; startDate?: string; endDate?: string; limit?: number }) {
    const key = JSON.stringify([query?.subTeamId, query?.startDate, query?.endDate, query?.limit]);
    const pending = this.pendingLeaderboards.get(key);
    if (pending) return pending;
    const calculation = this.calculateLeaderboard(query);
    this.pendingLeaderboards.set(key, calculation);
    try { return await calculation; }
    finally { if (this.pendingLeaderboards.get(key) === calculation) this.pendingLeaderboards.delete(key); }
  }

  private async calculateLeaderboard(query?: {
    subTeamId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    if (query?.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000)) throw new BadRequestException('Limit must be between 1 and 1000');
    const policy = await unitPolicy(this.prisma);
    const activeMembers = await this.prisma.member.findMany({
      where: {
        status: MemberStatus.ACTIVE,
        ...(query?.subTeamId ? { subTeamId: query.subTeamId } : {}),
      },
      include: { subTeam: true },
    });

    const start = query?.startDate ? new Date(query.startDate) : undefined;
    const end = query?.endDate ? new Date(query.endDate) : undefined;
    if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && start > end)) throw new BadRequestException('Invalid date range');
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) end.setUTCHours(23, 59, 59, 999);
    // Aggregate in PostgreSQL so each request returns one row per member,
    // rather than transferring the entire attendance history into Node.
    const summaries = await this.prisma.$queryRaw<Array<{
      memberId: string; expectedCount: number; attendedCount: number; onTimeCount: number;
      totalPoints: number; currentAttendanceStreak: number; currentOnTimeStreak: number;
    }>>(Prisma.sql`
      WITH filtered AS MATERIALIZED (
        SELECT a."id", a."memberId", a."status", a."pointsEarned", mt."startTime"
        FROM attendance_records a
        JOIN members m ON m.id = a."memberId"
        JOIN meetings mt ON mt.id = a."meetingId"
        WHERE m.status = 'ACTIVE'
          ${query?.subTeamId ? Prisma.sql`AND m."subTeamId" = ${query.subTeamId}` : Prisma.empty}
          ${start ? Prisma.sql`AND mt."startTime" >= ${start}` : Prisma.empty}
          ${end ? Prisma.sql`AND mt."startTime" <= ${end}` : Prisma.empty}
      ), ordered AS (
        SELECT "memberId", status,
          row_number() OVER (PARTITION BY "memberId" ORDER BY "startTime" DESC, id DESC) AS position
        FROM filtered WHERE status NOT IN ('EXEMPT', 'EXCUSED')
      ), streaks AS (
        SELECT "memberId",
          COALESCE(MIN(position) FILTER (WHERE status NOT IN ('EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE')) - 1, COUNT(*))::int AS "currentAttendanceStreak",
          COALESCE(MIN(position) FILTER (WHERE status NOT IN ('EARLY', 'ON_TIME')) - 1, COUNT(*))::int AS "currentOnTimeStreak"
        FROM ordered GROUP BY "memberId"
      )
      SELECT f."memberId", COUNT(*) FILTER (WHERE f.status NOT IN ('EXCUSED', 'EXEMPT'))::int AS "expectedCount",
        COUNT(*) FILTER (WHERE f.status IN ('EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'))::int AS "attendedCount",
        COUNT(*) FILTER (WHERE f.status IN ('EARLY', 'ON_TIME'))::int AS "onTimeCount",
        SUM(f."pointsEarned")::float8 AS "totalPoints",
        COALESCE(s."currentAttendanceStreak", 0)::int AS "currentAttendanceStreak",
        COALESCE(s."currentOnTimeStreak", 0)::int AS "currentOnTimeStreak"
      FROM filtered f LEFT JOIN streaks s ON s."memberId" = f."memberId"
      GROUP BY f."memberId", s."currentAttendanceStreak", s."currentOnTimeStreak"
    `);
    const byMember = new Map(summaries.map(summary => [summary.memberId, summary]));
    const leaderboardItems = activeMembers.map(member => {
      const summary = byMember.get(member.id);
      const attendedCount = summary?.attendedCount ?? 0;
      const expectedCount = summary?.expectedCount ?? 0;
      const attendanceRate = calculateAttendancePercentage(attendedCount, expectedCount);
      const punctualityRate = calculatePunctualityPercentage(summary?.onTimeCount ?? 0, attendedCount);
      return {
        memberId: member.id, memberCode: member.memberCode,
        firstName: member.firstName, lastName: member.lastName,
        subTeamName: member.subTeam?.name || 'Unassigned',
        attendanceRate, punctualityRate,
        totalPoints: Math.round((summary?.totalPoints ?? 0) * 10) / 10,
        compositeScore: calculateCompositeLeaderboardScore(attendanceRate, punctualityRate, policy.attendanceWeight, policy.punctualityWeight),
        currentAttendanceStreak: summary?.currentAttendanceStreak ?? 0,
        currentOnTimeStreak: summary?.currentOnTimeStreak ?? 0,
        attendedCount, expectedCount,
      };
    });

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
