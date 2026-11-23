import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TimetableGeneratorService } from './timetable-generator.service';
import { TimetableReviewService } from './timetable-review.service';
import { TimetableEligibilityService } from './timetable-eligibility.service';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableGenerationType,
} from '@prisma/client';

@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: TimetableGeneratorService,
    private readonly review: TimetableReviewService,
    private readonly eligibility: TimetableEligibilityService,
  ) {}

  /**
   * Helper that returns WAT-aligned week boundaries for scheduling.
   * Monday is the formal start of the weekly timetable period.
   */
  getWatWeekStart(now = new Date()): { currentWeekMonday: Date; nextWeekMonday: Date } {
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

    const offsetMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    const offsetFromMonday = offsetMap[weekday] ?? 0;

    const currentMondayUtc = new Date(Date.UTC(year, month - 1, day));
    currentMondayUtc.setUTCDate(currentMondayUtc.getUTCDate() - offsetFromMonday);

    const nextMondayUtc = new Date(currentMondayUtc);
    nextMondayUtc.setUTCDate(nextMondayUtc.getUTCDate() + 7);

    return {
      currentWeekMonday: currentMondayUtc,
      nextWeekMonday: nextMondayUtc,
    };
  }

  /**
   * Member dashboard view:
   * Ordinary members ONLY see official PUBLISHED timetables.
   * Drafts, unapproved, and rejected versions are never exposed to ordinary members.
   */
  async getMemberCurrentTimetable(memberId?: string) {
    const { currentWeekMonday } = this.getWatWeekStart();

    // Find the latest period for this week or upcoming
    const period = await this.prisma.timetablePeriod.findFirst({
      where: {
        weekStart: { gte: currentWeekMonday },
        periodType: 'REGULAR_WEEKLY',
        status: TimetablePeriodStatus.PUBLISHED,
      },
      orderBy: { weekStart: 'asc' },
      include: {
        versions: {
          where: { status: TimetableVersionStatus.PUBLISHED },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            sessions: {
              orderBy: { serviceDate: 'asc' },
              include: {
                supervisingMinister: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    preferredName: true,
                    profilePhotoUrl: true,
                    roleInUnit: true,
                  },
                },
                assignments: {
                  include: {
                    member: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        memberCode: true,
                        roleInUnit: true,
                        profilePhotoUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!period || period.versions.length === 0) {
      // Check if there is an unapproved draft/pending timetable so member knows status
      const pendingPeriod = await this.prisma.timetablePeriod.findFirst({
        where: { weekStart: { gte: currentWeekMonday } },
        orderBy: { weekStart: 'asc' },
      });

      return {
        published: false,
        period: null,
        status: pendingPeriod ? pendingPeriod.status : 'NO_TIMETABLE_YET',
        message: pendingPeriod
          ? 'This week’s ushering timetable has been generated and is awaiting administrative review and approval.'
          : 'No ushering timetable has been generated for this week yet.',
      };
    }

    const version = period.versions[0];
    const myAssignments: any[] = [];

    const formattedSessions = version.sessions.map((session) => {
      const isAssigned = session.assignments.some((a) => a.memberId === memberId);
      if (isAssigned) {
        myAssignments.push({
          sessionId: session.id,
          sessionKey: session.sessionKey,
          serviceName: session.serviceName,
          serviceDay: session.serviceDay,
          serviceDate: session.serviceDate,
          startTime: session.startTime,
          endTime: session.endTime,
        });
      }

      return {
        id: session.id,
        sessionKey: session.sessionKey,
        serviceDay: session.serviceDay,
        serviceName: session.serviceName,
        serviceDate: session.serviceDate,
        startTime: session.startTime,
        endTime: session.endTime,
        requiredUshers: session.requiredUshers,
        assignedUshersCount: session.assignedUshersCount,
        isFullyStaffed: session.isFullyStaffed,
        isAssignedToMe: isAssigned,
        supervisingMinister: session.supervisingMinister
          ? {
              id: session.supervisingMinister.id,
              name: `${session.supervisingMinister.firstName} ${session.supervisingMinister.lastName}`.trim(),
              preferredName: session.supervisingMinister.preferredName,
              profilePhotoUrl: session.supervisingMinister.profilePhotoUrl,
              roleInUnit: session.supervisingMinister.roleInUnit,
            }
          : null,
        ushers: session.assignments.map((a) => ({
          assignmentId: a.id,
          memberId: a.member.id,
          name: `${a.member.firstName} ${a.member.lastName}`.trim(),
          memberCode: a.member.memberCode,
          role: a.role,
          position: a.position,
          isMe: a.member.id === memberId,
        })),
      };
    });

    return {
      published: true,
      periodId: period.id,
      weekStart: period.weekStart,
      label: period.label,
      publishedAt: period.publishedAt,
      versionNumber: version.versionNumber,
      hasMyAssignment: myAssignments.length > 0,
      myAssignments,
      sessions: formattedSessions,
    };
  }

  /**
   * Super Admin and Designated Reviewer timetable view:
   * Shows complete status, approvals, draft assignments, fairness stats, and unfulfilled slots.
   */
  async getAdminCurrentTimetable(userId: string) {
    const { currentWeekMonday, nextWeekMonday } = this.getWatWeekStart();

    // Check if user is a designated reviewer
    const reviewerRecord = await this.prisma.timetableReviewer.findFirst({
      where: { userId, active: true },
    });
    const isDesignatedReviewer = Boolean(reviewerRecord);

    const activePolicy = await this.review.getPolicy();
    const designatedReviewers = await this.review.getReviewers();
    const officialStatus = await this.review.getOfficialReviewersStatus();
    const formattedReviewers = designatedReviewers.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: r.user.email,
      fullName: r.user.member
        ? `${r.user.member.firstName} ${r.user.member.lastName}`.trim()
        : r.user.email,
      role: r.user.role,
      active: r.active,
      orderIndex: r.orderIndex,
    }));

    // Find the current period (or upcoming)
    let period = await this.prisma.timetablePeriod.findFirst({
      where: {
        weekStart: { in: [currentWeekMonday, nextWeekMonday] },
        periodType: 'REGULAR_WEEKLY',
      },
      orderBy: { weekStart: 'asc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            reviews: {
              include: {
                reviewerUser: {
                  select: {
                    id: true,
                    email: true,
                    member: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
            sessions: {
              orderBy: { serviceDate: 'asc' },
              include: {
                supervisingMinister: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    preferredName: true,
                    profilePhotoUrl: true,
                    roleInUnit: true,
                  },
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
                        roleInUnit: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!period || period.versions.length === 0) {
      return {
        hasTimetable: false,
        period: null,
        currentWeekMonday,
        nextWeekMonday,
        isDesignatedReviewer,
        designatedReviewers,
        reviewers: formattedReviewers,
        officialReviewersStatus: officialStatus,
        policy: activePolicy,
      };
    }

    const version = period.versions[0];
    const approvedReviews = version.reviews.filter((r) => r.decision === 'APPROVED');
    const myReview = version.reviews.find((r) => r.reviewerUserId === userId) || null;

    return {
      hasTimetable: true,
      isDesignatedReviewer,
      period: {
        id: period.id,
        weekStart: period.weekStart,
        label: period.label,
        status: period.status,
        currentVersion: period.currentVersion,
        publishedAt: period.publishedAt,
      },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        generationType: version.generationType,
        metadata: version.metadata,
        summary: version.summary,
        publishedAt: version.publishedAt,
        createdAt: version.createdAt,
      },
      approvals: {
        required: activePolicy.requiredApprovalsCount,
        approvedCount: approvedReviews.length,
        isFullyApproved: approvedReviews.length >= activePolicy.requiredApprovalsCount,
        isPublished: version.status === 'PUBLISHED',
        reviews: version.reviews,
        myReview,
        isDesignatedReviewer,
        canReview: isDesignatedReviewer && !myReview && ['PENDING_REVIEW', 'DRAFT'].includes(version.status),
      },
      designatedReviewers,
      reviewers: formattedReviewers,
      officialReviewersStatus: officialStatus,
      sessions: version.sessions,
    };
  }

  /**
   * Notifies designated active reviewers that a generated timetable is ready for review.
   */
  async notifyReviewers(
    period: { id: string; label: string },
    version: { id: string; versionNumber: number },
    actorUserId?: string,
  ) {
    try {
      const activeReviewers = await this.review.getReviewers();
      for (const reviewer of activeReviewers) {
        if (reviewer.user?.member?.id) {
          await this.prisma.memberNotification.create({
            data: {
              memberId: reviewer.user.member.id,
              type: 'TIMETABLE_REVIEW_REQUIRED',
              title: 'Weekly Ushering Timetable Ready for Review',
              body: `The ushering timetable for the week of ${period.label} (Version ${version.versionNumber}) has been generated and requires your review and approval.`,
              data: {
                periodId: period.id,
                versionId: version.id,
                versionNumber: version.versionNumber,
              },
            },
          });
        }
      }

      let effectiveActorUserId = actorUserId;
      if (!effectiveActorUserId) {
        const sysAdmin = await this.prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
        effectiveActorUserId = sysAdmin?.id;
      }

      if (effectiveActorUserId) {
        await this.prisma.auditLog.create({
          data: {
            actorUserId: effectiveActorUserId,
            action: 'TIMETABLE_REVIEW_NOTIFICATION_SENT',
            entity: 'TimetableVersion',
            entityId: version.id,
            newData: {
              periodId: period.id,
              versionNumber: version.versionNumber,
              recipientCount: activeReviewers.length,
              reviewers: activeReviewers.map((r) => ({ id: r.id, userId: r.userId, email: r.user.email })),
            },
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to dispatch notifications to timetable reviewers', err as Error);
    }
  }

  /**
   * Rollout generation / Missed Saturday catch-up mechanism.
   * Generates the current or upcoming week's timetable immediately if missing.
   */
  async catchUpOrGenerate(actorUserId?: string, targetWeek: 'CURRENT' | 'NEXT' = 'CURRENT') {
    const { currentWeekMonday, nextWeekMonday } = this.getWatWeekStart();
    const targetMonday = targetWeek === 'CURRENT' ? currentWeekMonday : nextWeekMonday;

    const existing = await this.prisma.timetablePeriod.findFirst({
      where: { weekStart: targetMonday, periodType: 'REGULAR_WEEKLY' },
    });

    const generationType = existing ? TimetableGenerationType.MANUAL_REGENERATE : TimetableGenerationType.MANUAL_INITIAL;

    const result = await this.generator.generateTimetable({
      weekStart: targetMonday,
      generationType,
      actorUserId,
    });

    if (result?.period && result?.version) {
      await this.notifyReviewers(result.period, result.version, actorUserId);
    }

    return result;
  }

  /**
   * Automated scheduled generation triggered every Saturday for the upcoming week.
   * Guaranteed to be idempotent and prevents duplicate executions.
   */
  async runScheduledSaturdayGeneration() {
    const { nextWeekMonday } = this.getWatWeekStart();

    // Idempotency check: if next week's timetable was already generated and published/approved, skip
    const existing = await this.prisma.timetablePeriod.findFirst({
      where: { weekStart: nextWeekMonday, periodType: 'REGULAR_WEEKLY' },
      include: { versions: { where: { status: { in: ['APPROVED', 'PUBLISHED', 'PENDING_REVIEW'] } } } },
    });

    if (existing && existing.versions.length > 0) {
      this.logger.log(`Timetable for week ${nextWeekMonday.toISOString()} already exists. Skipping duplicate scheduled generation.`);
      return { skipped: true, reason: 'Already exists for upcoming week', periodId: existing.id };
    }

    this.logger.log(`Executing automated Saturday ushering timetable generation for ${nextWeekMonday.toISOString()}`);

    const result = await this.generator.generateTimetable({
      weekStart: nextWeekMonday,
      generationType: TimetableGenerationType.SCHEDULED_AUTO,
    });

    if (result?.period && result?.version) {
      await this.notifyReviewers(result.period, result.version);
    }

    return result;
  }

  /**
   * Returns complete history of all periods and versions.
   */
  async listHistory() {
    return this.prisma.timetablePeriod.findMany({
      orderBy: { weekStart: 'desc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            reviews: {
              include: {
                reviewerUser: {
                  select: { id: true, email: true, member: { select: { firstName: true, lastName: true } } },
                },
              },
            },
            _count: { select: { sessions: true } },
          },
        },
      },
    });
  }

  /**
   * Fetches specific version details.
   */
  async getVersionDetails(versionId: string) {
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: versionId },
      include: {
        period: true,
        reviews: {
          include: {
            reviewerUser: {
              select: { id: true, email: true, member: { select: { firstName: true, lastName: true, memberCode: true } } },
            },
          },
        },
        sessions: {
          orderBy: { serviceDate: 'asc' },
          include: {
            supervisingMinister: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
                profilePhotoUrl: true,
                roleInUnit: true,
              },
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
                    roleInUnit: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException('Timetable version not found');
    return version;
  }
}
