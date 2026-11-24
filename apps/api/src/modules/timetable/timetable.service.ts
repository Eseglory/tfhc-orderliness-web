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
  async getMemberCurrentTimetable(memberId?: string, userId?: string) {
    if (!memberId && userId) {
      const member = await this.prisma.member.findFirst({ where: { userId } });
      if (member) memberId = member.id;
    }

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
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });

      return {
        published: false,
        period: pendingPeriod
          ? {
              id: pendingPeriod.id,
              weekLabel: pendingPeriod.label,
              startDate: pendingPeriod.weekStart.toISOString(),
              endDate: new Date(pendingPeriod.weekStart.getTime() + 6 * 86400000).toISOString(),
              targetWeek: pendingPeriod.periodType,
            }
          : null,
        version: pendingPeriod?.versions?.[0]
          ? {
              id: pendingPeriod.versions[0].id,
              versionNumber: pendingPeriod.versions[0].versionNumber,
              status: pendingPeriod.versions[0].status,
              publishedAt: null,
            }
          : null,
        status: pendingPeriod ? pendingPeriod.status : 'NO_TIMETABLE_YET',
        message: pendingPeriod
          ? 'This week’s ushering timetable has been generated and is awaiting administrative review and approval.'
          : 'No ushering timetable has been generated for this week yet.',
        sessions: [],
        myAssignments: [],
      };
    }

    const version = period.versions[0];
    const myAssignments: any[] = [];
    const chairArrangement = await this.getSaturdayChairGroups(period.weekStart);

    const formatTimeOnly = (d: Date | string | null | undefined) => {
      if (!d) return '';
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      return date.toLocaleTimeString('en-US', {
        timeZone: process.env.TFHC_TIMEZONE || 'Africa/Lagos',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    };

    const formatDateOnly = (d: Date | string | null | undefined) => {
      if (!d) return '';
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      return date.toLocaleDateString('en-GB', {
        timeZone: process.env.TFHC_TIMEZONE || 'Africa/Lagos',
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    };

    const formattedSessions = version.sessions.map((session) => {
      const myAssignmentRecord = session.assignments.find((a) => a.memberId === memberId);
      const isAssigned = Boolean(myAssignmentRecord);

      if (isAssigned) {
        myAssignments.push({
          sessionId: session.id,
          sessionKey: session.sessionKey,
          serviceName: session.serviceName,
          serviceTitle: (session as any).serviceTitle || session.serviceName,
          serviceDay: session.serviceDay,
          serviceDate: session.serviceDate,
          formattedDate: formatDateOnly(session.serviceDate),
          startTime: formatTimeOnly(session.startTime),
          endTime: formatTimeOnly(session.endTime),
          rawStartTime: session.startTime,
          rawEndTime: session.endTime,
          locationName: (session as any).location || 'Main Sanctuary',
          roleTitle: myAssignmentRecord?.position || myAssignmentRecord?.role || myAssignmentRecord?.member?.roleInUnit || 'General Usher',
          position: myAssignmentRecord?.position || 'General Usher',
        });
      }

      const formattedAssignments = session.assignments.map((a) => {
        const fullName = `${a.member.firstName} ${a.member.lastName}`.trim();
        return {
          id: a.id,
          assignmentId: a.id,
          memberId: a.member.id,
          fullName,
          name: fullName,
          memberCode: a.member.memberCode,
          role: a.position || a.role || a.member.roleInUnit || 'General Usher',
          roleTitle: a.position || a.role || a.member.roleInUnit || 'General Usher',
          position: a.position || 'General Usher',
          profilePhotoUrl: a.member.profilePhotoUrl,
          isMe: a.member.id === memberId,
        };
      });

      const leadAssignment = session.assignments.find((a) => a.role === 'LEAD_USHER' || a.position?.toLowerCase().includes('lead')) || session.assignments[0] || null;
      const leadUsher = leadAssignment ? {
        id: leadAssignment.member.id,
        name: `${leadAssignment.member.firstName} ${leadAssignment.member.lastName}`.trim(),
        role: leadAssignment.role,
        position: leadAssignment.position || 'Lead Usher',
        profilePhotoUrl: leadAssignment.member.profilePhotoUrl,
      } : null;
      const isSaturday = session.serviceDay === 'SATURDAY' || session.sessionKey === 'SATURDAY_SEATS';

      return {
        id: session.id,
        sessionKey: session.sessionKey,
        serviceDay: session.serviceDay,
        serviceName: session.serviceName,
        serviceTitle: (session as any).serviceTitle || session.serviceName,
        serviceDate: session.serviceDate,
        formattedDate: formatDateOnly(session.serviceDate),
        startTime: formatTimeOnly(session.startTime),
        endTime: formatTimeOnly(session.endTime),
        rawStartTime: session.startTime,
        rawEndTime: session.endTime,
        locationName: (session as any).location || 'Main Sanctuary',
        location: (session as any).location || 'Main Sanctuary',
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
        leadUsher,
        chairArrangement: isSaturday ? chairArrangement : null,
        assignments: formattedAssignments,
        ushers: formattedAssignments,
      };
    });

    return {
      published: true,
      chairArrangement,
      period: {
        id: period.id,
        weekLabel: period.label,
        startDate: period.weekStart.toISOString(),
        endDate: new Date(period.weekStart.getTime() + 6 * 86400000).toISOString(),
        targetWeek: period.periodType,
      },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt?.toISOString() || null,
      },
      sessions: formattedSessions,
      myAssignments,
      // Backward-compatible flat fields
      periodId: period.id,
      weekStart: period.weekStart,
      label: period.label,
      publishedAt: period.publishedAt,
      versionNumber: version.versionNumber,
      hasMyAssignment: myAssignments.length > 0,
    };
  }

  /**
   * Super Admin and Designated Reviewer timetable view:
   * Shows complete status, approvals, draft assignments, fairness stats, and unfulfilled slots.
   */
  async getAdminCurrentTimetable(userId: string) {
    const { currentWeekMonday, nextWeekMonday } = this.getWatWeekStart();

    // Check if user is a designated reviewer or Platform Owner (engreseglory)
    const reviewerRecord = await this.prisma.timetableReviewer.findFirst({
      where: { userId, active: true },
    });
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const isOwnerOrGlory = Boolean(
      currentUser?.email &&
      (currentUser.email.toLowerCase() === 'engreseglory@gmail.com' ||
       currentUser.email.toLowerCase().includes('engreseglory') ||
       currentUser.email.toLowerCase() === 'portal-admin@tfhc.org' ||
       currentUser.email.toLowerCase() === (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase())
    );
    const isDesignatedReviewer = Boolean(reviewerRecord) || isOwnerOrGlory;

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

    // If engreseglory is not in formattedReviewers, add engreseglory as an authorized reviewer
    const gloryUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } },
          { email: { contains: 'engreseglory', mode: 'insensitive' } },
        ],
      },
      include: { member: true },
    });

    if (gloryUser && !formattedReviewers.some((r) => r.userId === gloryUser.id)) {
      formattedReviewers.push({
        id: `reviewer-owner-${gloryUser.id}`,
        userId: gloryUser.id,
        email: gloryUser.email,
        fullName: gloryUser.member
          ? `${gloryUser.member.firstName} ${gloryUser.member.lastName}`.trim()
          : 'Glory Eseosa (Owner)',
        role: gloryUser.role,
        active: true,
        orderIndex: 0,
      });
    }

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
        version: null,
        sessions: [],
        reviews: [],
        currentWeekMonday,
        nextWeekMonday,
        isDesignatedReviewer,
        isReviewer: isDesignatedReviewer,
        userReview: null,
        canPublish: false,
        designatedReviewers,
        reviewers: formattedReviewers,
        officialReviewersStatus: officialStatus,
        policy: activePolicy,
      };
    }

    const version = period.versions[0];
    const approvedReviews = version.reviews.filter((r) => r.decision === 'APPROVED');
    const myReview = version.reviews.find((r) => r.reviewerUserId === userId) || null;

    const formattedReviews = version.reviews.map((r) => ({
      id: r.id,
      reviewerUserId: r.reviewerUserId,
      decision: r.decision === 'APPROVED' ? 'APPROVE' : r.decision === 'REJECTED' ? 'REJECT' : r.decision,
      comments: r.comments,
      rejectionReason: r.rejectionReason,
      reviewedAt: r.reviewedAt,
      createdAt: (r as any).reviewedAt || (r as any).createdAt,
      reviewer: r.reviewerUser ? {
        email: r.reviewerUser.email,
        member: r.reviewerUser.member,
      } : undefined,
    }));

    const chairArrangement = await this.getSaturdayChairGroups(period.weekStart);

    const formattedSessions = version.sessions.map((s) => {
      const min = s.supervisingMinister;
      const supervisingMinister = min
        ? {
            ...min,
            name: min.preferredName || `${min.firstName} ${min.lastName}`.trim(),
            fullName: `${min.firstName} ${min.lastName}`.trim(),
          }
        : null;

      const assignments = s.assignments.map((a) => ({
        ...a,
        fullName: a.member ? `${a.member.firstName} ${a.member.lastName}`.trim() : 'Usher',
        memberCode: a.member?.memberCode || '',
        phoneNumber: a.member?.phoneNumber || '',
        profilePhotoUrl: (a.member as any)?.profilePhotoUrl || null,
      }));

      const leadAssignment = assignments.find((a: any) => a.role === 'LEAD_USHER' || a.position?.toLowerCase().includes('lead')) || assignments[0] || null;
      const leadUsher = leadAssignment ? {
        id: leadAssignment.memberId,
        name: leadAssignment.fullName,
        role: leadAssignment.role,
        position: leadAssignment.position || 'Lead Usher',
        profilePhotoUrl: leadAssignment.profilePhotoUrl,
      } : null;
      const isSaturday = s.serviceDay === 'SATURDAY' || s.sessionKey === 'SATURDAY_SEATS';

      return {
        ...s,
        serviceTitle: s.serviceName,
        supervisingMinister,
        leadUsher,
        chairArrangement: isSaturday ? chairArrangement : null,
        assignments,
      };
    });

    return {
      hasTimetable: true,
      chairArrangement,
      isDesignatedReviewer,
      isReviewer: isDesignatedReviewer,
      userReview: myReview ? {
        id: myReview.id,
        reviewerUserId: myReview.reviewerUserId,
        decision: myReview.decision === 'APPROVED' ? 'APPROVE' : myReview.decision === 'REJECTED' ? 'REJECT' : myReview.decision,
        comments: myReview.comments,
        rejectionReason: myReview.rejectionReason,
        reviewedAt: myReview.reviewedAt,
        createdAt: (myReview as any).reviewedAt || (myReview as any).createdAt,
      } : null,
      canPublish: approvedReviews.length >= activePolicy.requiredApprovalsCount && version.status !== 'PUBLISHED',
      period: {
        id: period.id,
        weekStart: period.weekStart,
        startDate: period.weekStart,
        endDate: new Date(new Date(period.weekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        label: period.label,
        weekLabel: period.label,
        targetWeek: period.periodType,
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
        reviews: formattedReviews,
        myReview,
        isDesignatedReviewer,
        canReview: isDesignatedReviewer && !myReview && ['PENDING_REVIEW', 'DRAFT'].includes(version.status),
      },
      designatedReviewers,
      reviewers: formattedReviewers,
      officialReviewersStatus: officialStatus,
      sessions: formattedSessions,
      reviews: formattedReviews,
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

  /**
   * Retrieves Saturday Chair Arrangement groups (Group A and Group B),
   * member rosters, and determines which team is scheduled for the week.
   */
  async getSaturdayChairGroups(weekDate?: Date | string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'timetable_chair_groups' },
    });
    let parsed: { groupA: string[]; groupB: string[] } = { groupA: [], groupB: [] };
    if (setting) {
      try {
        parsed = JSON.parse(setting.value);
      } catch {}
    }

    // Auto-seed balanced teams from active eligible members if empty
    if ((!parsed.groupA || parsed.groupA.length === 0) && (!parsed.groupB || parsed.groupB.length === 0)) {
      const activeMembers = await this.prisma.member.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
        take: 24,
      });
      parsed.groupA = activeMembers.slice(0, 12).map((m) => m.id);
      parsed.groupB = activeMembers.slice(12, 24).map((m) => m.id);
      await this.prisma.systemSetting.upsert({
        where: { key: 'timetable_chair_groups' },
        update: { value: JSON.stringify(parsed) },
        create: { key: 'timetable_chair_groups', value: JSON.stringify(parsed) },
      });
    }

    const [membersA, membersB] = await Promise.all([
      this.prisma.member.findMany({
        where: { id: { in: parsed.groupA || [] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberCode: true,
          phoneNumber: true,
          profilePhotoUrl: true,
        },
      }),
      this.prisma.member.findMany({
        where: { id: { in: parsed.groupB || [] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberCode: true,
          phoneNumber: true,
          profilePhotoUrl: true,
        },
      }),
    ]);

    // Calculate alternating group parity for the target week
    const refDate = weekDate ? new Date(weekDate) : new Date();
    const baseline = new Date(Date.UTC(2026, 10, 23)); // Monday Nov 23, 2026 is Group A
    const diffWeeks = Math.floor((refDate.getTime() - baseline.getTime()) / (7 * 86400000));
    const isGroupA = Math.abs(diffWeeks) % 2 === 0;

    const groupAFormatted = membersA.map((m) => ({ ...m, fullName: `${m.firstName} ${m.lastName}`.trim() }));
    const groupBFormatted = membersB.map((m) => ({ ...m, fullName: `${m.firstName} ${m.lastName}`.trim() }));

    return {
      groupA: groupAFormatted,
      groupB: groupBFormatted,
      activeGroup: isGroupA ? 'GROUP_A' : 'GROUP_B',
      activeGroupName: isGroupA ? 'Group A' : 'Group B',
      activeMembers: isGroupA ? groupAFormatted : groupBFormatted,
      note: 'Two alternating teams: Group A and Group B for Saturday seat arrangement.',
    };
  }

  /**
   * Updates Group A and Group B rosters for Saturday Chair Arrangement.
   */
  async updateSaturdayChairGroups(
    data: { groupA: string[]; groupB: string[] },
    actorUserId?: string,
  ) {
    const cleanA = Array.from(new Set(data.groupA || []));
    const cleanB = Array.from(new Set(data.groupB || []));
    const payload = { groupA: cleanA, groupB: cleanB };

    await this.prisma.systemSetting.upsert({
      where: { key: 'timetable_chair_groups' },
      update: { value: JSON.stringify(payload) },
      create: { key: 'timetable_chair_groups', value: JSON.stringify(payload) },
    });

    return this.getSaturdayChairGroups();
  }
}
