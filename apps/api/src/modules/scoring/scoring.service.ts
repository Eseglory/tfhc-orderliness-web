import { unitPolicy, DEFAULT_UNIT_POLICY } from '../../common/unit-policy';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MeetingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import {
  calculateAttendancePercentage,
  calculatePunctualityPercentage,
  calculateCompositeLeaderboardScore,
  calculateAttendanceStreaks,
  AttendanceStatus,
  MemberStatus,
} from '@tfhc/shared';

export interface LeaderboardQueryDto {
  subTeamId?: string;
  activityType?: 'ALL' | 'EVENT' | 'SERVICE' | 'MEETING';
  categoryId?: string;
  statusFilter?: 'ALL' | 'PERFECT' | 'MISSED';
  startDate?: string;
  endDate?: string;
  limit?: number;
  search?: string;
}

export interface AnalyticsQueryDto {
  days?: number;
  startDate?: string;
  endDate?: string;
  activityType?: 'ALL' | 'EVENT' | 'SERVICE' | 'MEETING';
  categoryId?: string;
  subTeamId?: string;
  memberId?: string;
}

@Injectable()
export class ScoringService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async recognition() {
    const policy = await unitPolicy(this.prisma);
    const ranked = await this.getLeaderboard({ limit: 1000 });
    return {
      criteria: {
        minimumMeetings: policy.minimumMeetings,
        attendance: policy.rewardAttendance,
        punctuality: policy.rewardPunctuality,
      },
      members: ranked.filter(
        (member) =>
          member.expectedCount >= policy.minimumMeetings &&
          member.attendanceRate >= policy.rewardAttendance &&
          member.punctualityRate >= policy.rewardPunctuality
      ),
    };
  }

  async teams() {
    return this.prisma.subTeam.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async getMemberPerformance(memberId: string, query?: { startDate?: string; endDate?: string }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    const start = query?.startDate ? new Date(query.startDate) : undefined;
    const end = query?.endDate ? new Date(query.endDate) : undefined;
    if (
      (start && !Number.isFinite(start.getTime())) ||
      (end && !Number.isFinite(end.getTime())) ||
      (start && end && start > end)
    ) {
      throw new BadRequestException('Invalid date range');
    }
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(query.endDate!)) end.setUTCHours(23, 59, 59, 999);

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { subTeam: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        memberId,
        ...(start || end ? { meeting: { startTime: { gte: start, lte: end } } } : {}),
      },
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
    const expectedCount = records.filter(
      (r) => r.status !== AttendanceStatus.EXCUSED && r.status !== AttendanceStatus.EXEMPT
    ).length;
    const attendedCount = attendedRecords.length;

    const attendanceRate = calculateAttendancePercentage(attendedCount, expectedCount);
    const punctualityRate = calculatePunctualityPercentage(onTimeCount, attendedCount);
    const compositeScore = calculateCompositeLeaderboardScore(
      attendanceRate,
      punctualityRate,
      policy.attendanceWeight,
      policy.punctualityWeight
    );

    const streakData = records.map((r) => ({
      meetingDate: r.meeting.startTime,
      status: r.status as unknown as AttendanceStatus,
    }));
    const { currentAttendanceStreak, currentOnTimeStreak } = calculateAttendanceStreaks(streakData);

    const servicesAttended = records.filter(
      (r) =>
        ['Sunday Service', 'Midweek Service'].includes(r.meeting.category?.name) &&
        ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
    ).length;
    const eventsAttended = records.filter(
      (r) =>
        ['Special Programme'].includes(r.meeting.category?.name) &&
        ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
    ).length;
    const meetingsAttended = records.filter(
      (r) =>
        ['Unit Meeting', 'Training'].includes(r.meeting.category?.name) &&
        ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)
    ).length;

    return {
      member,
      expectedCount,
      scoringWeights: { attendance: policy.attendanceWeight, punctuality: policy.punctualityWeight },
      recognition: {
        eligible:
          expectedCount >= policy.minimumMeetings &&
          attendanceRate >= policy.rewardAttendance &&
          punctualityRate >= policy.rewardPunctuality,
        minimumMeetings: policy.minimumMeetings,
        attendanceThreshold: policy.rewardAttendance,
        punctualityThreshold: policy.rewardPunctuality,
      },
      attendedCount,
      onTimeCount,
      lateCount,
      absentCount,
      excusedCount,
      servicesAttended,
      eventsAttended,
      meetingsAttended,
      totalPoints: Math.round(totalPoints * 10) / 10,
      attendanceRate,
      punctualityRate,
      compositeScore,
      currentAttendanceStreak,
      currentOnTimeStreak,
      missedSessions: Math.max(0, expectedCount - attendedCount),
      isPerfectAttendance: expectedCount > 0 && attendedCount === expectedCount,
      recentRecords: records.slice(0, 10),
    };
  }

  async getLeaderboard(query?: LeaderboardQueryDto) {
    const key = JSON.stringify([
      query?.subTeamId,
      query?.activityType,
      query?.categoryId,
      query?.statusFilter,
      query?.startDate,
      query?.endDate,
      query?.limit,
      query?.search,
    ]);
    return this.cache.wrap(`leaderboard:${key}`, 60, () => this.calculateLeaderboard(query), ['leaderboard', 'attendance']);
  }

  private async calculateLeaderboard(query?: LeaderboardQueryDto) {
    if (query?.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000)) {
      throw new BadRequestException('Limit must be between 1 and 1000');
    }
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
    if (
      (start && !Number.isFinite(start.getTime())) ||
      (end && !Number.isFinite(end.getTime())) ||
      (start && end && start > end)
    ) {
      throw new BadRequestException('Invalid date range');
    }
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(query.endDate!)) end.setUTCHours(23, 59, 59, 999);

    const activitySql =
      query?.activityType === 'SERVICE'
        ? Prisma.sql`AND (et."key" IN ('SERVICE', 'SPECIAL_SERVICE', 'PRAYER') OR c."name" IN ('Sunday Service', 'Midweek Service'))`
        : query?.activityType === 'EVENT'
        ? Prisma.sql`AND (et."key" NOT IN ('SERVICE', 'SPECIAL_SERVICE', 'PRAYER') OR c."name" = 'Special Programme')`
        : query?.activityType === 'MEETING'
        ? Prisma.sql`AND (et."key" = 'MEETING' OR c."name" IN ('Unit Meeting', 'Training'))`
        : Prisma.empty;

    // Aggregate in PostgreSQL so each request returns one row per member
    const summaries = await this.prisma.$queryRaw<
      Array<{
        memberId: string;
        expectedCount: number;
        attendedCount: number;
        onTimeCount: number;
        totalPoints: number;
        currentAttendanceStreak: number;
        currentOnTimeStreak: number;
      }>
    >(Prisma.sql`
      WITH filtered AS MATERIALIZED (
        SELECT a."id", a."memberId", a."status", a."pointsEarned", mt."startTime"
        FROM attendance_records a
        JOIN members m ON m.id = a."memberId"
        JOIN meetings mt ON mt.id = a."meetingId"
        LEFT JOIN event_types et ON et.id = mt."eventTypeId"
        LEFT JOIN meeting_categories c ON c.id = mt."categoryId"
        WHERE m.status = 'ACTIVE'
          ${query?.subTeamId ? Prisma.sql`AND m."subTeamId" = ${query.subTeamId}` : Prisma.empty}
          ${query?.categoryId ? Prisma.sql`AND mt."categoryId" = ${query.categoryId}` : Prisma.empty}
          ${activitySql}
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

    const byMember = new Map(summaries.map((summary) => [summary.memberId, summary]));
    let leaderboardItems = activeMembers.map((member) => {
      const summary = byMember.get(member.id);
      const attendedCount = summary?.attendedCount ?? 0;
      const expectedCount = summary?.expectedCount ?? 0;
      const attendanceRate = calculateAttendancePercentage(attendedCount, expectedCount);
      const punctualityRate = calculatePunctualityPercentage(summary?.onTimeCount ?? 0, attendedCount);
      const isPerfectAttendance = expectedCount > 0 && attendedCount === expectedCount;
      const missedSessions = Math.max(0, expectedCount - attendedCount);

      return {
        memberId: member.id,
        memberCode: member.memberCode,
        firstName: member.firstName,
        lastName: member.lastName,
        memberName: `${member.firstName} ${member.lastName}`,
        profilePhotoUrl: member.profilePhotoUrl || null,
        subTeamName: member.subTeam?.name || 'Unassigned',
        attendanceRate,
        punctualityRate,
        totalPoints: Math.round((summary?.totalPoints ?? 0) * 10) / 10,
        compositeScore: calculateCompositeLeaderboardScore(
          attendanceRate,
          punctualityRate,
          policy.attendanceWeight,
          policy.punctualityWeight
        ),
        currentAttendanceStreak: summary?.currentAttendanceStreak ?? 0,
        currentOnTimeStreak: summary?.currentOnTimeStreak ?? 0,
        attendedCount,
        expectedCount,
        missedSessions,
        isPerfectAttendance,
      };
    });

    // Search filter
    if (query?.search && query.search.trim()) {
      const q = query.search.toLowerCase().trim();
      leaderboardItems = leaderboardItems.filter(
        (i) =>
          i.firstName.toLowerCase().includes(q) ||
          i.lastName.toLowerCase().includes(q) ||
          i.memberCode.toLowerCase().includes(q) ||
          i.subTeamName.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (query?.statusFilter === 'PERFECT') {
      leaderboardItems = leaderboardItems.filter((i) => i.isPerfectAttendance);
    } else if (query?.statusFilter === 'MISSED') {
      leaderboardItems = leaderboardItems.filter((i) => i.missedSessions > 0);
    }

    // Deterministic ranking & tie-breaking:
    // 1. Composite Score Descending
    // 2. Attended Count Descending
    // 3. Total Points Descending
    // 4. Punctuality Rate Descending
    // 5. Last Name Ascending
    leaderboardItems.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      if (b.attendedCount !== a.attendedCount) return b.attendedCount - a.attendedCount;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.punctualityRate !== a.punctualityRate) return b.punctualityRate - a.punctualityRate;
      return a.lastName.localeCompare(b.lastName);
    });

    const limit = query?.limit || 50;
    return leaderboardItems.slice(0, limit).map((item, index) => {
      let medal: string | null = null;
      if (index === 0) medal = '🥇 1st';
      else if (index === 1) medal = '🥈 2nd';
      else if (index === 2) medal = '🥉 3rd';

      return {
        rank: index + 1,
        medal,
        ...item,
      };
    });
  }

  async getAdvancedAttendanceAnalytics(dto: AnalyticsQueryDto) {
    const key = JSON.stringify([
      dto.days,
      dto.startDate,
      dto.endDate,
      dto.activityType,
      dto.categoryId,
      dto.subTeamId,
      dto.memberId,
    ]);
    return this.cache.wrap(`analytics:${key}`, 60, () => this.calculateAdvancedAttendanceAnalytics(dto), ['analytics', 'attendance']);
  }

  private async calculateAdvancedAttendanceAnalytics(dto: AnalyticsQueryDto) {
    const days = dto.days || 30;
    const now = dto.endDate
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dto.endDate) ? `${dto.endDate}T23:59:59.999+01:00` : dto.endDate)
      : new Date();
    const since = dto.startDate
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dto.startDate) ? `${dto.startDate}T00:00:00+01:00` : dto.startDate)
      : new Date(now.getTime() - days * 86400000);

    if (!Number.isFinite(now.getTime()) || !Number.isFinite(since.getTime()) || since > now) {
      throw new BadRequestException('Choose a valid reporting date range');
    }

    const memberFilter = {
      ...(dto.memberId ? { memberId: dto.memberId } : {}),
      ...(dto.subTeamId ? { member: { subTeamId: dto.subTeamId } } : {}),
    };

    const meetings: any[] = await this.prisma.meeting.findMany({
      where: {
        startTime: { gte: since, lte: now },
        status: { in: [MeetingStatus.ACTIVE, MeetingStatus.CLOSED] },
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      },
      include: {
        category: true,
        eventType: true,
        attendanceRecords: {
          where: memberFilter,
          include: { member: { select: { id: true, firstName: true, lastName: true, memberCode: true } } },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // 1. Overview Totals
    let totalAttendance = 0;
    let punctualAttendance = 0;
    let absentCount = 0;
    let excusedCount = 0;
    const uniqueAttendees = new Set<string>();
    const trendMap = new Map<string, { date: string; attended: number; punctual: number; absent: number }>();
    const serviceMap = new Map<
      string,
      {
        id: string;
        name: string;
        categoryId: string;
        sessionsCount: number;
        totalAttended: number;
        uniqueMemberIds: Set<string>;
        attendances: number[];
        sessions: any[];
      }
    >();

    const activityCounts = {
      services: 0,
      events: 0,
      meetings: 0,
    };

    for (const m of meetings) {
      const dateKey = m.startTime.toISOString().split('T')[0];
      let mAttended = 0;
      let mPunctual = 0;
      let mAbsent = 0;

      for (const rec of (m.attendanceRecords || [])) {
        if (['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(rec.status)) {
          totalAttendance++;
          mAttended++;
          uniqueAttendees.add(rec.memberId);
          if (['EARLY', 'ON_TIME'].includes(rec.status)) {
            punctualAttendance++;
            mPunctual++;
          }

          // Category classification
          if (['Sunday Service', 'Midweek Service'].includes(m.category?.name || '')) {
            activityCounts.services++;
          } else if (['Special Programme'].includes(m.category?.name || '')) {
            activityCounts.events++;
          } else {
            activityCounts.meetings++;
          }
        } else if (rec.status === 'ABSENT') {
          absentCount++;
          mAbsent++;
        } else if (rec.status === 'EXCUSED') {
          excusedCount++;
        }
      }

      // Trend data point
      const existingTrend = trendMap.get(dateKey) || { date: dateKey, attended: 0, punctual: 0, absent: 0 };
      existingTrend.attended += mAttended;
      existingTrend.punctual += mPunctual;
      existingTrend.absent += mAbsent;
      trendMap.set(dateKey, existingTrend);

      // Service performance breakdown
      const serviceName = m.title || m.category?.name || 'Gathering';
      const serviceId = m.categoryId || m.id;
      const sGroup = serviceMap.get(serviceName) || {
        id: serviceId,
        name: serviceName,
        categoryId: m.categoryId || '',
        sessionsCount: 0,
        totalAttended: 0,
        uniqueMemberIds: new Set<string>(),
        attendances: [],
        sessions: [],
      };

      sGroup.sessionsCount += 1;
      sGroup.totalAttended += mAttended;
      sGroup.attendances.push(mAttended);
      (m.attendanceRecords || []).forEach((r: any) => {
        if (['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(r.status)) {
          sGroup.uniqueMemberIds.add(r.memberId);
        }
      });
      sGroup.sessions.push({
        id: m.id,
        title: m.title,
        startTime: m.startTime,
        attended: mAttended,
        absent: mAbsent,
        attendanceRate:
          mAttended + mAbsent > 0 ? Math.round((mAttended / (mAttended + mAbsent)) * 1000) / 10 : 100,
      });
      serviceMap.set(serviceName, sGroup);
    }

    const totalSessions = meetings.length;
    const averageAttendance = totalSessions > 0 ? Math.round((totalAttendance / totalSessions) * 10) / 10 : 0;
    const totalExpected = totalAttendance + absentCount;
    const overallAttendanceRate =
      totalExpected > 0 ? Math.round((totalAttendance / totalExpected) * 1000) / 10 : 0;

    const serviceBreakdown = Array.from(serviceMap.values()).map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      totalSessions: s.sessionsCount,
      totalAttendance: s.totalAttended,
      uniqueMembers: s.uniqueMemberIds.size,
      averageAttendance: s.sessionsCount > 0 ? Math.round((s.totalAttended / s.sessionsCount) * 10) / 10 : 0,
      highestAttendance: s.attendances.length > 0 ? Math.max(...s.attendances) : 0,
      lowestAttendance: s.attendances.length > 0 ? Math.min(...s.attendances) : 0,
      sessions: s.sessions,
    }));

    // Leaderboard & Perfect Attendance for the exact same filtered period
    const leaderboard = await this.getLeaderboard({
      startDate: since.toISOString(),
      endDate: now.toISOString(),
      categoryId: dto.categoryId,
      subTeamId: dto.subTeamId,
      activityType: dto.activityType,
      limit: 100,
    });

    const perfectAttendanceList = leaderboard.filter((m) => m.isPerfectAttendance);

    return {
      dateRange: {
        startDate: since.toISOString(),
        endDate: now.toISOString(),
        days,
      },
      overview: {
        totalAttendance,
        uniqueMembers: uniqueAttendees.size,
        totalSessions,
        averageAttendance,
        overallAttendanceRate,
        punctualAttendance,
        absentCount,
        excusedCount,
      },
      trend: Array.from(trendMap.values()),
      activityBreakdown: activityCounts,
      serviceBreakdown,
      leaderboard,
      perfectAttendanceList,
    };
  }
}
