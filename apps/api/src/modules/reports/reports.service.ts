import { unitPolicy, validateUnitPolicy } from '../../common/unit-policy';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { MemberStatus, AttendanceStatus, MeetingStatus, ServiceCommitmentStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

export interface ReportQueryDto {
  days?: number;
  from?: string;
  to?: string;
  month?: string; // e.g. "2026-09" or "9"
  year?: string | number; // e.g. "2026"
  meetingId?: string;
  meetingIds?: string[];
  categoryId?: string;
  eventTypeId?: string;
  memberId?: string;
  subTeamId?: string;
  supervisingMinisterId?: string;
  availabilityStatus?: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NO_RESPONSE';
  attendanceStatus?: 'ATTENDED' | 'ABSENT' | 'EXCUSED' | 'EXEMPT' | 'NOT_MARKED';
  combinedStatus?:
    | 'AVAILABLE_ATTENDED'
    | 'AVAILABLE_ABSENT'
    | 'UNAVAILABLE_ATTENDED'
    | 'UNAVAILABLE_ABSENT'
    | 'NO_RESPONSE_ATTENDED'
    | 'NO_RESPONSE_ABSENT';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'memberName' | 'serviceTitle' | 'availabilityStatus' | 'attendanceStatus' | 'combinedStatus' | 'arrivalTime';
  sortOrder?: 'asc' | 'desc';
}

export interface DetailedReportRecord {
  id: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  subTeamId: string | null;
  subTeamName: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date;
  serviceCategory: string;
  availabilityStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NO_RESPONSE';
  attendanceStatus: 'ATTENDED' | 'ABSENT' | 'EXCUSED' | 'EXEMPT' | 'NOT_MARKED';
  actualAttendanceStatus: AttendanceStatus | null;
  combinedStatus:
    | 'AVAILABLE_ATTENDED'
    | 'AVAILABLE_ABSENT'
    | 'UNAVAILABLE_ATTENDED'
    | 'UNAVAILABLE_ABSENT'
    | 'NO_RESPONSE_ATTENDED'
    | 'NO_RESPONSE_ABSENT';
  arrivalTime: Date | null;
  attendanceMethod: string | null;
  pointsEarned: number;
}

export interface ReportSummaryMetrics {
  totalRecords: number;
  totalActiveMembers: number;
  totalMeetingsHeld: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  totalAbsent: number;
  totalExcused: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  unavailableAndAttended: number;
  unavailableAndAbsent: number;
  noResponseAndAttended: number;
  noResponseAndAbsent: number;
  attendanceRate: number; // (totalAttended / (totalAttended + totalAbsent)) * 100
  availabilityResponseRate: number; // (totalResponses / totalPossibleSubmissions) * 100
  conversionRate: number; // (availableAndAttended / (availableAndAttended + availableAndAbsent)) * 100
  totalPhysicalHeadcount: number;
  averagePhysicalHeadcount: number;
}

export interface ServiceSummaryItem {
  meetingId: string;
  title: string;
  meetingDate: Date;
  categoryName: string;
  locationName: string;
  status: MeetingStatus;
  supervisingMinisterName: string | null;
  totalExpectedMembers: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  totalAbsent: number;
  totalExcused: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  unavailableAndAttended: number;
  unavailableAndAbsent: number;
  noResponseAndAttended: number;
  noResponseAndAbsent: number;
  attendanceRate: number;
  availabilityResponseRate: number;
  conversionRate: number;
  officialHeadcount: number | null;
  variance: number | null;
}

export interface MonthlySummaryItem {
  monthKey: string; // e.g. "2026-09"
  monthLabel: string; // e.g. "September 2026"
  servicesHeld: number;
  totalSubmissions: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalNoResponse: number;
  totalAttended: number;
  availableAndAttended: number;
  availableAndAbsent: number;
  attendanceRate: number;
  availabilityResponseRate: number;
  conversionRate: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Helper to parse date boundaries in Africa/Lagos (WAT, UTC+1).
   */
  parseWatDateRange(query: ReportQueryDto) {
    let since: Date;
    let until: Date;

    if (query.month) {
      let year: number;
      let month: number;
      if (query.month.includes('-')) {
        const [yStr, mStr] = query.month.split('-');
        year = Number(yStr);
        month = Number(mStr);
      } else {
        month = Number(query.month);
        year = query.year ? Number(query.year) : new Date().getFullYear();
      }
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        throw new BadRequestException('Invalid month or year parameter');
      }
      // Start of month: 1st day 00:00:00 WAT (UTC: year, month-1, 1, 00-1)
      since = new Date(Date.UTC(year, month - 1, 1, -1, 0, 0, 0));
      // End of month: last day 23:59:59.999 WAT
      const lastDay = new Date(year, month, 0).getDate();
      until = new Date(Date.UTC(year, month - 1, lastDay, 23 - 1, 59, 59, 999));
    } else if (query.from || query.to) {
      if (query.from) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
          const [y, m, d] = query.from.split('-').map(Number);
          since = new Date(Date.UTC(y, m - 1, d, -1, 0, 0, 0));
        } else {
          since = new Date(query.from);
        }
      } else {
        since = new Date(Date.now() - 30 * 86400000);
      }

      if (query.to) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
          const [y, m, d] = query.to.split('-').map(Number);
          until = new Date(Date.UTC(y, m - 1, d, 23 - 1, 59, 59, 999));
        } else {
          until = new Date(query.to);
        }
      } else {
        until = new Date();
      }
    } else if (query.year && !query.month) {
      const y = Number(query.year);
      if (isNaN(y)) throw new BadRequestException('Invalid year');
      since = new Date(Date.UTC(y, 0, 1, -1, 0, 0, 0));
      until = new Date(Date.UTC(y, 11, 31, 23 - 1, 59, 59, 999));
    } else {
      const days = query.days && [7, 14, 30, 60, 90, 180, 365].includes(Number(query.days)) ? Number(query.days) : 30;
      until = new Date();
      since = new Date(until.getTime() - days * 86400000);
    }

    if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since > until) {
      throw new BadRequestException('Invalid date range');
    }

    return { since, until };
  }

  /**
   * Helper to compute Monday weekStart date in WAT for a given datetime.
   */
  getWatWeekStart(date: Date): Date {
    const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(getVal('year'));
    const month = Number(getVal('month'));
    const day = Number(getVal('day'));
    const weekday = getVal('weekday') || 'Mon';

    const offsetMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const offsetFromMonday = offsetMap[weekday] ?? 0;

    const mondayUtc = new Date(Date.UTC(year, month - 1, day));
    mondayUtc.setUTCDate(mondayUtc.getUTCDate() - offsetFromMonday);

    return new Date(Date.UTC(mondayUtc.getUTCFullYear(), mondayUtc.getUTCMonth(), mondayUtc.getUTCDate()));
  }

  async filterOptions() {
    const [members, teams, categories, eventTypes, supervisingMinisters, recentMeetings] = await Promise.all([
      this.prisma.member.findMany({
        where: { status: MemberStatus.ACTIVE },
        select: { id: true, firstName: true, lastName: true, memberCode: true, subTeamId: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.subTeam.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.meetingCategory.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.eventType.findMany({
        select: { id: true, name: true, color: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.member.findMany({
        where: {
          OR: [
            { roleInUnit: { contains: 'Minister', mode: 'insensitive' } },
            { roleInUnit: { contains: 'Leader', mode: 'insensitive' } },
            { roleInUnit: { contains: 'Supervisor', mode: 'insensitive' } },
            { supervisedMeetings: { some: {} } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, memberCode: true, roleInUnit: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.meeting.findMany({
        where: { status: { not: MeetingStatus.CANCELLED } },
        select: { id: true, title: true, startTime: true, category: { select: { name: true } } },
        orderBy: { startTime: 'desc' },
        take: 30,
      }),
    ]);

    return {
      members,
      teams,
      categories,
      eventTypes,
      supervisingMinisters,
      recentMeetings,
    };
  }

  async settings() {
    return unitPolicy(this.prisma);
  }

  async updateSettings(body: any) {
    const value = validateUnitPolicy(body);
    await this.prisma.systemSetting.upsert({
      where: { key: 'unit_policy' },
      create: { key: 'unit_policy', value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    this.cache.invalidateTags(['analytics', 'dashboard', 'leaderboard']);
    return value;
  }

  /**
   * Comprehensive Availability & Attendance Reporting Engine.
   */
  async getAvailabilityAttendanceReport(query: ReportQueryDto) {
    const { since, until } = this.parseWatDateRange(query);

    // 1. Fetch matching meetings
    const meetingWhere: any = {
      startTime: { gte: since, lte: until },
      status: { not: MeetingStatus.CANCELLED },
    };

    if (query.meetingId) {
      meetingWhere.id = query.meetingId;
    } else if (query.meetingIds && query.meetingIds.length > 0) {
      meetingWhere.id = { in: query.meetingIds };
    }

    if (query.categoryId) {
      meetingWhere.categoryId = query.categoryId;
    }
    if (query.eventTypeId) {
      meetingWhere.eventTypeId = query.eventTypeId;
    }
    if (query.supervisingMinisterId) {
      meetingWhere.supervisingMinisterId = query.supervisingMinisterId;
    }

    const meetings = await this.prisma.meeting.findMany({
      where: meetingWhere,
      include: {
        category: { select: { id: true, name: true } },
        eventType: { select: { id: true, name: true, color: true } },
        headcount: true,
        supervisingMinister: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    if (meetings.length === 0) {
      return {
        records: [],
        total: 0,
        page: query.page || 1,
        limit: query.limit || 50,
        totalPages: 0,
        summary: this.emptySummary(since, until),
        serviceSummaries: [],
        monthlySummaries: [],
        since,
        until,
      };
    }

    const meetingIds = meetings.map((m) => m.id);

    // 2. Determine distinct weekStart dates for all matching meetings
    const weekStartMap = new Map<string, Date>();
    for (const m of meetings) {
      const ws = this.getWatWeekStart(m.startTime);
      const wsKey = ws.toISOString().split('T')[0];
      weekStartMap.set(wsKey, ws);
    }
    const distinctWeekStarts = Array.from(weekStartMap.values());

    // 3. Fetch weekly availability cycles for these weekStarts
    const cycles = await this.prisma.weeklyAvailabilityCycle.findMany({
      where: { weekStart: { in: distinctWeekStarts } },
      include: {
        responses: {
          select: { id: true, cycleId: true, memberId: true, submittedAt: true },
        },
        commitments: {
          where: { meetingId: { in: meetingIds } },
          select: { id: true, cycleId: true, memberId: true, meetingId: true, status: true },
        },
      },
    });

    // Map cycle by weekStart string (YYYY-MM-DD)
    const cycleByWeekStart = new Map<string, typeof cycles[0]>();
    for (const c of cycles) {
      const wsKey = c.weekStart.toISOString().split('T')[0];
      cycleByWeekStart.set(wsKey, c);
    }

    // 4. Fetch relevant members
    const memberWhere: any = {};
    if (query.memberId) {
      memberWhere.id = query.memberId;
    }
    if (query.subTeamId) {
      memberWhere.subTeamId = query.subTeamId;
    }
    if (!query.memberId) {
      memberWhere.status = MemberStatus.ACTIVE;
    }

    const members = await this.prisma.member.findMany({
      where: memberWhere,
      select: {
        id: true,
        memberCode: true,
        firstName: true,
        lastName: true,
        status: true,
        subTeamId: true,
        subTeam: { select: { id: true, name: true } },
      },
      orderBy: { firstName: 'asc' },
    });

    const memberIds = members.map((m) => m.id);

    // 5. Fetch attendance records for these meetings and members
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        meetingId: { in: meetingIds },
        memberId: { in: memberIds },
      },
      select: {
        id: true,
        memberId: true,
        meetingId: true,
        status: true,
        actualArrivalTime: true,
        method: true,
        pointsEarned: true,
      },
    });

    // Index attendance by `${meetingId}_${memberId}`
    const attendanceMap = new Map<string, typeof attendanceRecords[0]>();
    for (const att of attendanceRecords) {
      attendanceMap.set(`${att.meetingId}_${att.memberId}`, att);
    }

    // 6. Build the unified records matrix
    const allRecords: DetailedReportRecord[] = [];

    for (const meeting of meetings) {
      const ws = this.getWatWeekStart(meeting.startTime);
      const wsKey = ws.toISOString().split('T')[0];
      const cycle = cycleByWeekStart.get(wsKey);

      // Map responses & commitments for this cycle
      const responsesSet = new Set<string>();
      const commitmentMap = new Map<string, ServiceCommitmentStatus>();

      if (cycle) {
        for (const r of cycle.responses) {
          responsesSet.add(r.memberId);
        }
        for (const c of cycle.commitments) {
          if (c.meetingId === meeting.id) {
            commitmentMap.set(c.memberId, c.status);
          }
        }
      }

      for (const member of members) {
        // Availability determination
        let availabilityStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NO_RESPONSE';
        const hasSubmitted = responsesSet.has(member.id);

        if (!hasSubmitted) {
          availabilityStatus = 'NO_RESPONSE';
        } else {
          const commitment = commitmentMap.get(member.id);
          if (commitment === ServiceCommitmentStatus.COMMITTED) {
            availabilityStatus = 'AVAILABLE';
          } else {
            availabilityStatus = 'NOT_AVAILABLE';
          }
        }

        // Attendance determination
        const att = attendanceMap.get(`${meeting.id}_${member.id}`);
        let attendanceStatus: 'ATTENDED' | 'ABSENT' | 'EXCUSED' | 'EXEMPT' | 'NOT_MARKED' = 'ABSENT';
        let actualStatus: AttendanceStatus | null = null;
        let arrivalTime: Date | null = null;
        let method: string | null = null;
        let points = 0;

        if (att) {
          actualStatus = att.status;
          arrivalTime = att.actualArrivalTime;
          method = att.method;
          points = att.pointsEarned;

          if (['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(att.status)) {
            attendanceStatus = 'ATTENDED';
          } else if (att.status === AttendanceStatus.EXCUSED) {
            attendanceStatus = 'EXCUSED';
          } else if (att.status === AttendanceStatus.EXEMPT) {
            attendanceStatus = 'EXEMPT';
          } else {
            attendanceStatus = 'ABSENT';
          }
        } else {
          if (meeting.status === MeetingStatus.CLOSED || meeting.startTime.getTime() <= Date.now()) {
            attendanceStatus = 'ABSENT';
          } else {
            attendanceStatus = 'NOT_MARKED';
          }
        }

        // Authoritative 6-Way Combined Status
        let combinedStatus: DetailedReportRecord['combinedStatus'];
        const isAttended = attendanceStatus === 'ATTENDED';

        if (availabilityStatus === 'AVAILABLE') {
          combinedStatus = isAttended ? 'AVAILABLE_ATTENDED' : 'AVAILABLE_ABSENT';
        } else if (availabilityStatus === 'NOT_AVAILABLE') {
          combinedStatus = isAttended ? 'UNAVAILABLE_ATTENDED' : 'UNAVAILABLE_ABSENT';
        } else {
          combinedStatus = isAttended ? 'NO_RESPONSE_ATTENDED' : 'NO_RESPONSE_ABSENT';
        }

        allRecords.push({
          id: `${meeting.id}_${member.id}`,
          memberId: member.id,
          memberCode: member.memberCode,
          memberName: `${member.firstName} ${member.lastName}`.trim(),
          subTeamId: member.subTeamId,
          subTeamName: member.subTeam?.name || 'Unassigned',
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          meetingDate: meeting.startTime,
          serviceCategory: meeting.category?.name || 'General',
          availabilityStatus,
          attendanceStatus,
          actualAttendanceStatus: actualStatus,
          combinedStatus,
          arrivalTime,
          attendanceMethod: method,
          pointsEarned: points,
        });
      }
    }

    // 7. Apply In-Memory Filters (availabilityStatus, attendanceStatus, combinedStatus, search)
    let filteredRecords = allRecords;

    if (query.availabilityStatus) {
      filteredRecords = filteredRecords.filter((r) => r.availabilityStatus === query.availabilityStatus);
    }
    if (query.attendanceStatus) {
      filteredRecords = filteredRecords.filter((r) => r.attendanceStatus === query.attendanceStatus);
    }
    if (query.combinedStatus) {
      filteredRecords = filteredRecords.filter((r) => r.combinedStatus === query.combinedStatus);
    }
    if (query.search && query.search.trim() !== '') {
      const term = query.search.toLowerCase().trim();
      filteredRecords = filteredRecords.filter(
        (r) =>
          r.memberName.toLowerCase().includes(term) ||
          r.memberCode.toLowerCase().includes(term) ||
          r.subTeamName.toLowerCase().includes(term) ||
          r.meetingTitle.toLowerCase().includes(term) ||
          r.serviceCategory.toLowerCase().includes(term),
      );
    }

    // 8. Compute Aggregates across the entire filtered dataset
    const summary = this.computeSummaryMetrics(filteredRecords, members.length, meetings.length, meetings);
    const serviceSummaries = this.computeServiceSummaries(meetings, allRecords, members.length);
    const monthlySummaries = this.computeMonthlySummaries(allRecords);

    // 9. Sorting
    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder || 'desc';

    filteredRecords.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'date') {
        comp = a.meetingDate.getTime() - b.meetingDate.getTime();
      } else if (sortBy === 'memberName') {
        comp = a.memberName.localeCompare(b.memberName);
      } else if (sortBy === 'serviceTitle') {
        comp = a.meetingTitle.localeCompare(b.meetingTitle);
      } else if (sortBy === 'availabilityStatus') {
        comp = a.availabilityStatus.localeCompare(b.availabilityStatus);
      } else if (sortBy === 'attendanceStatus') {
        comp = a.attendanceStatus.localeCompare(b.attendanceStatus);
      } else if (sortBy === 'combinedStatus') {
        comp = a.combinedStatus.localeCompare(b.combinedStatus);
      } else if (sortBy === 'arrivalTime') {
        const timeA = a.arrivalTime ? a.arrivalTime.getTime() : 0;
        const timeB = b.arrivalTime ? b.arrivalTime.getTime() : 0;
        comp = timeA - timeB;
      }
      return sortOrder === 'desc' ? -comp : comp;
    });

    // 10. Server-side Pagination
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const total = filteredRecords.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedRecords = filteredRecords.slice((page - 1) * limit, page * limit);

    return {
      records: paginatedRecords,
      total,
      page,
      limit,
      totalPages,
      summary,
      serviceSummaries,
      monthlySummaries,
      since,
      until,
    };
  }

  /**
   * Helper to compute KPIs and conversion rates across detailed records.
   */
  private computeSummaryMetrics(
    records: DetailedReportRecord[],
    totalActiveMembers: number,
    totalMeetingsHeld: number,
    meetings: any[],
  ): ReportSummaryMetrics {
    let availableAndAttended = 0;
    let availableAndAbsent = 0;
    let unavailableAndAttended = 0;
    let unavailableAndAbsent = 0;
    let noResponseAndAttended = 0;
    let noResponseAndAbsent = 0;
    let totalExcused = 0;

    for (const r of records) {
      if (r.combinedStatus === 'AVAILABLE_ATTENDED') availableAndAttended++;
      else if (r.combinedStatus === 'AVAILABLE_ABSENT') availableAndAbsent++;
      else if (r.combinedStatus === 'UNAVAILABLE_ATTENDED') unavailableAndAttended++;
      else if (r.combinedStatus === 'UNAVAILABLE_ABSENT') unavailableAndAbsent++;
      else if (r.combinedStatus === 'NO_RESPONSE_ATTENDED') noResponseAndAttended++;
      else if (r.combinedStatus === 'NO_RESPONSE_ABSENT') noResponseAndAbsent++;

      if (r.attendanceStatus === 'EXCUSED') totalExcused++;
    }

    const totalAvailable = availableAndAttended + availableAndAbsent;
    const totalUnavailable = unavailableAndAttended + unavailableAndAbsent;
    const totalNoResponse = noResponseAndAttended + noResponseAndAbsent;
    const totalAttended = availableAndAttended + unavailableAndAttended + noResponseAndAttended;
    const totalAbsent = availableAndAbsent + unavailableAndAbsent + noResponseAndAbsent;

    // Headcount calculations
    let totalPhysicalHeadcount = 0;
    let headcountCount = 0;
    for (const m of meetings) {
      if (m.headcount && m.headcount.totalHeadcount != null) {
        totalPhysicalHeadcount += m.headcount.totalHeadcount;
        headcountCount++;
      }
    }

    const conversionRate =
      totalAvailable > 0 ? Math.round((availableAndAttended / totalAvailable) * 1000) / 10 : 0;
    const totalPossibleSubmissions = totalActiveMembers * totalMeetingsHeld;
    const totalResponses = totalAvailable + totalUnavailable;
    const availabilityResponseRate =
      totalPossibleSubmissions > 0
        ? Math.round((totalResponses / totalPossibleSubmissions) * 1000) / 10
        : 0;
    const totalAttendanceOpportunities = totalAttended + totalAbsent;
    const attendanceRate =
      totalAttendanceOpportunities > 0
        ? Math.round((totalAttended / totalAttendanceOpportunities) * 1000) / 10
        : 0;

    return {
      totalRecords: records.length,
      totalActiveMembers,
      totalMeetingsHeld,
      totalAvailable,
      totalUnavailable,
      totalNoResponse,
      totalAttended,
      totalAbsent,
      totalExcused,
      availableAndAttended,
      availableAndAbsent,
      unavailableAndAttended,
      unavailableAndAbsent,
      noResponseAndAttended,
      noResponseAndAbsent,
      attendanceRate,
      availabilityResponseRate,
      conversionRate,
      totalPhysicalHeadcount,
      averagePhysicalHeadcount: headcountCount ? Math.round((totalPhysicalHeadcount / headcountCount) * 10) / 10 : 0,
    };
  }

  /**
   * Helper to compute service-level summaries.
   */
  private computeServiceSummaries(
    meetings: any[],
    allRecords: DetailedReportRecord[],
    totalActiveMembers: number,
  ): ServiceSummaryItem[] {
    const recordsByMeeting = new Map<string, DetailedReportRecord[]>();
    for (const r of allRecords) {
      const list = recordsByMeeting.get(r.meetingId) || [];
      list.push(r);
      recordsByMeeting.set(r.meetingId, list);
    }

    return meetings.map((m) => {
      const records = recordsByMeeting.get(m.id) || [];
      let availableAndAttended = 0;
      let availableAndAbsent = 0;
      let unavailableAndAttended = 0;
      let unavailableAndAbsent = 0;
      let noResponseAndAttended = 0;
      let noResponseAndAbsent = 0;
      let totalExcused = 0;

      for (const r of records) {
        if (r.combinedStatus === 'AVAILABLE_ATTENDED') availableAndAttended++;
        else if (r.combinedStatus === 'AVAILABLE_ABSENT') availableAndAbsent++;
        else if (r.combinedStatus === 'UNAVAILABLE_ATTENDED') unavailableAndAttended++;
        else if (r.combinedStatus === 'UNAVAILABLE_ABSENT') unavailableAndAbsent++;
        else if (r.combinedStatus === 'NO_RESPONSE_ATTENDED') noResponseAndAttended++;
        else if (r.combinedStatus === 'NO_RESPONSE_ABSENT') noResponseAndAbsent++;

        if (r.attendanceStatus === 'EXCUSED') totalExcused++;
      }

      const totalAvailable = availableAndAttended + availableAndAbsent;
      const totalUnavailable = unavailableAndAttended + unavailableAndAbsent;
      const totalNoResponse = noResponseAndAttended + noResponseAndAbsent;
      const totalAttended = availableAndAttended + unavailableAndAttended + noResponseAndAttended;
      const totalAbsent = availableAndAbsent + unavailableAndAbsent + noResponseAndAbsent;

      const conversionRate =
        totalAvailable > 0 ? Math.round((availableAndAttended / totalAvailable) * 1000) / 10 : 0;
      const totalResponses = totalAvailable + totalUnavailable;
      const availabilityResponseRate =
        totalActiveMembers > 0 ? Math.round((totalResponses / totalActiveMembers) * 1000) / 10 : 0;
      const attendanceRate =
        totalAttended + totalAbsent > 0
          ? Math.round((totalAttended / (totalAttended + totalAbsent)) * 1000) / 10
          : 0;

      const officialHc = m.headcount?.totalHeadcount ?? null;
      const variance = officialHc != null ? officialHc - totalAttended : null;

      return {
        meetingId: m.id,
        title: m.title,
        meetingDate: m.startTime,
        categoryName: m.category?.name || 'General',
        locationName: m.locationName,
        status: m.status,
        supervisingMinisterName: m.supervisingMinister
          ? `${m.supervisingMinister.firstName} ${m.supervisingMinister.lastName}`
          : null,
        totalExpectedMembers: totalActiveMembers,
        totalAvailable,
        totalUnavailable,
        totalNoResponse,
        totalAttended,
        totalAbsent,
        totalExcused,
        availableAndAttended,
        availableAndAbsent,
        unavailableAndAttended,
        unavailableAndAbsent,
        noResponseAndAttended,
        noResponseAndAbsent,
        attendanceRate,
        availabilityResponseRate,
        conversionRate,
        officialHeadcount: officialHc,
        variance,
      };
    });
  }

  /**
   * Helper to compute month-by-month trends.
   */
  private computeMonthlySummaries(allRecords: DetailedReportRecord[]): MonthlySummaryItem[] {
    const monthGroups = new Map<string, DetailedReportRecord[]>();
    const monthMeetings = new Map<string, Set<string>>();

    for (const r of allRecords) {
      const y = r.meetingDate.getFullYear();
      const m = String(r.meetingDate.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;

      const list = monthGroups.get(key) || [];
      list.push(r);
      monthGroups.set(key, list);

      const mSet = monthMeetings.get(key) || new Set<string>();
      mSet.add(r.meetingId);
      monthMeetings.set(key, mSet);
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const result: MonthlySummaryItem[] = [];

    const sortedKeys = Array.from(monthGroups.keys()).sort();

    for (const key of sortedKeys) {
      const records = monthGroups.get(key) || [];
      const [yearStr, monthStr] = key.split('-');
      const monthIdx = Number(monthStr) - 1;
      const monthLabel = `${monthNames[monthIdx]} ${yearStr}`;

      let availableAndAttended = 0;
      let availableAndAbsent = 0;
      let unavailableAndAttended = 0;
      let unavailableAndAbsent = 0;
      let noResponseAndAttended = 0;
      let noResponseAndAbsent = 0;

      for (const r of records) {
        if (r.combinedStatus === 'AVAILABLE_ATTENDED') availableAndAttended++;
        else if (r.combinedStatus === 'AVAILABLE_ABSENT') availableAndAbsent++;
        else if (r.combinedStatus === 'UNAVAILABLE_ATTENDED') unavailableAndAttended++;
        else if (r.combinedStatus === 'UNAVAILABLE_ABSENT') unavailableAndAbsent++;
        else if (r.combinedStatus === 'NO_RESPONSE_ATTENDED') noResponseAndAttended++;
        else if (r.combinedStatus === 'NO_RESPONSE_ABSENT') noResponseAndAbsent++;
      }

      const totalAvailable = availableAndAttended + availableAndAbsent;
      const totalUnavailable = unavailableAndAttended + unavailableAndAbsent;
      const totalNoResponse = noResponseAndAttended + noResponseAndAbsent;
      const totalAttended = availableAndAttended + unavailableAndAttended + noResponseAndAttended;
      const totalAbsent = availableAndAbsent + unavailableAndAbsent + noResponseAndAbsent;

      const conversionRate =
        totalAvailable > 0 ? Math.round((availableAndAttended / totalAvailable) * 1000) / 10 : 0;
      const totalSubmissions = totalAvailable + totalUnavailable;
      const totalOpportunities = records.length;
      const availabilityResponseRate =
        totalOpportunities > 0 ? Math.round((totalSubmissions / totalOpportunities) * 1000) / 10 : 0;
      const attendanceRate =
        totalAttended + totalAbsent > 0
          ? Math.round((totalAttended / (totalAttended + totalAbsent)) * 1000) / 10
          : 0;

      result.push({
        monthKey: key,
        monthLabel,
        servicesHeld: monthMeetings.get(key)?.size || 0,
        totalSubmissions,
        totalAvailable,
        totalUnavailable,
        totalNoResponse,
        totalAttended,
        availableAndAttended,
        availableAndAbsent,
        attendanceRate,
        availabilityResponseRate,
        conversionRate,
      });
    }

    return result;
  }

  private emptySummary(since: Date, until: Date): ReportSummaryMetrics {
    return {
      totalRecords: 0,
      totalActiveMembers: 0,
      totalMeetingsHeld: 0,
      totalAvailable: 0,
      totalUnavailable: 0,
      totalNoResponse: 0,
      totalAttended: 0,
      totalAbsent: 0,
      totalExcused: 0,
      availableAndAttended: 0,
      availableAndAbsent: 0,
      unavailableAndAttended: 0,
      unavailableAndAbsent: 0,
      noResponseAndAttended: 0,
      noResponseAndAbsent: 0,
      attendanceRate: 0,
      availabilityResponseRate: 0,
      conversionRate: 0,
      totalPhysicalHeadcount: 0,
      averagePhysicalHeadcount: 0,
    };
  }

  /**
   * Person-Level Historical Report.
   */
  async getPersonReport(memberId: string, query: ReportQueryDto = {}) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { subTeam: true },
    });
    if (!member) throw new BadRequestException('Member not found');

    const report = await this.getAvailabilityAttendanceReport({
      ...query,
      memberId,
      limit: 500, // retrieve comprehensive person history
    });

    let servicesAvailable = 0;
    let servicesUnavailable = 0;
    let servicesNoResponse = 0;
    let servicesAttended = 0;
    let servicesMissed = 0;
    let availableButAbsent = 0;

    for (const r of report.records) {
      if (r.availabilityStatus === 'AVAILABLE') servicesAvailable++;
      else if (r.availabilityStatus === 'NOT_AVAILABLE') servicesUnavailable++;
      else if (r.availabilityStatus === 'NO_RESPONSE') servicesNoResponse++;

      if (r.attendanceStatus === 'ATTENDED') servicesAttended++;
      else if (r.attendanceStatus === 'ABSENT') servicesMissed++;

      if (r.combinedStatus === 'AVAILABLE_ABSENT') availableButAbsent++;
    }

    const totalServices = report.records.length;
    const attendanceRate =
      servicesAttended + servicesMissed > 0
        ? Math.round((servicesAttended / (servicesAttended + servicesMissed)) * 1000) / 10
        : 0;
    const availabilityResponseRate =
      totalServices > 0
        ? Math.round(((servicesAvailable + servicesUnavailable) / totalServices) * 1000) / 10
        : 0;
    const conversionRate =
      servicesAvailable > 0
        ? Math.round(((servicesAvailable - availableButAbsent) / servicesAvailable) * 1000) / 10
        : 0;

    return {
      member: {
        id: member.id,
        memberCode: member.memberCode,
        fullName: `${member.firstName} ${member.lastName}`.trim(),
        roleInUnit: member.roleInUnit,
        subTeamName: member.subTeam?.name || 'Unassigned',
        status: member.status,
      },
      stats: {
        totalServices,
        servicesAvailable,
        servicesUnavailable,
        servicesNoResponse,
        servicesAttended,
        servicesMissed,
        availableButAbsent,
        attendanceRate,
        availabilityResponseRate,
        conversionRate,
      },
      history: report.records,
    };
  }

  /**
   * Service-Level Reconciliation Report.
   */
  async getServiceReport(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        category: true,
        eventType: true,
        headcount: true,
        supervisingMinister: true,
      },
    });
    if (!meeting) throw new BadRequestException('Meeting not found');

    const report = await this.getAvailabilityAttendanceReport({
      meetingId,
      limit: 1000,
    });

    const categorized: Record<string, DetailedReportRecord[]> = {
      availableAndAttended: [],
      availableAndAbsent: [],
      unavailableAndAttended: [],
      unavailableAndAbsent: [],
      noResponseAndAttended: [],
      noResponseAndAbsent: [],
    };

    for (const r of report.records) {
      if (r.combinedStatus === 'AVAILABLE_ATTENDED') categorized.availableAndAttended.push(r);
      else if (r.combinedStatus === 'AVAILABLE_ABSENT') categorized.availableAndAbsent.push(r);
      else if (r.combinedStatus === 'UNAVAILABLE_ATTENDED') categorized.unavailableAndAttended.push(r);
      else if (r.combinedStatus === 'UNAVAILABLE_ABSENT') categorized.unavailableAndAbsent.push(r);
      else if (r.combinedStatus === 'NO_RESPONSE_ATTENDED') categorized.noResponseAndAttended.push(r);
      else if (r.combinedStatus === 'NO_RESPONSE_ABSENT') categorized.noResponseAndAbsent.push(r);
    }

    const summary = report.summary;

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        locationName: meeting.locationName,
        status: meeting.status,
        category: meeting.category.name,
        eventType: meeting.eventType?.name || null,
        supervisingMinister: meeting.supervisingMinister
          ? `${meeting.supervisingMinister.firstName} ${meeting.supervisingMinister.lastName}`
          : null,
        headcount: meeting.headcount,
      },
      summary,
      categorized,
    };
  }

  /**
   * Filtered CSV Export.
   */
  async generateFilteredCsv(query: ReportQueryDto) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await this.generateFilteredExcel(query) as any);
    const rows: string[] = [];
    workbook.worksheets[0].eachRow((row) => {
      const values = (row.values as any[]).slice(1).map((value) => {
        let text = String(value ?? '');
        if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      });
      rows.push(values.join(','));
    });
    return '\uFEFF' + rows.join('\r\n');
  }

  /**
   * Filtered Excel Export with full multi-tab reports.
   */
  async generateFilteredExcel(query: ReportQueryDto): Promise<Buffer> {
    const report = await this.getAvailabilityAttendanceReport({
      ...query,
      limit: 10000, // Export full matching dataset
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TFHC Orderliness System';
    workbook.created = new Date();

    // Sheet 1: Detailed Availability & Attendance Records
    const sheetRecords = workbook.addWorksheet('Availability & Attendance');
    sheetRecords.columns = [
      { header: 'Member Code', key: 'memberCode', width: 15 },
      { header: 'Member Name', key: 'memberName', width: 25 },
      { header: 'Sub-Team', key: 'subTeam', width: 20 },
      { header: 'Meeting Title', key: 'meetingTitle', width: 30 },
      { header: 'Date (WAT)', key: 'date', width: 15 },
      { header: 'Availability', key: 'availability', width: 16 },
      { header: 'Attendance', key: 'attendance', width: 16 },
      { header: 'Combined Status', key: 'combinedStatus', width: 28 },
      { header: 'Arrival Time', key: 'arrivalTime', width: 16 },
      { header: 'Method', key: 'method', width: 18 },
      { header: 'Points', key: 'points', width: 10 },
    ];

    const formatCombinedLabel = (st: string) => {
      switch (st) {
        case 'AVAILABLE_ATTENDED':
          return 'Available + Attended';
        case 'AVAILABLE_ABSENT':
          return 'Available + Did Not Attend';
        case 'UNAVAILABLE_ATTENDED':
          return 'Not Available + Attended';
        case 'UNAVAILABLE_ABSENT':
          return 'Not Available + Did Not Attend';
        case 'NO_RESPONSE_ATTENDED':
          return 'No Response + Attended';
        case 'NO_RESPONSE_ABSENT':
          return 'No Response + Did Not Attend';
        default:
          return st;
      }
    };

    for (const r of report.records) {
      sheetRecords.addRow({
        memberCode: r.memberCode,
        memberName: r.memberName,
        subTeam: r.subTeamName,
        meetingTitle: r.meetingTitle,
        date: r.meetingDate ? r.meetingDate.toISOString().split('T')[0] : 'N/A',
        availability: r.availabilityStatus === 'AVAILABLE' ? 'Available' : r.availabilityStatus === 'NOT_AVAILABLE' ? 'Not Available' : 'No Response',
        attendance: r.attendanceStatus === 'ATTENDED' ? 'Attended' : r.attendanceStatus === 'ABSENT' ? 'Absent' : r.attendanceStatus,
        combinedStatus: formatCombinedLabel(r.combinedStatus),
        arrivalTime: r.arrivalTime ? r.arrivalTime.toISOString().split('T')[1].slice(0, 8) : '—',
        method: r.attendanceMethod || '—',
        points: r.pointsEarned,
      });
    }

    // Sheet 2: Service Level Summaries
    const sheetServices = workbook.addWorksheet('Service Summaries');
    sheetServices.columns = [
      { header: 'Service Title', key: 'title', width: 32 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Official Physical Headcount', key: 'officialHeadcount', width: 26 },
      { header: 'App Attended', key: 'attended', width: 14 },
      { header: 'App Expected', key: 'expected', width: 14 },
      { header: 'Available + Attended', key: 'availAttended', width: 20 },
      { header: 'Available + Absent', key: 'availAbsent', width: 18 },
      { header: 'Unavailable + Attended', key: 'unavailAttended', width: 22 },
      { header: 'No Response + Attended', key: 'noRespAttended', width: 22 },
      { header: 'Conversion Rate %', key: 'conversionRate', width: 18 },
      { header: 'Attendance Rate %', key: 'attendanceRate', width: 18 },
      { header: 'Response Rate %', key: 'responseRate', width: 18 },
    ];

    for (const s of report.serviceSummaries) {
      sheetServices.addRow({
        title: s.title,
        date: s.meetingDate ? s.meetingDate.toISOString().split('T')[0] : 'N/A',
        category: s.categoryName,
        officialHeadcount: s.officialHeadcount != null ? s.officialHeadcount : 'N/A',
        attended: s.totalAttended,
        expected: s.totalExpectedMembers,
        availAttended: s.availableAndAttended,
        availAbsent: s.availableAndAbsent,
        unavailAttended: s.unavailableAndAttended,
        noRespAttended: s.noResponseAndAttended,
        conversionRate: `${s.conversionRate}%`,
        attendanceRate: `${s.attendanceRate}%`,
        responseRate: `${s.availabilityResponseRate}%`,
      });
    }

    // Sheet 3: Monthly Trends
    const sheetMonthly = workbook.addWorksheet('Monthly Trends');
    sheetMonthly.columns = [
      { header: 'Month', key: 'month', width: 20 },
      { header: 'Services Held', key: 'servicesHeld', width: 15 },
      { header: 'Availability Submissions', key: 'submissions', width: 24 },
      { header: 'Available', key: 'available', width: 14 },
      { header: 'Not Available', key: 'unavailable', width: 15 },
      { header: 'No Response', key: 'noResponse', width: 14 },
      { header: 'Total Attended', key: 'attended', width: 15 },
      { header: 'Available + Attended', key: 'availAttended', width: 20 },
      { header: 'Available + Absent', key: 'availAbsent', width: 18 },
      { header: 'Attendance Rate %', key: 'attendanceRate', width: 18 },
      { header: 'Response Rate %', key: 'responseRate', width: 18 },
      { header: 'Conversion Rate %', key: 'conversionRate', width: 18 },
    ];

    for (const m of report.monthlySummaries) {
      sheetMonthly.addRow({
        month: m.monthLabel,
        servicesHeld: m.servicesHeld,
        submissions: m.totalSubmissions,
        available: m.totalAvailable,
        unavailable: m.totalUnavailable,
        noResponse: m.totalNoResponse,
        attended: m.totalAttended,
        availAttended: m.availableAndAttended,
        availAbsent: m.availableAndAbsent,
        attendanceRate: `${m.attendanceRate}%`,
        responseRate: `${m.availabilityResponseRate}%`,
        conversionRate: `${m.conversionRate}%`,
      });
    }

    // Sheet 4: KPI Summary & Filter Manifest
    const sheetSummary = workbook.addWorksheet('Report Executive Summary');
    sheetSummary.columns = [
      { header: 'Metric / Parameter', key: 'key', width: 35 },
      { header: 'Value', key: 'value', width: 30 },
    ];

    sheetSummary.addRow({ key: 'Reporting Period Start (WAT)', value: report.since.toISOString() });
    sheetSummary.addRow({ key: 'Reporting Period End (WAT)', value: report.until.toISOString() });
    sheetSummary.addRow({ key: 'Total Services Analyzed', value: report.summary.totalMeetingsHeld });
    sheetSummary.addRow({ key: 'Total Active Unit Members', value: report.summary.totalActiveMembers });
    sheetSummary.addRow({ key: 'Total Filtered Records', value: report.summary.totalRecords });
    sheetSummary.addRow({ key: 'Available + Attended', value: report.summary.availableAndAttended });
    sheetSummary.addRow({ key: 'Available + Did Not Attend', value: report.summary.availableAndAbsent });
    sheetSummary.addRow({ key: 'Not Available + Attended', value: report.summary.unavailableAndAttended });
    sheetSummary.addRow({ key: 'Not Available + Did Not Attend', value: report.summary.unavailableAndAbsent });
    sheetSummary.addRow({ key: 'No Response + Attended', value: report.summary.noResponseAndAttended });
    sheetSummary.addRow({ key: 'No Response + Did Not Attend', value: report.summary.noResponseAndAbsent });
    sheetSummary.addRow({ key: 'Commitment Conversion Rate', value: `${report.summary.conversionRate}%` });
    sheetSummary.addRow({ key: 'Availability Response Rate', value: `${report.summary.availabilityResponseRate}%` });
    sheetSummary.addRow({ key: 'Overall Attendance Rate', value: `${report.summary.attendanceRate}%` });
    sheetSummary.addRow({ key: 'Total Official Sanctuary Headcount', value: report.summary.totalPhysicalHeadcount });
    sheetSummary.addRow({ key: 'Average Official Headcount', value: report.summary.averagePhysicalHeadcount });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Legacy analytics support
  async getAnalytics(days: number, from?: string, to?: string, filters: { categoryId?: string; memberId?: string; subTeamId?: string } = {}) {
    if (![7, 14, 30, 60, 90, 180, 365].includes(days)) throw new BadRequestException('Choose 7, 14, 30, 60, 90, 180 or 365 days');
    const key = JSON.stringify([days, from, to, filters]);
    return this.cache.wrap(`reports:analytics:${key}`, 60, async () => {
      const now = to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999+01:00` : to) : new Date();
      const since = from ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00+01:00` : from) : new Date(now.getTime() - days * 86400000);
      if (!Number.isFinite(now.getTime()) || !Number.isFinite(since.getTime()) || since > now) throw new BadRequestException('Choose a valid reporting date range');
      const memberFilter = { ...(filters.memberId ? { memberId: filters.memberId } : {}), ...(filters.subTeamId ? { member: { subTeamId: filters.subTeamId } } : {}) };
      const meetings = await this.prisma.meeting.findMany({
        where: { startTime: { gte: since, lte: now }, status: 'CLOSED', ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) },
        select: {
          id: true,
          title: true,
          startTime: true,
          category: { select: { name: true } },
          attendanceRecords: { where: memberFilter, select: { status: true } },
          headcount: {
            select: {
              totalHeadcount: true,
              maleCount: true,
              femaleCount: true,
              childrenCount: true,
              notes: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      });
      const periodMeeting = { ...(filters.categoryId ? { categoryId: filters.categoryId } : {}), startTime: { gte: since, lte: now }, status: { not: 'CANCELLED' as const } };
      const [responses, excuses, members] = await Promise.all([
        this.prisma.eventResponse.groupBy({ by: ['attending'], where: { meeting: periodMeeting, ...memberFilter }, _count: { _all: true } }),
        this.prisma.absenceExcuse.groupBy({ by: ['status'], where: { meeting: periodMeeting, ...memberFilter }, _count: { _all: true } }),
        this.prisma.member.groupBy({ by: ['status'], where: { ...(filters.memberId ? { id: filters.memberId } : {}), ...(filters.subTeamId ? { subTeamId: filters.subTeamId } : {}) }, _count: { _all: true } }),
      ]);
      const statuses: Record<string, number> = {};
      const categories: Record<string, { name: string; attended: number; absent: number; excused: number; headcount: number }> = {};
      let totalHeadcount = 0;
      let totalMale = 0;
      let totalFemale = 0;
      let totalChildren = 0;
      let headcountServicesCount = 0;

      const services = meetings.map((meeting) => {
        let attended = 0, punctual = 0, absent = 0, excused = 0;
        for (const record of meeting.attendanceRecords) {
          statuses[record.status] = (statuses[record.status] || 0) + 1;
          if (['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(record.status)) attended++;
          if (['EARLY', 'ON_TIME'].includes(record.status)) punctual++;
          if (record.status === 'ABSENT') absent++;
          if (record.status === 'EXCUSED') excused++;
        }
        const hc = meeting.headcount ? meeting.headcount.totalHeadcount : null;
        if (meeting.headcount) {
          totalHeadcount += meeting.headcount.totalHeadcount;
          totalMale += meeting.headcount.maleCount ?? 0;
          totalFemale += meeting.headcount.femaleCount ?? 0;
          totalChildren += meeting.headcount.childrenCount ?? 0;
          headcountServicesCount++;
        }
        const group = (categories[meeting.category.name] ||= { name: meeting.category.name, attended: 0, absent: 0, excused: 0, headcount: 0 });
        group.attended += attended; group.absent += absent; group.excused += excused;
        if (hc) group.headcount += hc;
        return {
          id: meeting.id,
          title: meeting.title,
          date: meeting.startTime,
          attended,
          punctual,
          absent,
          excused,
          headcount: hc,
          maleCount: meeting.headcount?.maleCount ?? null,
          femaleCount: meeting.headcount?.femaleCount ?? null,
          childrenCount: meeting.headcount?.childrenCount ?? null,
          variance: hc !== null ? hc - attended : null,
          notes: meeting.headcount?.notes ?? null,
        };
      });
      const totals = services.reduce((sum, service) => ({
        attended: sum.attended + service.attended,
        punctual: sum.punctual + service.punctual,
        absent: sum.absent + service.absent,
        excused: sum.excused + service.excused,
      }), { attended: 0, punctual: 0, absent: 0, excused: 0 });
      const rate = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : null;
      return { days, since, until: now, services, statuses, categories: Object.values(categories), totals,
        attendanceRate: rate(totals.attended, totals.attended + totals.absent), punctualityRate: rate(totals.punctual, totals.attended),
        officialHeadcountSummary: {
          totalHeadcount,
          headcountServicesCount,
          averageHeadcount: headcountServicesCount ? Math.round((totalHeadcount / headcountServicesCount) * 10) / 10 : 0,
          demographics: {
            male: totalMale,
            female: totalFemale,
            children: totalChildren,
          },
        },
        responses: { attending: responses.find((r) => r.attending)?._count._all || 0, notAttending: responses.find((r) => !r.attending)?._count._all || 0 },
        excuses: Object.fromEntries(excuses.map((r) => [r.status, r._count._all])), members: Object.fromEntries(members.map((r) => [r.status, r._count._all])),
      };
    }, ['analytics', 'attendance', 'excuses', 'members']);
  }

  async getUnitDashboardStats() {
    return this.cache.wrap('reports:unit_dashboard', 30, async () => {
      const [totalActiveMembers, meetingsHeld, summaries, activeFlagsCount, pendingExcusesCount] = await Promise.all([
        this.prisma.member.count({ where: { status: MemberStatus.ACTIVE } }),
        this.prisma.meeting.count({ where: { status: 'CLOSED' } }),
        this.prisma.attendanceRecord.groupBy({ by: ['status'], where: { meeting: { status: 'CLOSED' } }, _count: { _all: true } }),
        this.prisma.followUpFlag.count({ where: { isResolved: false } }),
        this.prisma.absenceExcuse.count({ where: { status: 'PENDING' } }),
      ]);
      const count = (status: string) => summaries.find((row) => row.status === status)?._count._all ?? 0;
      const present = count('EARLY') + count('ON_TIME') + count('GRACE_PERIOD') + count('LATE');
      const expected = present + count('ABSENT');
      const avgAttendance = expected ? Math.round(present / expected * 1000) / 10 : 0;
      const avgPunctuality = present ? Math.round((count('EARLY') + count('ON_TIME')) / present * 1000) / 10 : 0;

      return {
        totalActiveMembers,
        meetingsHeld,
        avgAttendance,
        avgPunctuality,
        activeFlagsCount,
        pendingExcusesCount,
      };
    }, ['analytics', 'attendance', 'excuses', 'members', 'dashboard']);
  }

  // Legacy full CSV/Excel export for audit logs & headcount
  async generateCsvReport() {
    return this.generateFilteredCsv({});
  }

  async generateExcelReport(): Promise<Buffer> {
    return this.generateFilteredExcel({});
  }
}
