import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MeetingStatus, MemberStatus, WeeklyAvailabilityState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';

export interface ReconciliationCategoryMember {
  memberId: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  subTeamName: string;
  actualStatus?: string;
  arrivalTime?: Date | null;
}

export interface ServiceReconciliationReport {
  meetingId: string;
  title: string;
  startTime: Date;
  endTime: Date | null;
  locationName: string | null;
  totalExpectedAvailable: number;
  totalActualAttended: number;
  conversionRate: number; // percentage of (availableAndAttended / totalExpectedAvailable)
  categories: {
    availableAndAttended: ReconciliationCategoryMember[];
    availableAndAbsent: ReconciliationCategoryMember[];
    uncommittedAndAttended: ReconciliationCategoryMember[];
    uncommittedAndAbsent: ReconciliationCategoryMember[];
  };
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  getWatCycleWindows(now = new Date()) {
    const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const getVal = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(getVal('year'));
    const month = Number(getVal('month'));
    const day = Number(getVal('day'));
    const weekday = getVal('weekday') || 'Mon';

    const offsetMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const offsetFromMonday = offsetMap[weekday] ?? 0;

    const mondayUtc = new Date(Date.UTC(year, month - 1, day));
    mondayUtc.setUTCDate(mondayUtc.getUTCDate() - offsetFromMonday);

    const mYear = mondayUtc.getUTCFullYear();
    const mMonth = mondayUtc.getUTCMonth();
    const mDay = mondayUtc.getUTCDate();

    // weekStart: Date only (for @db.Date column in Postgres)
    const weekStart = new Date(Date.UTC(mYear, mMonth, mDay));

    // opensAt: Monday 00:00:00.000 WAT (Sunday 23:00:00 UTC)
    const opensAt = new Date(Date.UTC(mYear, mMonth, mDay, 0 - 1, 0, 0, 0));

    // closesAt: Monday 12:00:00.000 WAT (Monday 11:00:00 UTC)
    const closesAt = new Date(Date.UTC(mYear, mMonth, mDay, 12 - 1, 0, 0, 0));

    // nextOpensAt: Next Monday 00:00:00.000 WAT
    const nextOpensAt = new Date(Date.UTC(mYear, mMonth, mDay + 7, 0 - 1, 0, 0, 0));

    const isOpen = now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime();

    return {
      weekStart,
      opensAt,
      closesAt,
      nextOpensAt,
      isOpen,
    };
  }

  weekStart(now = new Date()) {
    return this.getWatCycleWindows(now).weekStart;
  }

  /**
   * Cron job scheduled every Monday at 00:00 Africa/Lagos time to open the current week's poll.
   */
  @Cron('0 0 * * 1', { timeZone: 'Africa/Lagos' })
  async handleWeeklyCron() {
    await this.openCurrentWeek();
    await this.finalizeDue();
  }

  async openCurrentWeek(now = new Date()) {
    const { weekStart, opensAt, closesAt } = this.getWatCycleWindows(now);
    const cycle = await this.prisma.weeklyAvailabilityCycle.upsert({
      where: { weekStart },
      update: { opensAt, closesAt },
      create: {
        weekStart,
        opensAt,
        closesAt,
        state: now.getTime() >= closesAt.getTime() ? WeeklyAvailabilityState.FINALIZED : WeeklyAvailabilityState.OPEN,
      },
    });
    this.cache.invalidateTag('availability');
    return cycle;
  }

  async currentForMember(memberId: string) {
    const now = new Date();
    const { weekStart, isOpen: windowIsOpen, nextOpensAt } = this.getWatCycleWindows(now);
    let cycle = await this.prisma.weeklyAvailabilityCycle.findUnique({
      where: { weekStart },
      include: {
        commitments: { where: { memberId } },
        responses: { where: { memberId } },
      },
    });

    if (!cycle) {
      await this.openCurrentWeek(now);
      cycle = await this.prisma.weeklyAvailabilityCycle.findUnique({
        where: { weekStart },
        include: {
          commitments: { where: { memberId } },
          responses: { where: { memberId } },
        },
      });
    }

    if (!cycle) throw new NotFoundException('Weekly availability has not opened');

    const isOpen = cycle.state === WeeklyAvailabilityState.OPEN && windowIsOpen && now.getTime() < cycle.closesAt.getTime();

    const meetings = await this.weekMeetings(cycle.weekStart);
    return {
      cycle: {
        id: cycle.id,
        weekStart: cycle.weekStart,
        state: cycle.state,
        opensAt: cycle.opensAt,
        closesAt: cycle.closesAt,
        isOpen,
        nextOpensAt,
      },
      meetings,
      selectedMeetingIds: cycle.commitments.filter((x) => x.status === 'COMMITTED').map((x) => x.meetingId),
      submitted: cycle.responses.length > 0,
      submittedAt: cycle.responses[0]?.submittedAt ?? null,
    };
  }

  async submit(memberId: string, meetingIds: string[]) {
    if (!Array.isArray(meetingIds) || meetingIds.some((x) => typeof x !== 'string') || new Set(meetingIds).size !== meetingIds.length) {
      throw new BadRequestException('Invalid meeting selection');
    }
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('Only active members can submit availability');
    }

    const now = new Date();
    const { weekStart, isOpen: windowIsOpen } = this.getWatCycleWindows(now);
    let cycle = await this.prisma.weeklyAvailabilityCycle.findUnique({ where: { weekStart } });
    if (!cycle) {
      cycle = await this.openCurrentWeek(now);
    }
    if (!cycle) throw new NotFoundException('Weekly availability has not opened');

    if (
      cycle.state !== WeeklyAvailabilityState.OPEN ||
      !windowIsOpen ||
      now.getTime() >= cycle.closesAt.getTime() ||
      now.getTime() < cycle.opensAt.getTime()
    ) {
      throw new ForbiddenException('The weekly availability window closed Monday at 12:00 PM WAT.');
    }

    const meetings = await this.weekMeetings(cycle.weekStart);
    const allowed = new Set(meetings.map((x) => x.id));
    if (meetingIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('A selected meeting is not eligible for this week');
    }

    const res = await this.prisma.$transaction(async (tx) => {
      await tx.weeklyAvailabilityResponse.upsert({
        where: { cycleId_memberId: { cycleId: cycle.id, memberId } },
        update: { submittedAt: now },
        create: { cycleId: cycle.id, memberId, submittedAt: now },
      });
      await tx.memberServiceCommitment.deleteMany({
        where: { cycleId: cycle.id, memberId },
      });
      if (meetingIds.length) {
        await tx.memberServiceCommitment.createMany({
          data: meetingIds.map((meetingId) => ({
            cycleId: cycle.id,
            memberId,
            meetingId,
            status: 'COMMITTED' as const,
          })),
        });
      }
      return { cycleId: cycle.id, selectedMeetingIds: meetingIds, submittedAt: now };
    });

    this.cache.invalidateTag('availability');
    return res;
  }

  async getMyHistory(memberId: string) {
    const cycles = await this.prisma.weeklyAvailabilityCycle.findMany({
      orderBy: { weekStart: 'desc' },
      take: 20,
      include: {
        commitments: {
          where: { memberId },
          include: { meeting: { select: { id: true, title: true, startTime: true, locationName: true } } },
        },
        responses: { where: { memberId } },
      },
    });

    const meetingIds = cycles.flatMap((c) => c.commitments.map((cm) => cm.meetingId));
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: { memberId, meetingId: { in: meetingIds } },
      select: { meetingId: true, status: true, actualArrivalTime: true },
    });
    const attendanceMap = new Map(attendanceRecords.map((a) => [a.meetingId, a]));

    return cycles.map((cycle) => {
      const response = cycle.responses[0];
      return {
        cycleId: cycle.id,
        weekStart: cycle.weekStart,
        state: cycle.state,
        hasResponded: Boolean(response),
        submittedAt: response?.submittedAt || null,
        commitments: cycle.commitments.map((cm) => {
          const att = attendanceMap.get(cm.meetingId);
          return {
            meetingId: cm.meetingId,
            title: cm.meeting.title,
            startTime: cm.meeting.startTime,
            locationName: cm.meeting.locationName,
            status: cm.status,
            actualAttendance: att ? att.status : 'NOT_MARKED',
            attended: att ? ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(att.status) : false,
          };
        }),
      };
    });
  }

  async getCycleReconciliation(cycleId?: string) {
    const cycle = cycleId
      ? await this.prisma.weeklyAvailabilityCycle.findUnique({ where: { id: cycleId } })
      : await this.prisma.weeklyAvailabilityCycle.findFirst({ orderBy: { weekStart: 'desc' } });

    if (!cycle) throw new NotFoundException('Availability cycle not found');

    const meetings = await this.weekMeetings(cycle.weekStart);
    const activeMembers = await this.prisma.member.findMany({
      where: { status: MemberStatus.ACTIVE },
      select: { id: true, memberCode: true, firstName: true, lastName: true, subTeam: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const commitments = await this.prisma.memberServiceCommitment.findMany({
      where: { cycleId: cycle.id, status: 'COMMITTED' },
    });
    const commitmentsByMeeting = new Map<string, Set<string>>();
    for (const c of commitments) {
      if (!commitmentsByMeeting.has(c.meetingId)) commitmentsByMeeting.set(c.meetingId, new Set());
      commitmentsByMeeting.get(c.meetingId)!.add(c.memberId);
    }

    const meetingIds = meetings.map((m) => m.id);
    const attendances = await this.prisma.attendanceRecord.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { memberId: true, meetingId: true, status: true, actualArrivalTime: true },
    });

    const attendanceByMeeting = new Map<string, Map<string, { status: string; actualArrivalTime: Date | null }>>();
    for (const a of attendances) {
      if (!attendanceByMeeting.has(a.meetingId)) attendanceByMeeting.set(a.meetingId, new Map());
      attendanceByMeeting.get(a.meetingId)!.set(a.memberId, { status: a.status, actualArrivalTime: a.actualArrivalTime });
    }

    const reports: ServiceReconciliationReport[] = meetings.map((meeting) => {
      const committedMembers = commitmentsByMeeting.get(meeting.id) || new Set<string>();
      const meetingAttendance = attendanceByMeeting.get(meeting.id) || new Map<string, { status: string; actualArrivalTime: Date | null }>();

      const availableAndAttended: ReconciliationCategoryMember[] = [];
      const availableAndAbsent: ReconciliationCategoryMember[] = [];
      const uncommittedAndAttended: ReconciliationCategoryMember[] = [];
      const uncommittedAndAbsent: ReconciliationCategoryMember[] = [];

      for (const m of activeMembers) {
        const isCommitted = committedMembers.has(m.id);
        const att = meetingAttendance.get(m.id);
        const isAttended = att && ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(att.status);

        const memberObj: ReconciliationCategoryMember = {
          memberId: m.id,
          memberCode: m.memberCode,
          firstName: m.firstName,
          lastName: m.lastName,
          subTeamName: m.subTeam?.name || 'Unassigned',
          actualStatus: att?.status,
          arrivalTime: att?.actualArrivalTime,
        };

        if (isCommitted && isAttended) {
          availableAndAttended.push(memberObj);
        } else if (isCommitted && !isAttended) {
          availableAndAbsent.push(memberObj);
        } else if (!isCommitted && isAttended) {
          uncommittedAndAttended.push(memberObj);
        } else {
          uncommittedAndAbsent.push(memberObj);
        }
      }

      const totalExpected = availableAndAttended.length + availableAndAbsent.length;
      const totalAttended = availableAndAttended.length + uncommittedAndAttended.length;
      const conversionRate = totalExpected > 0 ? Math.round((availableAndAttended.length / totalExpected) * 1000) / 10 : 0;

      return {
        meetingId: meeting.id,
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        locationName: meeting.locationName,
        totalExpectedAvailable: totalExpected,
        totalActualAttended: totalAttended,
        conversionRate,
        categories: {
          availableAndAttended,
          availableAndAbsent,
          uncommittedAndAttended,
          uncommittedAndAbsent,
        },
      };
    });

    return {
      cycle: {
        id: cycle.id,
        weekStart: cycle.weekStart,
        state: cycle.state,
        opensAt: cycle.opensAt,
        closesAt: cycle.closesAt,
      },
      services: reports,
    };
  }

  async getHistoricalAnalytics(days = 60) {
    const since = new Date(Date.now() - days * 86400000);
    const cycles = await this.prisma.weeklyAvailabilityCycle.findMany({
      where: { weekStart: { gte: since } },
      orderBy: { weekStart: 'asc' },
      include: {
        _count: { select: { responses: true, commitments: true } },
      },
    });

    const activeMemberCount = await this.prisma.member.count({ where: { status: MemberStatus.ACTIVE } });

    return {
      totalCycles: cycles.length,
      activeMemberCount,
      trend: cycles.map((c) => ({
        cycleId: c.id,
        weekStart: c.weekStart,
        responseCount: c._count.responses,
        responseRate: activeMemberCount > 0 ? Math.round((c._count.responses / activeMemberCount) * 1000) / 10 : 0,
        commitmentsCount: c._count.commitments,
      })),
    };
  }

  async finalizeDue(now = new Date()) {
    const cycles = await this.prisma.weeklyAvailabilityCycle.findMany({
      where: { state: WeeklyAvailabilityState.OPEN, closesAt: { lte: now } },
    });
    for (const cycle of cycles) {
      await this.prisma.weeklyAvailabilityCycle.updateMany({
        where: { id: cycle.id, state: WeeklyAvailabilityState.OPEN },
        data: { state: WeeklyAvailabilityState.FINALIZED, finalizedAt: now },
      });
    }
    return cycles.length;
  }

  private weekMeetings(weekStart: Date) {
    const end = new Date(weekStart);
    end.setUTCDate(end.getUTCDate() + 7);
    return this.prisma.meeting.findMany({
      where: {
        status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.ACTIVE, MeetingStatus.CLOSED] },
        startTime: { gte: weekStart, lt: end },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationName: true,
        status: true,
      },
    });
  }
}
