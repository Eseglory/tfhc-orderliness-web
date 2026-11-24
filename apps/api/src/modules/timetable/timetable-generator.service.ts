import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TimetableEligibilityService, MemberEligibilityResult } from './timetable-eligibility.service';
import { TimetableNotificationService } from './timetable-notification.service';
import {
  TimetablePeriod,
  TimetableVersion,
  TimetableServiceSession,
  TimetableGenerationType,
  TimetableVersionStatus,
  TimetablePeriodStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';

export interface ServiceDefinition {
  sessionKey: string;
  serviceDay: string;
  serviceName: string;
  dayOfWeekOffset: number; // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  defaultUshers: number;
  serviceScheduleId?: string;
}

export const WEEKLY_SERVICES: ServiceDefinition[] = [
  {
    sessionKey: 'TUESDAY_MIDWEEK',
    serviceDay: 'TUESDAY',
    serviceName: 'Mid-Week Service',
    dayOfWeekOffset: 1, // Tuesday
    startHour: 18,
    startMinute: 45,
    endHour: 20,
    endMinute: 15,
    defaultUshers: 4,
    serviceScheduleId: 'tuesday-midweek',
  },
  {
    sessionKey: 'THURSDAY_DIVINE',
    serviceDay: 'THURSDAY',
    serviceName: 'Divine Intervention Service',
    dayOfWeekOffset: 3, // Thursday
    startHour: 8,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    defaultUshers: 4,
    serviceScheduleId: 'thursday-divine',
  },
  {
    sessionKey: 'SATURDAY_SEATS',
    serviceDay: 'SATURDAY',
    serviceName: 'Seat Arrangement',
    dayOfWeekOffset: 5, // Saturday
    startHour: 17,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    defaultUshers: 6,
    serviceScheduleId: 'saturday-seat-arrangement',
  },
  {
    sessionKey: 'SUNDAY_SECOND',
    serviceDay: 'SUNDAY',
    serviceName: 'Sunday Second Service',
    dayOfWeekOffset: 6, // Sunday
    startHour: 8,
    startMinute: 30,
    endHour: 10,
    endMinute: 0,
    defaultUshers: 8,
    serviceScheduleId: 'sunday-second',
  },
  {
    sessionKey: 'SUNDAY_THIRD',
    serviceDay: 'SUNDAY',
    serviceName: 'Sunday Third Service',
    dayOfWeekOffset: 6, // Sunday
    startHour: 10,
    startMinute: 30,
    endHour: 12,
    endMinute: 0,
    defaultUshers: 8,
    serviceScheduleId: 'sunday-third',
  },
];

export interface TimetableConfig {
  quotas: Record<string, number>;
  maxAssignmentsPerMemberPerWeek: number;
  lookbackWeeks: number;
  fairnessWeight: number; // 0.0 to 1.0
  consecutiveRestPreferred: boolean;
}

export const DEFAULT_TIMETABLE_CONFIG: TimetableConfig = {
  quotas: {
    TUESDAY_MIDWEEK: 4,
    THURSDAY_DIVINE: 4,
    SATURDAY_SEATS: 6,
    SUNDAY_SECOND: 8,
    SUNDAY_THIRD: 8,
  },
  maxAssignmentsPerMemberPerWeek: 2,
  lookbackWeeks: 6,
  fairnessWeight: 0.7,
  consecutiveRestPreferred: true,
};

/**
 * Seeded Mulberry32 pseudo-random number generator for deterministic repeatability and auditing.
 */
function createPrng(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

@Injectable()
export class TimetableGeneratorService {
  private readonly logger = new Logger(TimetableGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibilityService: TimetableEligibilityService,
    private readonly notifications: TimetableNotificationService,
  ) {}

  /**
   * Loads current system configuration or falls back to defaults.
   */
  async getConfig(): Promise<TimetableConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'timetable_config' },
    });
    if (!setting) return DEFAULT_TIMETABLE_CONFIG;
    try {
      const parsed = JSON.parse(setting.value);
      return {
        quotas: { ...DEFAULT_TIMETABLE_CONFIG.quotas, ...(parsed.quotas || {}) },
        maxAssignmentsPerMemberPerWeek:
          parsed.maxAssignmentsPerMemberPerWeek || DEFAULT_TIMETABLE_CONFIG.maxAssignmentsPerMemberPerWeek,
        lookbackWeeks: parsed.lookbackWeeks || DEFAULT_TIMETABLE_CONFIG.lookbackWeeks,
        fairnessWeight: parsed.fairnessWeight ?? DEFAULT_TIMETABLE_CONFIG.fairnessWeight,
        consecutiveRestPreferred: parsed.consecutiveRestPreferred ?? DEFAULT_TIMETABLE_CONFIG.consecutiveRestPreferred,
      };
    } catch {
      return DEFAULT_TIMETABLE_CONFIG;
    }
  }

  /**
   * Generates a timetable version for the specified weekStart date.
   */
  async generateTimetable(params: {
    weekStart: Date;
    generationType: TimetableGenerationType;
    actorUserId?: string;
    customSeed?: string;
    overrideConfig?: Partial<TimetableConfig>;
  }): Promise<{
    period: TimetablePeriod;
    version: TimetableVersion;
    sessions: TimetableServiceSession[];
    unfulfilledSlots: Array<{ sessionKey: string; missingCount: number; reason: string }>;
  }> {
    const config = {
      ...(await this.getConfig()),
      ...(params.overrideConfig || {}),
    };

    const seed = params.customSeed || randomBytes(16).toString('hex');
    const rng = createPrng(seed);

    // 1. Fetch eligible active members
    const eligibleMembers = await this.eligibilityService.getEligibleActiveMembers();

    // 2. Fetch lookback assignment history to calculate past load per member
    const lookbackStart = new Date(params.weekStart);
    lookbackStart.setDate(lookbackStart.getDate() - config.lookbackWeeks * 7);

    const pastAssignments = await this.prisma.timetableAssignment.findMany({
      where: {
        session: {
          version: {
            status: { in: ['APPROVED', 'PUBLISHED'] },
          },
          serviceDate: {
            gte: lookbackStart,
            lt: params.weekStart,
          },
        },
      },
      select: {
        memberId: true,
        session: {
          select: { serviceDate: true, sessionKey: true },
        },
      },
    });

    // Map historical count and recency
    const pastCounts = new Map<string, number>();
    const lastAssignedDate = new Map<string, Date>();

    for (const pa of pastAssignments) {
      pastCounts.set(pa.memberId, (pastCounts.get(pa.memberId) || 0) + 1);
      const currLast = lastAssignedDate.get(pa.memberId);
      if (!currLast || pa.session.serviceDate > currLast) {
        lastAssignedDate.set(pa.memberId, pa.session.serviceDate);
      }
    }

    // Fetch current calendar month assignments to prioritize members reaching >= 2 target
    const monthStart = new Date(Date.UTC(params.weekStart.getUTCFullYear(), params.weekStart.getUTCMonth(), 1));
    const monthAssignments = await this.prisma.timetableAssignment.findMany({
      where: {
        session: {
          version: {
            status: { in: ['APPROVED', 'PUBLISHED'] },
          },
          serviceDate: {
            gte: monthStart,
            lt: params.weekStart,
          },
        },
      },
      select: { memberId: true },
    });

    const monthlyCounts = new Map<string, number>();
    for (const ma of monthAssignments) {
      monthlyCounts.set(ma.memberId, (monthlyCounts.get(ma.memberId) || 0) + 1);
    }

    // 3. Find or create TimetablePeriod
    const weekMonday = new Date(
      Date.UTC(
        params.weekStart.getUTCFullYear(),
        params.weekStart.getUTCMonth(),
        params.weekStart.getUTCDate(),
      ),
    );

    const weekSunday = new Date(weekMonday);
    weekSunday.setUTCDate(weekSunday.getUTCDate() + 6);

    const label = `Week of ${weekMonday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekSunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    let period = await this.prisma.timetablePeriod.findFirst({
      where: { weekStart: weekMonday, periodType: 'REGULAR_WEEKLY' },
    });

    if (!period) {
      period = await this.prisma.timetablePeriod.create({
        data: {
          weekStart: weekMonday,
          periodType: 'REGULAR_WEEKLY',
          label,
          status: TimetablePeriodStatus.DRAFT,
          currentVersion: 1,
        },
      });
    } else {
      // Increment version number on regeneration
      period = await this.prisma.timetablePeriod.update({
        where: { id: period.id },
        data: {
          currentVersion: { increment: 1 },
          status: TimetablePeriodStatus.DRAFT,
        },
      });
    }

    const versionNumber = period.currentVersion;

    // 4. Constraint-based scheduling across the 5 services
    const currentWeekAssignments = new Map<string, number>(); // memberId -> count this week
    const assignedPerSession = new Map<string, string[]>(); // sessionKey -> memberId[]
    const unfulfilledSlots: Array<{ sessionKey: string; missingCount: number; reason: string }> = [];

    // Schedule each of the 5 services
    for (const service of WEEKLY_SERVICES) {
      const required = config.quotas[service.sessionKey] ?? service.defaultUshers;
      const assignedMembers: string[] = [];

      // Determine available candidates for this service
      // A candidate must:
      // a) Not already be assigned to this session
      // b) Not exceed maxAssignmentsPerMemberPerWeek
      const eligiblePool = eligibleMembers.filter((m) => {
        const assignedThisWeek = currentWeekAssignments.get(m.memberId) || 0;
        return assignedThisWeek < config.maxAssignmentsPerMemberPerWeek;
      });

      const slotsToFill = Math.min(required, eligiblePool.length);

      for (let slot = 0; slot < slotsToFill; slot++) {
        // Compute dynamic fair weights for remaining candidates
        const candidates = eligiblePool.filter((m) => !assignedMembers.includes(m.memberId));
        if (candidates.length === 0) break;

        const candidateWeights: Array<{ member: MemberEligibilityResult; weight: number }> = [];

        for (const cand of candidates) {
          const currentWeekCount = currentWeekAssignments.get(cand.memberId) || 0;
          const pastCount = pastCounts.get(cand.memberId) || 0;

          // Base inverse weight: fewer assignments = higher probability
          let weight = 100 / (1 + currentWeekCount * 4 + pastCount * 1.5);

          // Monthly rotation constraint: prioritize candidates who need assignments to reach monthly target (>=2)
          const candMonthlyCount = monthlyCounts.get(cand.memberId) || 0;
          if (candMonthlyCount === 0) {
            weight *= 2.5;
          } else if (candMonthlyCount === 1) {
            weight *= 1.5;
          }

          // Spacing constraint: Avoid assigning the same member to both Tuesday and Thursday in the same week when alternatives exist
          if (service.sessionKey === 'THURSDAY_DIVINE' && assignedPerSession.get('TUESDAY_MIDWEEK')?.includes(cand.memberId)) {
            weight *= 0.1;
          } else if (service.sessionKey === 'TUESDAY_MIDWEEK' && assignedPerSession.get('THURSDAY_DIVINE')?.includes(cand.memberId)) {
            weight *= 0.1;
          }

          // Sunday consecutive service rest constraint:
          // If this is SUNDAY_THIRD and they are already assigned to SUNDAY_SECOND (or vice-versa), penalize heavily
          if (service.sessionKey === 'SUNDAY_THIRD' && assignedPerSession.get('SUNDAY_SECOND')?.includes(cand.memberId)) {
            weight *= 0.05;
          } else if (service.sessionKey === 'SUNDAY_SECOND' && assignedPerSession.get('SUNDAY_THIRD')?.includes(cand.memberId)) {
            weight *= 0.05;
          }

          candidateWeights.push({ member: cand, weight: Math.max(weight, 0.01) });
        }

        // Weighted random selection using seeded PRNG
        const totalWeight = candidateWeights.reduce((sum, c) => sum + c.weight, 0);
        let roll = rng() * totalWeight;
        let selected = candidateWeights[0].member;

        for (const cw of candidateWeights) {
          roll -= cw.weight;
          if (roll <= 0) {
            selected = cw.member;
            break;
          }
        }

        assignedMembers.push(selected.memberId);
        currentWeekAssignments.set(
          selected.memberId,
          (currentWeekAssignments.get(selected.memberId) || 0) + 1,
        );
      }

      assignedPerSession.set(service.sessionKey, assignedMembers);

      if (assignedMembers.length < required) {
        unfulfilledSlots.push({
          sessionKey: service.sessionKey,
          missingCount: required - assignedMembers.length,
          reason: `Eligible active member pool exhausted under max weekly assignment limit (${config.maxAssignmentsPerMemberPerWeek}/week)`,
        });
      }
    }

    // Calculate fairness metrics
    const assignedMemberCounts = Array.from(currentWeekAssignments.values());
    const totalAssignedSlots = assignedMemberCounts.reduce((a, b) => a + b, 0);
    const totalRequiredSlots = WEEKLY_SERVICES.reduce(
      (sum, s) => sum + (config.quotas[s.sessionKey] ?? s.defaultUshers),
      0,
    );

    const metadata: Prisma.InputJsonValue = {
      seed,
      generationType: params.generationType,
      configSnapshot: config as unknown as Prisma.InputJsonValue,
      eligibleCount: eligibleMembers.length,
      totalRequiredSlots,
      totalAssignedSlots,
      coveragePercentage: Math.round((totalAssignedSlots / totalRequiredSlots) * 1000) / 10,
      unfulfilledSlots: unfulfilledSlots as unknown as Prisma.InputJsonValue,
      generatedAt: new Date().toISOString(),
    };

    const summary: Prisma.InputJsonValue = {
      services: WEEKLY_SERVICES.map((s) => ({
        sessionKey: s.sessionKey,
        serviceName: s.serviceName,
        required: config.quotas[s.sessionKey] ?? s.defaultUshers,
        assigned: assignedPerSession.get(s.sessionKey)?.length || 0,
        isFullyStaffed: (assignedPerSession.get(s.sessionKey)?.length || 0) >= (config.quotas[s.sessionKey] ?? s.defaultUshers),
      })),
      uniqueMembersScheduled: currentWeekAssignments.size,
    };

    // 5. Select supervising ministers from Executive / Disciplinary pool
    const ministerCandidates = await this.getSupervisingMinisterCandidates();
    const assignedMinisters = new Map<string, string>();
    if (ministerCandidates.length > 0) {
      // Fairly and pseudo-randomly distribute candidates across the 5 weekly services
      const shuffled = [...ministerCandidates].sort(() => rng() - 0.5);
      WEEKLY_SERVICES.forEach((service, idx) => {
        const minister = shuffled[idx % shuffled.length];
        assignedMinisters.set(service.sessionKey, minister.id);
      });
    }

    // 6. Persist TimetableVersion, Sessions and Assignments atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // Mark any previous active versions for this period as SUPERSEDED
      await tx.timetableVersion.updateMany({
        where: { periodId: period.id, status: { notIn: ['SUPERSEDED', 'REJECTED'] } },
        data: { status: TimetableVersionStatus.SUPERSEDED },
      });

      const version = await tx.timetableVersion.create({
        data: {
          periodId: period.id,
          versionNumber,
          status: TimetableVersionStatus.PENDING_REVIEW,
          generationType: params.generationType,
          generatedByUserId: params.actorUserId || null,
          metadata,
          summary,
        },
      });

      const createdSessions: TimetableServiceSession[] = [];

      for (const service of WEEKLY_SERVICES) {
        const serviceDate = new Date(weekMonday);
        serviceDate.setUTCDate(serviceDate.getUTCDate() + service.dayOfWeekOffset);

        const startTime = new Date(serviceDate);
        startTime.setUTCHours(service.startHour - 1, service.startMinute, 0, 0); // Convert WAT (UTC+1) to UTC

        const endTime = new Date(serviceDate);
        endTime.setUTCHours(service.endHour - 1, service.endMinute, 0, 0);

        const required = config.quotas[service.sessionKey] ?? service.defaultUshers;
        const memberIds = assignedPerSession.get(service.sessionKey) || [];
        const ministerId = assignedMinisters.get(service.sessionKey) || null;

        const session = await tx.timetableServiceSession.create({
          data: {
            versionId: version.id,
            serviceScheduleId: service.serviceScheduleId || null,
            serviceDay: service.serviceDay,
            serviceName: service.serviceName,
            sessionKey: service.sessionKey,
            serviceDate,
            startTime,
            endTime,
            requiredUshers: required,
            assignedUshersCount: memberIds.length,
            isFullyStaffed: memberIds.length >= required,
            supervisingMinisterId: ministerId,
            assignments: {
              create: memberIds.map((mId, index) => {
                const isLead = index === 0;
                const role = isLead ? 'LEAD_USHER' : 'USHER';
                let position = `Usher Section ${index + 1}`;
                if (isLead) {
                  if (service.sessionKey === 'TUESDAY_MIDWEEK' || service.sessionKey === 'THURSDAY_DIVINE') {
                    position = 'Lead Usher';
                  } else if (service.sessionKey.includes('SEAT')) {
                    position = 'Lead Floor Coordinator';
                  } else {
                    position = 'Main Sanctuary Lead';
                  }
                }
                return {
                  memberId: mId,
                  role,
                  position,
                };
              }),
            },
          },
        });

        createdSessions.push(session);
      }

      // Update period status to PENDING_REVIEW
      const updatedPeriod = await tx.timetablePeriod.update({
        where: { id: period.id },
        data: { status: TimetablePeriodStatus.PENDING_REVIEW },
      });

      return {
        period: updatedPeriod,
        version,
        sessions: createdSessions,
        unfulfilledSlots,
      };
    });

    this.notifications.notifyReviewers({
      versionId: result.version.id,
      weekLabel: result.period.label,
      isResubmission: false,
    }).catch((e) => this.logger.warn(`Failed to dispatch initial review notifications: ${e.message}`));

    return result;
  }

  /**
   * Retrieves active supervising minister candidates from Executive / Disciplinary pool.
   */
  async getSupervisingMinisterCandidates() {
    return this.prisma.member.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { subTeam: { name: { in: ['Executive', 'Disciplinary Committee', 'Disciplinary Commitee'] } } },
          { roleInUnit: { in: ['Executive', 'Leader', 'Administrator'] } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        profilePhotoUrl: true,
        roleInUnit: true,
        subTeam: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Generates a timetable for a Special Event or Programme.
   * Runs as a separate workflow that does not overwrite or interfere with regular weekly periods.
   */
  async generateSpecialEventTimetable(params: {
    title: string;
    eventDate: Date;
    startTime: Date;
    endTime?: Date;
    requiredUshers: number;
    supervisingMinisterId?: string;
    notes?: string;
    manualMemberIds?: string[];
    actorUserId: string;
  }): Promise<{
    period: TimetablePeriod;
    version: TimetableVersion;
    session: TimetableServiceSession;
  }> {
    if (!params.title?.trim()) {
      throw new BadRequestException('Special event title is required');
    }
    if (!params.requiredUshers || params.requiredUshers < 1) {
      throw new BadRequestException('At least 1 usher is required for the special event');
    }

    // 1. Get eligible active members
    const eligibleMembers = await this.eligibilityService.getEligibleActiveMembers();
    const eligibleMemberIds = new Set(eligibleMembers.map((m) => m.memberId));

    let selectedMemberIds: string[] = [];
    if (params.manualMemberIds && params.manualMemberIds.length > 0) {
      for (const mId of params.manualMemberIds) {
        if (!eligibleMemberIds.has(mId)) {
          throw new BadRequestException(`Member ${mId} does not qualify as an active eligible usher`);
        }
      }
      selectedMemberIds = Array.from(new Set(params.manualMemberIds));
    } else {
      // Fairly select from eligible active pool
      const eligibleList = [...eligibleMembers].sort(() => Math.random() - 0.5);
      selectedMemberIds = eligibleList.slice(0, params.requiredUshers).map((m) => m.memberId);
    }

    // 2. Resolve supervising minister
    let ministerId = params.supervisingMinisterId || null;
    if (!ministerId) {
      const candidates = await this.getSupervisingMinisterCandidates();
      if (candidates.length > 0) {
        ministerId = candidates[Math.floor(Math.random() * candidates.length)].id;
      }
    }

    const dateUtc = new Date(
      Date.UTC(
        params.eventDate.getUTCFullYear(),
        params.eventDate.getUTCMonth(),
        params.eventDate.getUTCDate(),
      ),
    );

    const label = `Special Event: ${params.title} (${dateUtc.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`;

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.timetablePeriod.create({
        data: {
          weekStart: dateUtc,
          periodType: 'SPECIAL_EVENT',
          label,
          status: TimetablePeriodStatus.PENDING_REVIEW,
          currentVersion: 1,
        },
      });

      const version = await tx.timetableVersion.create({
        data: {
          periodId: period.id,
          versionNumber: 1,
          status: TimetableVersionStatus.PENDING_REVIEW,
          generationType: TimetableGenerationType.MANUAL_INITIAL,
          generatedByUserId: params.actorUserId,
          metadata: {
            isSpecialEvent: true,
            title: params.title,
            eventDate: dateUtc.toISOString(),
            requiredUshers: params.requiredUshers,
            assignedCount: selectedMemberIds.length,
          },
          summary: {
            isSpecialEvent: true,
            title: params.title,
            required: params.requiredUshers,
            assigned: selectedMemberIds.length,
          },
        },
      });

      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const serviceDay = dayNames[dateUtc.getUTCDay()];

      const session = await tx.timetableServiceSession.create({
        data: {
          versionId: version.id,
          serviceDay,
          serviceName: params.title,
          sessionKey: `SPECIAL_${Date.now()}`,
          serviceDate: dateUtc,
          startTime: params.startTime,
          endTime: params.endTime || null,
          requiredUshers: params.requiredUshers,
          assignedUshersCount: selectedMemberIds.length,
          isFullyStaffed: selectedMemberIds.length >= params.requiredUshers,
          supervisingMinisterId: ministerId,
          isSpecialEvent: true,
          specialEventTitle: params.title,
          notes: params.notes || null,
          assignments: {
            create: selectedMemberIds.map((mId, index) => ({
              memberId: mId,
              role: index === 0 ? 'LEAD_USHER' : 'USHER',
              position: index === 0 ? 'Event Lead Usher' : `Usher Position ${index + 1}`,
            })),
          },
        },
      });

      return { period, version, session };
    });
  }
}
