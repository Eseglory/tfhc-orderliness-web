import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  AttendanceStatus,
  ExcuseStatus,
  Prisma,
} from '@prisma/client';

export type DatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'THIS_YEAR'
  | 'CUSTOM'
  | 'SPECIFIC_DATE'
  | 'SPECIFIC_SERVICE_DATE';

export interface TimetableSearchFilterDto {
  search?: string;
  query?: string;
  datePreset?: DatePreset;
  preset?: DatePreset;
  startDate?: string;
  endDate?: string;
  serviceDate?: string;
  sessionKeys?: string[];
  serviceScheduleIds?: string[];
  supervisingMinisterIds?: string[];
  memberIds?: string[];
  positions?: string[];
  attendanceStatuses?: Array<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'SCHEDULED' | 'DISCREPANCY'>;
  clockInFilter?: 'ALL' | 'RECORDED' | 'MISSING';
  timetableStatuses?: string[];
  isManualAdjustment?: boolean;
  assignmentFrequency?: 'ALL' | 'NEVER_ASSIGNED' | 'REPEATED';
  page?: number;
  limit?: number;
  sortBy?: 'serviceDate' | 'memberName' | 'serviceName' | 'attendanceStatus' | 'clockInTime';
  sortOrder?: 'asc' | 'desc';
}

export interface CorrelatedAssignmentItem {
  id: string; // assignmentId
  assignmentId: string;
  sessionId: string;
  sessionKey: string;
  serviceName: string;
  serviceTitle?: string;
  serviceDay: string;
  serviceDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm or ISO
  endTime: string | null;
  serviceScheduleId: string | null;
  periodId: string;
  periodLabel: string;
  versionNumber: number;
  versionStatus: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  fullName: string;
  memberPhone?: string | null;
  profilePhotoUrl?: string | null;
  role: string;
  position: string | null;
  isManualAdjustment: boolean;
  adjustmentReason?: string | null;
  supervisingMinisterId: string | null;
  supervisingMinisterName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  attendanceRecordId: string | null;
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'SCHEDULED' | 'UNMATCHED';
  subStatus?: string | null;
  clockInTime: string | null;
  clockInRecorded: boolean;
  isDiscrepancy: boolean;
  discrepancyReason: string | null;
  isCompleted: boolean;
}

export interface DashboardAnalyticsResponse {
  reportingPeriod: {
    preset: DatePreset;
    startDate: string;
    endDate: string;
    label: string;
  };
  period?: {
    preset: DatePreset;
    startDate: string;
    endDate: string;
    label: string;
  };
  summary: {
    totalTimetablesGenerated: number;
    totalPublishedTimetables: number;
    totalPendingApprovals: number;
    totalRejectedTimetables: number;
    totalSessions: number;
    totalAssignments: number;
    totalUniqueMembersAssigned: number;
    averageAssignmentsPerMember: number;
    averageTurnaroundHours: number;
    manualAdjustmentCount: number;
    modificationRatePercent: number;
  };
  overview?: {
    totalAssignments: number;
    totalRequiredSlots: number;
    coverageRate: number;
    attendanceRate: number;
    attendedAssignments: number;
    completedServiceAssignments: number;
    publishedTimetables: number;
    totalTimetables: number;
    pendingTimetables: number;
    avgApprovalTurnaroundHours: number;
  };
  attendanceSummary: {
    totalScheduledAssignments: number;
    completedAssignments: number;
    futureOrPendingAssignments: number;
    totalPresent: number;
    totalLate: number;
    totalAbsent: number;
    totalExcused: number;
    totalMissingClockIn: number;
    totalDiscrepancies: number;
    attendanceRatePercent: number; // (Present + Late) / Completed * 100
    punctualRatePercent: number; // Present / Completed * 100
    serviceCoveragePercent: number; // Total Assigned / Required * 100
  };
  attendance?: {
    presentCount: number;
    lateCount: number;
    absentCount: number;
    excusedCount: number;
    upcomingScheduledCount: number;
    punctualityRate: number;
    earlyPresent: number;
    onTimePresent: number;
    gracePeriodPresent: number;
    clockInComplianceRate: number;
    missingClockInCount: number;
    discrepancyCount: number;
  };
  fairness: {
    totalEligibleMembers: number;
    averageAssignmentsPerEligible: number;
    averageAssignmentsPerMember?: number;
    standardDeviation?: number;
    assignedAboveAverageCount: number;
    assignedBelowAverageCount: number;
    neverAssignedCount: number;
    membersWithZeroAssignmentsCount?: number;
    highestAssignedMembers: Array<{ memberId: string; name: string; memberCode: string; count: number }>;
    lowestAssignedMembers: Array<{ memberId: string; name: string; memberCode: string; count: number }>;
    topAssignedMembers?: Array<{ memberId: string; fullName: string; memberCode: string; assignmentCount: number }>;
    zeroAssignmentMembers?: Array<{ memberId: string; fullName: string; memberCode: string }>;
    distributionHistogram: Array<any>;
  };
  serviceBreakdown: Array<{
    sessionKey: string;
    serviceName: string;
    serviceDay: string;
    totalSessions: number;
    requiredUshers: number;
    assignedUshers: number;
    coveragePercent: number;
    completedCount: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    excusedCount: number;
    attendanceRatePercent: number;
  }>;
  services?: Array<any>;
  supervisingMinisterBreakdown: Array<{
    ministerId: string;
    ministerName: string;
    servicesSupervised: number;
    totalScheduledUshers: number;
    presentUshers: number;
    absentUshers: number;
    attendanceRatePercent: number;
  }>;
  ministers?: Array<any>;
  trends: any;
  comparison?: {
    previousPeriodLabel: string;
    previousAttendanceRatePercent: number;
    attendanceRateDiff: number;
    previousCoveragePercent: number;
    coverageDiff: number;
    previousTotalAssignments: number;
  };
}

@Injectable()
export class TimetableAnalyticsService {
  private readonly logger = new Logger(TimetableAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a DatePreset or custom date range into explicit UTC/WAT boundaries.
   */
  parseDateRange(
    dtoOrPreset?: TimetableSearchFilterDto | DatePreset,
    startDateStr?: string,
    endDateStr?: string,
    serviceDateStr?: string,
  ): { startDate: Date; endDate: Date; preset: DatePreset; label: string } {
    const dto: TimetableSearchFilterDto =
      typeof dtoOrPreset === 'string'
        ? {
            datePreset: dtoOrPreset as DatePreset,
            startDate: startDateStr,
            endDate: endDateStr,
            serviceDate: serviceDateStr,
          }
        : dtoOrPreset || {};

    const now = new Date();
    const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';

    // Format current date in WAT
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayParts = formatter.format(now).split('-');
    const year = parseInt(todayParts[0], 10);
    const month = parseInt(todayParts[1], 10) - 1; // 0-based
    const day = parseInt(todayParts[2], 10);

    const preset: DatePreset =
      dto.datePreset ||
      dto.preset ||
      (dto.startDate && dto.endDate
        ? 'CUSTOM'
        : dto.serviceDate
        ? 'SPECIFIC_SERVICE_DATE'
        : 'THIS_MONTH');

    let start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    let end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    let label = 'Custom Range';

    switch (preset) {
      case 'TODAY': {
        label = 'Today';
        break;
      }
      case 'YESTERDAY': {
        start = new Date(Date.UTC(year, month, day - 1, 0, 0, 0, 0));
        end = new Date(Date.UTC(year, month, day - 1, 23, 59, 59, 999));
        label = 'Yesterday';
        break;
      }
      case 'THIS_WEEK': {
        // Find Monday of this week
        const curDay = (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7; // 0 for Monday
        start = new Date(Date.UTC(year, month, day - curDay, 0, 0, 0, 0));
        end = new Date(Date.UTC(year, month, day - curDay + 6, 23, 59, 59, 999));
        label = 'This Week';
        break;
      }
      case 'LAST_WEEK': {
        const curDay = (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
        start = new Date(Date.UTC(year, month, day - curDay - 7, 0, 0, 0, 0));
        end = new Date(Date.UTC(year, month, day - curDay - 1, 23, 59, 59, 999));
        label = 'Last Week';
        break;
      }
      case 'THIS_MONTH': {
        start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        end = new Date(Date.UTC(year, month, lastDay, 23, 59, 59, 999));
        label = 'This Month';
        break;
      }
      case 'LAST_MONTH': {
        start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        end = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999));
        label = 'Last Month';
        break;
      }
      case 'THIS_QUARTER': {
        const quarter = Math.floor(month / 3);
        start = new Date(Date.UTC(year, quarter * 3, 1, 0, 0, 0, 0));
        const lastMonthOfQ = quarter * 3 + 2;
        const lastDayOfQ = new Date(Date.UTC(year, lastMonthOfQ + 1, 0)).getUTCDate();
        end = new Date(Date.UTC(year, lastMonthOfQ, lastDayOfQ, 23, 59, 59, 999));
        label = `Q${quarter + 1} ${year}`;
        break;
      }
      case 'THIS_YEAR': {
        start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        label = `Year ${year}`;
        break;
      }
      case 'SPECIFIC_DATE':
      case 'SPECIFIC_SERVICE_DATE': {
        const targetDate = dto.serviceDate || serviceDateStr;
        if (targetDate) {
          const d = new Date(targetDate);
          start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
          end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
          label = `Specific Date: ${targetDate}`;
        }
        break;
      }
      case 'CUSTOM':
      default: {
        if (dto.startDate) {
          const s = new Date(dto.startDate);
          start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0));
        }
        if (dto.endDate) {
          const e = new Date(dto.endDate);
          end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate(), 23, 59, 59, 999));
        }
        label = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
        break;
      }
    }

    return { startDate: start, endDate: end, preset, label };
  }

  /**
   * Correlates timetable sessions and assignments with existing Meetings, AttendanceRecords,
   * and approved AbsenceExcuses within the given date range.
   */
  async correlateAssignments(params: {
    startDate: Date;
    endDate: Date;
    filter?: TimetableSearchFilterDto;
  }): Promise<CorrelatedAssignmentItem[]> {
    const { startDate, endDate, filter } = params;
    const now = new Date();

    // 1. Fetch relevant service sessions with assignments and version metadata
    const sessions = await this.prisma.timetableServiceSession.findMany({
      where: {
        serviceDate: { gte: startDate, lte: endDate },
        ...(filter?.sessionKeys && filter.sessionKeys.length > 0 ? { sessionKey: { in: filter.sessionKeys } } : {}),
        version: {
          ...(filter?.timetableStatuses && filter.timetableStatuses.length > 0
            ? { status: { in: filter.timetableStatuses as TimetableVersionStatus[] } }
            : { status: { in: [TimetableVersionStatus.PUBLISHED, TimetableVersionStatus.APPROVED, TimetableVersionStatus.PENDING_REVIEW] } }),
        },
      },
      include: {
        version: {
          include: { period: true },
        },
        assignments: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                memberCode: true,
                phoneNumber: true,
                profilePhotoUrl: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }],
    });

    if (sessions.length === 0) return [];

    // 2. Fetch all meetings falling in this date range to cross-correlate
    const meetings = await this.prisma.meeting.findMany({
      where: {
        meetingDate: { gte: startDate, lte: endDate },
      },
      include: {
        supervisingMinister: {
          select: { id: true, firstName: true, lastName: true },
        },
        attendanceRecords: {
          select: {
            id: true,
            memberId: true,
            status: true,
            actualArrivalTime: true,
            pointsEarned: true,
          },
        },
        excuseRequests: {
          where: { status: ExcuseStatus.APPROVED },
          select: { id: true, memberId: true, reason: true },
        },
      },
    });

    // Create meeting lookup map: dateString_serviceScheduleId -> meeting
    const meetingMap = new Map<string, typeof meetings[0]>();
    for (const m of meetings) {
      const dateStr = m.meetingDate.toISOString().slice(0, 10);
      if (m.serviceScheduleId) {
        meetingMap.set(`${dateStr}_${m.serviceScheduleId}`, m);
      }
      // Also index by title lower for fallback
      meetingMap.set(`${dateStr}_title_${m.title.toLowerCase().trim()}`, m);
    }

    const correlatedList: CorrelatedAssignmentItem[] = [];

    for (const session of sessions) {
      const dateStr = session.serviceDate.toISOString().slice(0, 10);

      // Match meeting
      let matchedMeeting = session.serviceScheduleId
        ? meetingMap.get(`${dateStr}_${session.serviceScheduleId}`)
        : undefined;

      if (!matchedMeeting) {
        // Fallback title match
        const searchKey = session.serviceName.toLowerCase();
        matchedMeeting = meetings.find((m) => {
          const mDate = m.meetingDate.toISOString().slice(0, 10);
          if (mDate !== dateStr) return false;
          const t = m.title.toLowerCase();
          if (session.sessionKey === 'SUNDAY_SECOND' && (t.includes('second') || m.serviceScheduleId === 'sunday-second')) return true;
          if (session.sessionKey === 'SUNDAY_THIRD' && (t.includes('third') || m.serviceScheduleId === 'sunday-third')) return true;
          if (session.sessionKey === 'TUESDAY_MIDWEEK' && (t.includes('mid-week') || t.includes('midweek') || m.serviceScheduleId === 'tuesday-midweek')) return true;
          if (session.sessionKey === 'THURSDAY_DIVINE' && (t.includes('divine') || m.serviceScheduleId === 'thursday-divine')) return true;
          if (session.sessionKey === 'SATURDAY_SEATS' && (t.includes('seat') || m.serviceScheduleId === 'saturday-seat-arrangement')) return true;
          return t.includes(searchKey);
        });
      }

      const sessionStartTime = new Date(session.startTime);
      const isCompleted = matchedMeeting
        ? (matchedMeeting.endTime ? new Date(matchedMeeting.endTime) < now : new Date(matchedMeeting.meetingDate) < now)
        : (session.endTime ? new Date(session.endTime) < now : sessionStartTime < now);

      for (const assignment of session.assignments) {
        const mem = assignment.member;
        const memberName = `${mem.firstName} ${mem.lastName}`.trim();

        let attendanceRecordId: string | null = null;
        let attendanceStatus: CorrelatedAssignmentItem['attendanceStatus'] = 'SCHEDULED';
        let subStatus: string | null = null;
        let clockInTime: string | null = null;
        let clockInRecorded = false;
        let isDiscrepancy = false;
        let discrepancyReason: string | null = null;

        if (matchedMeeting) {
          const record = matchedMeeting.attendanceRecords.find((r) => r.memberId === mem.id);
          const excuse = matchedMeeting.excuseRequests.find((e) => e.memberId === mem.id);

          if (record) {
            attendanceRecordId = record.id;
            clockInRecorded = Boolean(record.actualArrivalTime);
            clockInTime = record.actualArrivalTime ? record.actualArrivalTime.toISOString() : null;

            if (([AttendanceStatus.EARLY, AttendanceStatus.ON_TIME, AttendanceStatus.GRACE_PERIOD] as AttendanceStatus[]).includes(record.status)) {
              attendanceStatus = 'PRESENT';
              subStatus = record.status;
            } else if (record.status === AttendanceStatus.LATE) {
              attendanceStatus = 'LATE';
              subStatus = 'LATE';
            } else if (record.status === AttendanceStatus.EXCUSED) {
              attendanceStatus = 'EXCUSED';
              subStatus = 'EXCUSED';
            } else if (record.status === AttendanceStatus.ABSENT) {
              attendanceStatus = 'ABSENT';
              subStatus = 'ABSENT';
              isDiscrepancy = true;
              discrepancyReason = 'Marked absent in service attendance';
            } else {
              attendanceStatus = 'PRESENT';
              subStatus = record.status;
            }
          } else if (excuse) {
            attendanceStatus = 'EXCUSED';
            subStatus = 'APPROVED_EXCUSE';
          } else if (isCompleted) {
            attendanceStatus = 'ABSENT';
            subStatus = 'CLOCK_IN_MISSING';
            isDiscrepancy = true;
            discrepancyReason = 'Scheduled usher failed to clock in for service';
          } else {
            attendanceStatus = 'SCHEDULED';
            subStatus = 'NOT_YET_RECORDED';
          }
        } else {
          // No meeting in database
          if (isCompleted) {
            attendanceStatus = 'UNMATCHED';
            subStatus = 'MEETING_PENDING';
            isDiscrepancy = true;
            discrepancyReason = 'Service session has no linked meeting record in attendance';
          } else {
            attendanceStatus = 'SCHEDULED';
            subStatus = 'UPCOMING_SERVICE';
          }
        }

        correlatedList.push({
          id: assignment.id,
          assignmentId: assignment.id,
          sessionId: session.id,
          sessionKey: session.sessionKey,
          serviceName: session.serviceName,
          serviceTitle: session.serviceName,
          serviceDay: session.serviceDay,
          serviceDate: dateStr,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime ? session.endTime.toISOString() : null,
          serviceScheduleId: session.serviceScheduleId,
          periodId: session.version.periodId,
          periodLabel: session.version.period.label,
          versionNumber: session.version.versionNumber,
          versionStatus: session.version.status,
          memberId: mem.id,
          memberCode: mem.memberCode,
          memberName,
          fullName: memberName,
          memberPhone: mem.phoneNumber,
          profilePhotoUrl: mem.profilePhotoUrl,
          role: assignment.role,
          position: assignment.position,
          isManualAdjustment: assignment.isManualAdjustment,
          adjustmentReason: assignment.adjustmentReason,
          supervisingMinisterId: matchedMeeting?.supervisingMinisterId || null,
          supervisingMinisterName: matchedMeeting?.supervisingMinister
            ? `${matchedMeeting.supervisingMinister.firstName} ${matchedMeeting.supervisingMinister.lastName}`.trim()
            : null,
          meetingId: matchedMeeting?.id || null,
          meetingTitle: matchedMeeting?.title || null,
          attendanceRecordId,
          attendanceStatus,
          subStatus,
          clockInTime,
          clockInRecorded,
          isDiscrepancy,
          discrepancyReason,
          isCompleted,
        });
      }
    }

    return correlatedList;
  }

  /**
   * Advanced multi-criteria search and filtering over correlated timetable assignments.
   * Performs backend filtering, sorting, and pagination.
   */
  async searchAssignments(dto: TimetableSearchFilterDto) {
    const { startDate, endDate, preset, label } = this.parseDateRange(dto);
    const allItems = await this.correlateAssignments({ startDate, endDate, filter: dto });

    // In-memory multi-attribute filtering (fast & deterministic after backend join)
    let filtered = allItems;

    // Search query (member name, code, service name, position)
    const queryTerm = (dto.search || dto.query || '').toLowerCase().trim();
    if (queryTerm) {
      filtered = filtered.filter(
        (item) =>
          item.memberName.toLowerCase().includes(queryTerm) ||
          item.fullName.toLowerCase().includes(queryTerm) ||
          item.memberCode.toLowerCase().includes(queryTerm) ||
          item.serviceName.toLowerCase().includes(queryTerm) ||
          (item.position && item.position.toLowerCase().includes(queryTerm)),
      );
    }

    // Specific member IDs
    if (dto.memberIds && dto.memberIds.length > 0) {
      const set = new Set(dto.memberIds);
      filtered = filtered.filter((item) => set.has(item.memberId));
    }

    // Positions
    if (dto.positions && dto.positions.length > 0) {
      const set = new Set(dto.positions.map((p) => p.toUpperCase()));
      filtered = filtered.filter((item) => item.position && set.has(item.position.toUpperCase()));
    }

    // Attendance status filters
    if (dto.attendanceStatuses && dto.attendanceStatuses.length > 0) {
      const set = new Set(dto.attendanceStatuses);
      filtered = filtered.filter((item) => {
        if (set.has('DISCREPANCY') && item.isDiscrepancy) return true;
        return set.has(item.attendanceStatus as any);
      });
    }

    // Clock-in filter
    if (dto.clockInFilter === 'RECORDED') {
      filtered = filtered.filter((item) => item.clockInRecorded);
    } else if (dto.clockInFilter === 'MISSING') {
      filtered = filtered.filter((item) => !item.clockInRecorded && item.isCompleted);
    }

    // Supervising ministers
    if (dto.supervisingMinisterIds && dto.supervisingMinisterIds.length > 0) {
      const set = new Set(dto.supervisingMinisterIds);
      filtered = filtered.filter((item) => item.supervisingMinisterId && set.has(item.supervisingMinisterId));
    }

    // Manual adjustment filter
    if (dto.isManualAdjustment !== undefined) {
      filtered = filtered.filter((item) => item.isManualAdjustment === dto.isManualAdjustment);
    }

    // Assignment frequency filter
    if (dto.assignmentFrequency === 'REPEATED') {
      const countMap = new Map<string, number>();
      allItems.forEach((i) => countMap.set(i.memberId, (countMap.get(i.memberId) || 0) + 1));
      filtered = filtered.filter((item) => (countMap.get(item.memberId) || 0) > 1);
    }

    // Sorting
    const sortBy = dto.sortBy || 'serviceDate';
    const sortOrder = dto.sortOrder || 'desc';

    filtered.sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortBy === 'serviceDate') {
        valA = a.serviceDate + a.startTime;
        valB = b.serviceDate + b.startTime;
      } else if (sortBy === 'memberName') {
        valA = a.memberName.toLowerCase();
        valB = b.memberName.toLowerCase();
      } else if (sortBy === 'serviceName') {
        valA = a.serviceName.toLowerCase();
        valB = b.serviceName.toLowerCase();
      } else if (sortBy === 'attendanceStatus') {
        valA = a.attendanceStatus;
        valB = b.attendanceStatus;
      } else if (sortBy === 'clockInTime') {
        valA = a.clockInTime || '';
        valB = b.clockInTime || '';
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const totalCount = filtered.length;
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 25));
    const totalPages = Math.ceil(totalCount / limit);
    const paginatedItems = filtered.slice((page - 1) * limit, page * limit);

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      filterSummary: {
        preset,
        label,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        search: dto.search || null,
        activeFiltersCount: [
          dto.search,
          dto.sessionKeys?.length,
          dto.attendanceStatuses?.length,
          dto.positions?.length,
          dto.supervisingMinisterIds?.length,
          dto.clockInFilter && dto.clockInFilter !== 'ALL',
        ].filter(Boolean).length,
      },
    };
  }

  /**
   * Computes comprehensive timetable, attendance, fairness, and service-level analytics.
   */
  async getDashboardAnalytics(dto: TimetableSearchFilterDto): Promise<DashboardAnalyticsResponse> {
    const { startDate, endDate, preset, label } = this.parseDateRange(dto);
    const allItems = await this.correlateAssignments({ startDate, endDate, filter: dto });

    // 1. Timetable Periods metadata
    const periods = await this.prisma.timetablePeriod.findMany({
      where: {
        weekStart: { gte: startDate, lte: endDate },
      },
      include: {
        versions: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            createdAt: true,
            publishedAt: true,
          },
        },
      },
    });

    let totalTimetablesGenerated = 0;
    let totalPublishedTimetables = 0;
    let totalPendingApprovals = 0;
    let totalRejectedTimetables = 0;
    let totalTurnaroundHoursSum = 0;
    let turnaroundCount = 0;

    for (const p of periods) {
      totalTimetablesGenerated += p.versions.length;
      for (const v of p.versions) {
        if (v.status === TimetableVersionStatus.PUBLISHED) {
          totalPublishedTimetables++;
          if (v.publishedAt) {
            const hours = (v.publishedAt.getTime() - v.createdAt.getTime()) / (1000 * 60 * 60);
            totalTurnaroundHoursSum += Math.max(0, hours);
            turnaroundCount++;
          }
        } else if (v.status === TimetableVersionStatus.PENDING_REVIEW) {
          totalPendingApprovals++;
        } else if (v.status === TimetableVersionStatus.REJECTED) {
          totalRejectedTimetables++;
        }
      }
    }

    const averageTurnaroundHours = turnaroundCount > 0 ? Number((totalTurnaroundHoursSum / turnaroundCount).toFixed(1)) : 0;

    // 2. Attendance & Staffing aggregations
    const uniqueSessions = new Set(allItems.map((i) => i.sessionId));
    const uniqueMembers = new Set(allItems.map((i) => i.memberId));

    let completedAssignments = 0;
    let futureOrPendingAssignments = 0;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalExcused = 0;
    let totalMissingClockIn = 0;
    let totalDiscrepancies = 0;
    let manualAdjustmentCount = 0;
    let earlyPresent = 0;
    let onTimePresent = 0;
    let gracePeriodPresent = 0;

    for (const item of allItems) {
      if (item.isManualAdjustment) manualAdjustmentCount++;
      if (item.isDiscrepancy) totalDiscrepancies++;

      if (item.isCompleted) {
        completedAssignments++;
        if (item.attendanceStatus === 'PRESENT') {
          totalPresent++;
          if (item.subStatus === AttendanceStatus.EARLY) earlyPresent++;
          else if (item.subStatus === AttendanceStatus.GRACE_PERIOD) gracePeriodPresent++;
          else onTimePresent++;
        } else if (item.attendanceStatus === 'LATE') {
          totalLate++;
        } else if (item.attendanceStatus === 'ABSENT') {
          totalAbsent++;
          if (!item.clockInRecorded) totalMissingClockIn++;
        } else if (item.attendanceStatus === 'EXCUSED') {
          totalExcused++;
        }
      } else {
        futureOrPendingAssignments++;
      }
    }

    // Attendance percentages (completed is denominator to avoid treating future as absent)
    const effectiveDenominator = completedAssignments > 0 ? completedAssignments : 1;
    const attendanceRatePercent = Number((((totalPresent + totalLate) / effectiveDenominator) * 100).toFixed(1));
    const punctualRatePercent = Number(((totalPresent / effectiveDenominator) * 100).toFixed(1));
    const modificationRatePercent = allItems.length > 0 ? Number(((manualAdjustmentCount / allItems.length) * 100).toFixed(1)) : 0;

    // 3. Service Breakdown
    const serviceMap = new Map<string, {
      sessionKey: string;
      serviceName: string;
      serviceDay: string;
      totalSessions: Set<string>;
      requiredSum: number;
      assignedCount: number;
      completedCount: number;
      presentCount: number;
      lateCount: number;
      absentCount: number;
      excusedCount: number;
    }>();

    for (const item of allItems) {
      let s = serviceMap.get(item.sessionKey);
      if (!s) {
        s = {
          sessionKey: item.sessionKey,
          serviceName: item.serviceName,
          serviceDay: item.serviceDay,
          totalSessions: new Set<string>(),
          requiredSum: 0,
          assignedCount: 0,
          completedCount: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          excusedCount: 0,
        };
        serviceMap.set(item.sessionKey, s);
      }
      s.totalSessions.add(item.sessionId);
      s.assignedCount++;
      if (item.isCompleted) {
        s.completedCount++;
        if (item.attendanceStatus === 'PRESENT') s.presentCount++;
        else if (item.attendanceStatus === 'LATE') s.lateCount++;
        else if (item.attendanceStatus === 'ABSENT') s.absentCount++;
        else if (item.attendanceStatus === 'EXCUSED') s.excusedCount++;
      }
    }

    const serviceBreakdown = Array.from(serviceMap.values()).map((s) => {
      const denom = s.completedCount > 0 ? s.completedCount : 1;
      return {
        sessionKey: s.sessionKey,
        serviceName: s.serviceName,
        serviceDay: s.serviceDay,
        totalSessions: s.totalSessions.size,
        requiredUshers: s.totalSessions.size * 6, // nominal average standard
        assignedUshers: s.assignedCount,
        coveragePercent: s.totalSessions.size > 0 ? Number(((s.assignedCount / (s.totalSessions.size * 6)) * 100).toFixed(1)) : 100,
        completedCount: s.completedCount,
        presentCount: s.presentCount,
        lateCount: s.lateCount,
        absentCount: s.absentCount,
        excusedCount: s.excusedCount,
        attendanceRatePercent: Number((((s.presentCount + s.lateCount) / denom) * 100).toFixed(1)),
      };
    });

    const totalRequiredSum = serviceBreakdown.reduce((sum, s) => sum + s.requiredUshers, 0);
    const serviceCoveragePercent = totalRequiredSum > 0 ? Number(((allItems.length / totalRequiredSum) * 100).toFixed(1)) : 100;

    // 4. Fairness & Member Distribution
    const memberCounts = new Map<string, { memberId: string; name: string; memberCode: string; count: number }>();
    for (const item of allItems) {
      const m = memberCounts.get(item.memberId) || {
        memberId: item.memberId,
        name: item.memberName,
        memberCode: item.memberCode,
        count: 0,
      };
      m.count++;
      memberCounts.set(item.memberId, m);
    }

    // Get total eligible members in the system
    const totalEligibleMembers = await this.prisma.member.count({
      where: {
        status: 'ACTIVE',
        user: { isNot: null },
      },
    });

    const memberAssignmentList = Array.from(memberCounts.values()).sort((a, b) => b.count - a.count);
    const averageAssignmentsPerMember = uniqueMembers.size > 0 ? Number((allItems.length / uniqueMembers.size).toFixed(1)) : 0;
    const averageAssignmentsPerEligible = totalEligibleMembers > 0 ? Number((allItems.length / totalEligibleMembers).toFixed(1)) : 0;

    const assignedAboveAverageCount = memberAssignmentList.filter((m) => m.count > averageAssignmentsPerMember).length;
    const assignedBelowAverageCount = memberAssignmentList.filter((m) => m.count < averageAssignmentsPerMember).length;
    const neverAssignedCount = Math.max(0, totalEligibleMembers - uniqueMembers.size);

    const counts = memberAssignmentList.map((m) => m.count);
    for (let i = 0; i < neverAssignedCount; i++) counts.push(0);
    const variance =
      counts.length > 0
        ? counts.reduce((acc, c) => acc + Math.pow(c - averageAssignmentsPerEligible, 2), 0) / counts.length
        : 0;
    const stdDev = Number(Math.sqrt(variance).toFixed(1));

    const highestAssignedMembers = memberAssignmentList.slice(0, 10);
    const lowestAssignedMembers = memberAssignmentList.slice(-10).reverse();

    // Distribution Histogram buckets (0, 1, 2, 3, 4+)
    const bucketCounts: Record<string, number> = { '0': neverAssignedCount, '1': 0, '2': 0, '3': 0, '4+': 0 };
    for (const m of memberAssignmentList) {
      if (m.count === 1) bucketCounts['1']++;
      else if (m.count === 2) bucketCounts['2']++;
      else if (m.count === 3) bucketCounts['3']++;
      else bucketCounts['4+']++;
    }
    const distributionHistogram = Object.entries(bucketCounts).map(([bucket, count]) => ({
      bucket: bucket === '0' ? '0 assignments' : bucket === '4+' ? '4+ assignments' : `${bucket} assignments`,
      memberCount: count,
    }));

    // 5. Supervising Minister Breakdown
    const ministerMap = new Map<string, {
      ministerId: string;
      ministerName: string;
      services: Set<string>;
      totalUshers: number;
      present: number;
      absent: number;
    }>();

    for (const item of allItems) {
      if (item.supervisingMinisterId && item.supervisingMinisterName) {
        let min = ministerMap.get(item.supervisingMinisterId);
        if (!min) {
          min = {
            ministerId: item.supervisingMinisterId,
            ministerName: item.supervisingMinisterName,
            services: new Set<string>(),
            totalUshers: 0,
            present: 0,
            absent: 0,
          };
          ministerMap.set(item.supervisingMinisterId, min);
        }
        min.services.add(item.sessionId);
        min.totalUshers++;
        if (item.isCompleted) {
          if (['PRESENT', 'LATE'].includes(item.attendanceStatus)) min.present++;
          else if (item.attendanceStatus === 'ABSENT') min.absent++;
        }
      }
    }

    const supervisingMinisterBreakdown = Array.from(ministerMap.values()).map((m) => {
      const denom = m.present + m.absent > 0 ? m.present + m.absent : 1;
      return {
        ministerId: m.ministerId,
        ministerName: m.ministerName,
        servicesSupervised: m.services.size,
        totalScheduledUshers: m.totalUshers,
        presentUshers: m.present,
        absentUshers: m.absent,
        attendanceRatePercent: Number(((m.present / denom) * 100).toFixed(1)),
      };
    });

    // 6. Time Trends (Daily/Weekly points)
    const dateTrendMap = new Map<string, { present: number; late: number; absent: number; total: number }>();
    for (const item of allItems) {
      let t = dateTrendMap.get(item.serviceDate);
      if (!t) {
        t = { present: 0, late: 0, absent: 0, total: 0 };
        dateTrendMap.set(item.serviceDate, t);
      }
      t.total++;
      if (item.isCompleted) {
        if (item.attendanceStatus === 'PRESENT') t.present++;
        else if (item.attendanceStatus === 'LATE') t.late++;
        else if (item.attendanceStatus === 'ABSENT') t.absent++;
      }
    }

    const sortedDates = Array.from(dateTrendMap.keys()).sort();
    const trends = {
      dates: sortedDates,
      presentSeries: sortedDates.map((d) => dateTrendMap.get(d)!.present),
      lateSeries: sortedDates.map((d) => dateTrendMap.get(d)!.late),
      absentSeries: sortedDates.map((d) => dateTrendMap.get(d)!.absent),
      coverageSeries: sortedDates.map((d) => dateTrendMap.get(d)!.total),
    };

    // 7. Period Comparison (Previous equivalent duration)
    const durationMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - durationMs);
    const prevEnd = new Date(startDate.getTime() - 1);

    const prevItems = await this.correlateAssignments({ startDate: prevStart, endDate: prevEnd });
    let prevCompleted = 0;
    let prevAttended = 0;
    for (const pi of prevItems) {
      if (pi.isCompleted) {
        prevCompleted++;
        if (['PRESENT', 'LATE'].includes(pi.attendanceStatus)) prevAttended++;
      }
    }
    const previousAttendanceRatePercent = prevCompleted > 0 ? Number(((prevAttended / prevCompleted) * 100).toFixed(1)) : 0;
    const attendanceRateDiff = Number((attendanceRatePercent - previousAttendanceRatePercent).toFixed(1));

    return {
      reportingPeriod: {
        preset,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        label,
      },
      period: {
        preset,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        label,
      },
      summary: {
        totalTimetablesGenerated,
        totalPublishedTimetables,
        totalPendingApprovals,
        totalRejectedTimetables,
        totalSessions: uniqueSessions.size,
        totalAssignments: allItems.length,
        totalUniqueMembersAssigned: uniqueMembers.size,
        averageAssignmentsPerMember,
        averageTurnaroundHours,
        manualAdjustmentCount,
        modificationRatePercent,
      },
      overview: {
        totalAssignments: allItems.length,
        totalRequiredSlots: totalRequiredSum,
        coverageRate: serviceCoveragePercent,
        attendanceRate: attendanceRatePercent,
        attendedAssignments: completedAssignments > 0 ? totalPresent + totalLate : 0,
        completedServiceAssignments: completedAssignments,
        publishedTimetables: totalPublishedTimetables,
        totalTimetables: totalTimetablesGenerated,
        pendingTimetables: totalPendingApprovals,
        avgApprovalTurnaroundHours: averageTurnaroundHours,
      },
      attendanceSummary: {
        totalScheduledAssignments: allItems.length,
        completedAssignments,
        futureOrPendingAssignments,
        totalPresent,
        totalLate,
        totalAbsent,
        totalExcused,
        totalMissingClockIn,
        totalDiscrepancies,
        attendanceRatePercent,
        punctualRatePercent,
        serviceCoveragePercent,
      },
      attendance: {
        presentCount: totalPresent,
        lateCount: totalLate,
        absentCount: totalAbsent,
        excusedCount: totalExcused,
        upcomingScheduledCount: futureOrPendingAssignments,
        punctualityRate: punctualRatePercent,
        earlyPresent,
        onTimePresent,
        gracePeriodPresent,
        clockInComplianceRate:
          totalPresent > 0 ? Number((((totalPresent - totalMissingClockIn) / totalPresent) * 100).toFixed(1)) : 100,
        missingClockInCount: totalMissingClockIn,
        discrepancyCount: totalDiscrepancies,
      },
      fairness: {
        totalEligibleMembers,
        averageAssignmentsPerEligible,
        averageAssignmentsPerMember: averageAssignmentsPerEligible,
        standardDeviation: stdDev,
        assignedAboveAverageCount,
        assignedBelowAverageCount,
        neverAssignedCount,
        membersWithZeroAssignmentsCount: neverAssignedCount,
        highestAssignedMembers,
        lowestAssignedMembers,
        topAssignedMembers: highestAssignedMembers.map((m) => ({
          memberId: m.memberId,
          fullName: m.name,
          memberCode: m.memberCode,
          assignmentCount: m.count,
        })),
        zeroAssignmentMembers: lowestAssignedMembers
          .filter((m) => m.count === 0)
          .map((m) => ({ memberId: m.memberId, fullName: m.name, memberCode: m.memberCode })),
        distributionHistogram: distributionHistogram.map((b) => ({
          bucket: b.bucket,
          count: parseInt(b.bucket.split(' ')[0], 10) || 0,
          memberCount: b.memberCount,
          percentage: totalEligibleMembers > 0 ? Number(((b.memberCount / totalEligibleMembers) * 100).toFixed(1)) : 0,
        })),
      },
      serviceBreakdown,
      services: serviceBreakdown.map((s) => ({
        ...s,
        serviceTitle: s.serviceName,
        completedMeetingsCount: s.completedCount,
        attendanceRate: s.attendanceRatePercent,
        coverageRate: s.coveragePercent,
      })),
      supervisingMinisterBreakdown,
      ministers: supervisingMinisterBreakdown.map((m) => ({
        ...m,
        ushersScheduled: m.totalScheduledUshers,
        attendanceRate: m.attendanceRatePercent,
      })),
      trends: {
        ...trends,
        attendanceRateChange: attendanceRateDiff,
        punctualityRateChange: 0,
        coverageRateChange: 0,
        previousPeriodLabel: `${prevStart.toISOString().slice(0, 10)} to ${prevEnd.toISOString().slice(0, 10)}`,
      },
      comparison: {
        previousPeriodLabel: `${prevStart.toISOString().slice(0, 10)} to ${prevEnd.toISOString().slice(0, 10)}`,
        previousAttendanceRatePercent,
        attendanceRateDiff,
        previousCoveragePercent: serviceCoveragePercent,
        coverageDiff: 0,
        previousTotalAssignments: prevItems.length,
      },
    };
  }

  /**
   * Member-level analytics drill-down.
   */
  async getMemberAnalytics(memberId: string, dto?: TimetableSearchFilterDto) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: {
        subTeam: true,
        user: { select: { email: true, role: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found');

    const dateRange = this.parseDateRange(dto || {});
    const assignments = await this.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: { ...(dto || {}), memberIds: [memberId] },
    });

    let completed = 0;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    for (const a of assignments) {
      if (a.isCompleted) {
        completed++;
        if (a.attendanceStatus === 'PRESENT') present++;
        else if (a.attendanceStatus === 'LATE') late++;
        else if (a.attendanceStatus === 'ABSENT') absent++;
        else if (a.attendanceStatus === 'EXCUSED') excused++;
      }
    }

    const denom = completed > 0 ? completed : 1;
    const attendanceRatePercent = Number((((present + late) / denom) * 100).toFixed(1));

    return {
      member: {
        id: member.id,
        memberCode: member.memberCode,
        fullName: `${member.firstName} ${member.lastName}`.trim(),
        subTeam: member.subTeam?.name || 'Unassigned',
        email: member.user?.email || null,
        status: member.status,
      },
      stats: {
        totalAssignments: assignments.length,
        completedAssignments: completed,
        present,
        late,
        absent,
        excused,
        attendanceRatePercent,
        mostRecentAttendance: assignments.find((a) => a.clockInRecorded)?.clockInTime || null,
      },
      summary: {
        totalAssignments: assignments.length,
        completedAssignments: completed,
        present,
        lateCount: late,
        absentCount: absent,
        excusedCount: excused,
        attendanceRate: attendanceRatePercent,
        punctualityRate: denom > 0 ? Number(((present / denom) * 100).toFixed(1)) : 100,
      },
      history: assignments,
      assignments,
    };
  }

  /**
   * Service session drill-down analytics.
   */
  async getServiceAnalytics(sessionKey: string, dto?: TimetableSearchFilterDto) {
    const dateRange = this.parseDateRange(dto || {});
    const assignments = await this.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: { ...(dto || {}), sessionKeys: [sessionKey] },
    });

    const sessionsCount = new Set(assignments.map((a) => a.sessionId)).size;
    let completed = 0;
    let present = 0;
    let late = 0;
    let absent = 0;

    for (const a of assignments) {
      if (a.isCompleted) {
        completed++;
        if (a.attendanceStatus === 'PRESENT') present++;
        else if (a.attendanceStatus === 'LATE') late++;
        else if (a.attendanceStatus === 'ABSENT') absent++;
      }
    }

    const denom = completed > 0 ? completed : 1;
    return {
      sessionKey,
      totalServicesHeld: sessionsCount,
      totalScheduledUshers: assignments.length,
      present,
      late,
      absent,
      attendanceRatePercent: Number((((present + late) / denom) * 100).toFixed(1)),
      assignments,
    };
  }

  /**
   * Supervising minister drill-down analytics.
   */
  async getMinisterAnalytics(ministerId: string, dto?: TimetableSearchFilterDto) {
    const minister = await this.prisma.member.findUnique({
      where: { id: ministerId },
      select: { id: true, firstName: true, lastName: true, memberCode: true },
    });
    if (!minister) throw new NotFoundException('Minister not found');

    const dateRange = this.parseDateRange(dto || {});
    const assignments = await this.correlateAssignments({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      filter: { ...(dto || {}), supervisingMinisterIds: [ministerId] },
    });

    const supervisedSessions = new Set(assignments.map((a) => a.sessionId)).size;
    let completed = 0;
    let present = 0;
    let absent = 0;

    for (const a of assignments) {
      if (a.isCompleted) {
        completed++;
        if (['PRESENT', 'LATE'].includes(a.attendanceStatus)) present++;
        else if (a.attendanceStatus === 'ABSENT') absent++;
      }
    }

    const denom = completed > 0 ? completed : 1;
    return {
      minister: {
        id: minister.id,
        fullName: `${minister.firstName} ${minister.lastName}`.trim(),
        memberCode: minister.memberCode,
      },
      supervisedSessionsCount: supervisedSessions,
      totalScheduledUshers: assignments.length,
      present,
      absent,
      attendanceRatePercent: Number(((present / denom) * 100).toFixed(1)),
      assignments,
      supervisedServices: assignments,
    };
  }

  /**
   * Monthly Member Rotation tracking against the policy target of ≥ 2 assignments per month.
   * Categorizes members as:
   * - Target met (≥ 2)
   * - One more assignment needed (1)
   * - Not yet scheduled (0)
   * - Attendance pending verification
   */
  async getMonthlyRotationAnalytics(year?: number, month?: number) {
    const now = new Date();
    const targetYear = year ? Number(year) : now.getUTCFullYear();
    const targetMonth = month ? Number(month) : now.getUTCMonth() + 1; // 1-12

    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    // 1. Fetch all eligible active members
    const eligible = await this.prisma.member.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberCode: true,
        phoneNumber: true,
        profilePhotoUrl: true,
        roleInUnit: true,
        subTeam: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    // 2. Query assignments for this calendar month
    const assignments = await this.prisma.timetableAssignment.findMany({
      where: {
        session: {
          serviceDate: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
          version: {
            status: { in: ['APPROVED', 'PUBLISHED', 'PENDING_REVIEW'] },
          },
        },
      },
      include: {
        session: {
          select: {
            id: true,
            sessionKey: true,
            serviceName: true,
            serviceDay: true,
            serviceDate: true,
            startTime: true,
            version: { select: { id: true, status: true, versionNumber: true } },
          },
        },
      },
    });

    // 3. Map assignments to members
    const memberAssignmentsMap = new Map<string, any[]>();
    for (const a of assignments) {
      if (!memberAssignmentsMap.has(a.memberId)) {
        memberAssignmentsMap.set(a.memberId, []);
      }
      memberAssignmentsMap.get(a.memberId)!.push({
        assignmentId: a.id,
        sessionId: a.session.id,
        sessionKey: a.session.sessionKey,
        serviceName: a.session.serviceName,
        serviceDay: a.session.serviceDay,
        serviceDate: a.session.serviceDate,
        role: a.role,
        position: a.position,
        versionStatus: a.session.version.status,
      });
    }

    let targetMetCount = 0;
    let oneNeededCount = 0;
    let notScheduledCount = 0;
    let attendancePendingCount = 0;

    const membersList = eligible.map((m) => {
      const list = memberAssignmentsMap.get(m.id) || [];
      const scheduledCount = list.length;
      let status: 'TARGET_MET' | 'ONE_MORE_NEEDED' | 'NOT_YET_SCHEDULED' | 'ATTENDANCE_PENDING' = 'NOT_YET_SCHEDULED';

      if (scheduledCount >= 2) {
        status = 'TARGET_MET';
        targetMetCount++;
      } else if (scheduledCount === 1) {
        status = 'ONE_MORE_NEEDED';
        oneNeededCount++;
      } else {
        status = 'NOT_YET_SCHEDULED';
        notScheduledCount++;
      }

      const hasPastSession = list.some((s) => new Date(s.serviceDate) <= now);
      if (scheduledCount > 0 && hasPastSession) {
        attendancePendingCount++;
      }

      return {
        memberId: m.id,
        memberCode: m.memberCode,
        name: `${m.firstName} ${m.lastName}`.trim(),
        fullName: `${m.firstName} ${m.lastName}`.trim(),
        firstName: m.firstName,
        lastName: m.lastName,
        profilePhotoUrl: m.profilePhotoUrl,
        roleInUnit: m.roleInUnit,
        subTeamName: m.subTeam?.name || null,
        scheduledCount,
        assignmentCount: scheduledCount,
        targetCount: 2,
        status,
        statusLabel:
          status === 'TARGET_MET'
            ? 'Target met (≥2)'
            : status === 'ONE_MORE_NEEDED'
            ? 'One more assignment needed'
            : 'Not yet scheduled',
        assignments: list,
      };
    });

    const totalEligible = eligible.length;
    const complianceRate = totalEligible > 0 ? Number(((targetMetCount / totalEligible) * 100).toFixed(1)) : 0;

    return {
      period: {
        year: targetYear,
        month: targetMonth,
        monthName: startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString(),
      },
      targetPerMemberPerMonth: 2,
      summary: {
        totalEligible,
        targetMetCount,
        oneNeededCount,
        notScheduledCount,
        attendancePendingCount,
        complianceRate,
      },
      members: membersList,
    };
  }
}
