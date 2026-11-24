import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { TimetableNotificationService } from './timetable-notification.service';
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableReviewDecision,
  Prisma,
} from '@prisma/client';

export interface TimetableReviewPolicy {
  requiredApprovalsCount: number; // default 4 (all 3 designated reviewers + platform owner)
  autoPublishOnFullApproval: boolean;
}

export const DEFAULT_REVIEW_POLICY: TimetableReviewPolicy = {
  requiredApprovalsCount: 4,
  autoPublishOnFullApproval: true,
};

export interface OfficialReviewerConfig {
  name: string;
  email: string;
  orderIndex: number;
}

export const OFFICIAL_TIMETABLE_REVIEWERS: OfficialReviewerConfig[] = [
  { name: 'Aanu Oyeniran', email: 'aanuoyeniran@gmail.com', orderIndex: 1 },
  { name: 'Daniel Oguamanam', email: 'danoguamanam@gmail.com', orderIndex: 2 },
  { name: 'Paseda Oluwafemi', email: 'folashadeogunlade86@gmail.com', orderIndex: 3 },
];

export const PLATFORM_OWNER_CONFIG: OfficialReviewerConfig = {
  name: 'Glory Eseosa (Owner)',
  email: 'engreseglory@gmail.com',
  orderIndex: 4,
};

export const ALL_REQUIRED_APPROVERS: OfficialReviewerConfig[] = [
  ...OFFICIAL_TIMETABLE_REVIEWERS,
  PLATFORM_OWNER_CONFIG,
];

export interface OfficialReviewerStatusItem {
  name: string;
  officialEmail: string;
  orderIndex: number;
  matched: boolean;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  hasReviewerAccessRole?: boolean;
  isDesignatedActiveReviewer: boolean;
  notes?: string;
}

@Injectable()
export class TimetableReviewService {
  private readonly logger = new Logger(TimetableReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: TimetableNotificationService,
  ) {}

  /**
   * Retrieves the configured approval policy (default: 4 required approvals).
   */
  async getPolicy(): Promise<TimetableReviewPolicy> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'timetable_review_policy' },
    });
    if (!setting) return DEFAULT_REVIEW_POLICY;
    try {
      const parsed = JSON.parse(setting.value);
      return {
        requiredApprovalsCount: parsed.requiredApprovalsCount ?? 4,
        autoPublishOnFullApproval: parsed.autoPublishOnFullApproval ?? true,
      };
    } catch {
      return DEFAULT_REVIEW_POLICY;
    }
  }

  /**
   * Updates approval policy (e.g. requiredApprovalsCount).
   */
  async updatePolicy(policy: Partial<TimetableReviewPolicy>, actorUserId: string) {
    const current = await this.getPolicy();
    const updated: TimetableReviewPolicy = {
      requiredApprovalsCount: policy.requiredApprovalsCount ?? current.requiredApprovalsCount,
      autoPublishOnFullApproval: policy.autoPublishOnFullApproval ?? current.autoPublishOnFullApproval,
    };
    if (updated.requiredApprovalsCount < 1) {
      throw new BadRequestException('At least 1 reviewer approval is required');
    }

    await this.prisma.systemSetting.upsert({
      where: { key: 'timetable_review_policy' },
      update: { value: JSON.stringify(updated) },
      create: { key: 'timetable_review_policy', value: JSON.stringify(updated) },
    });

    await this.audit.record({
      actorUserId,
      action: 'TIMETABLE_POLICY_UPDATED',
      entity: 'SystemSetting',
      entityId: 'timetable_review_policy',
      newData: updated as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }

  /**
   * Retrieves the current match and configuration status for the 3 official reviewers.
   * Reports whether each reviewer's user account exists, whether permissions are bound,
   * or whether registration is pending.
   */
  async getOfficialReviewersStatus(): Promise<{
    officialReviewers: OfficialReviewerStatusItem[];
    platformOwner?: OfficialReviewerStatusItem;
    allApprovers: OfficialReviewerStatusItem[];
    matchedCount: number;
    unmatchedCount: number;
    allConfigured: boolean;
  }> {
    const results: OfficialReviewerStatusItem[] = [];

    for (const conf of OFFICIAL_TIMETABLE_REVIEWERS) {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: conf.email, mode: 'insensitive' } },
        include: {
          member: true,
          accessRoles: { include: { role: true } },
          timetableReviewerDesignations: { where: { active: true } },
        },
      });

      if (user) {
        const hasRole = user.accessRoles.some((ar) => ar.role.key === 'TIMETABLE_REVIEWER') || user.role === 'ADMIN';
        const isDesignated = user.timetableReviewerDesignations.length > 0;
        results.push({
          name: conf.name,
          officialEmail: conf.email,
          orderIndex: conf.orderIndex,
          matched: true,
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          hasReviewerAccessRole: hasRole,
          isDesignatedActiveReviewer: isDesignated,
          notes: isDesignated
            ? 'Account verified and active as designated reviewer.'
            : 'Account found. Ready to be designated.',
        });
      } else {
        results.push({
          name: conf.name,
          officialEmail: conf.email,
          orderIndex: conf.orderIndex,
          matched: false,
          isDesignatedActiveReviewer: false,
          hasReviewerAccessRole: false,
          notes: `Account not yet registered in application. Member must create login credentials with directory email (${conf.email}).`,
        });
      }
    }

    // Also look up Platform Owner (Glory Eseosa)
    const platformOwnerEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase();
    const ownerUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: platformOwnerEmail, mode: 'insensitive' } },
          { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } },
          { email: { equals: 'portal-admin@tfhc.org', mode: 'insensitive' } },
        ],
      },
      include: { member: true },
    });

    const platformOwnerStatus: OfficialReviewerStatusItem = ownerUser
      ? {
          name: ownerUser.member ? `${ownerUser.member.firstName} ${ownerUser.member.lastName}`.trim() : 'Glory Eseosa',
          officialEmail: 'engreseglory@gmail.com',
          orderIndex: 4,
          matched: true,
          userId: ownerUser.id,
          userEmail: ownerUser.email,
          userRole: ownerUser.role,
          hasReviewerAccessRole: true,
          isDesignatedActiveReviewer: true,
          notes: 'Platform Owner verified and active as required approver.',
        }
      : {
          name: 'Glory Eseosa (Owner)',
          officialEmail: 'engreseglory@gmail.com',
          orderIndex: 4,
          matched: false,
          isDesignatedActiveReviewer: false,
          hasReviewerAccessRole: false,
          notes: 'Platform Owner account not found.',
        };

    const matchedCount = results.filter((r) => r.matched).length;
    return {
      officialReviewers: results,
      platformOwner: platformOwnerStatus,
      allApprovers: [...results, platformOwnerStatus],
      matchedCount,
      unmatchedCount: results.length - matchedCount,
      allConfigured: matchedCount === results.length,
    };
  }

  /**
   * Synchronizes the 3 official designated reviewers:
   * 1. Looks up existing accounts matching official directory emails.
   * 2. For matched accounts, activates them in TimetableReviewer and grants TIMETABLE_REVIEWER role.
   * 3. For unmatched accounts, does NOT create duplicate or fake accounts; reports status.
   */
  async syncOfficialReviewers(actorUserId?: string) {
    const reviewerRole = await this.prisma.accessRole.findUnique({
      where: { key: 'TIMETABLE_REVIEWER' },
    });

    const results: OfficialReviewerStatusItem[] = [];

    return this.prisma.$transaction(async (tx) => {
      const matchedUserIds: string[] = [];

      for (const conf of OFFICIAL_TIMETABLE_REVIEWERS) {
        const user = await tx.user.findFirst({
          where: { email: { equals: conf.email, mode: 'insensitive' } },
          include: { member: true },
        });

        if (user) {
          matchedUserIds.push(user.id);

          // Upsert TimetableReviewer
          await tx.timetableReviewer.upsert({
            where: { userId: user.id },
            update: {
              active: true,
              orderIndex: conf.orderIndex,
              designatedByUserId: actorUserId || null,
            },
            create: {
              userId: user.id,
              active: true,
              orderIndex: conf.orderIndex,
              designatedByUserId: actorUserId || null,
            },
          });

          // Ensure TIMETABLE_REVIEWER access role
          if (reviewerRole) {
            await tx.userAccessRole.upsert({
              where: {
                userId_roleId: {
                  userId: user.id,
                  roleId: reviewerRole.id,
                },
              },
              update: {},
              create: {
                userId: user.id,
                roleId: reviewerRole.id,
              },
            });
          }

          results.push({
            name: conf.name,
            officialEmail: conf.email,
            orderIndex: conf.orderIndex,
            matched: true,
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            hasReviewerAccessRole: true,
            isDesignatedActiveReviewer: true,
            notes: 'Successfully matched and designated as official timetable reviewer.',
          });
        } else {
          results.push({
            name: conf.name,
            officialEmail: conf.email,
            orderIndex: conf.orderIndex,
            matched: false,
            isDesignatedActiveReviewer: false,
            hasReviewerAccessRole: false,
            notes: `User account not found. Member has not yet registered in the application. Directory email is ${conf.email}. No duplicate account created.`,
          });
        }
      }

      await this.audit.recordWithin(tx, {
        actorUserId: actorUserId || 'SYSTEM',
        action: 'TIMETABLE_OFFICIAL_REVIEWERS_SYNCED',
        entity: 'TimetableReviewer',
        entityId: 'OFFICIAL_REVIEWERS',
        newData: {
          matchedUserIds,
          results,
        } as unknown as Prisma.InputJsonValue,
      });

      return {
        officialReviewers: results,
        matchedCount: matchedUserIds.length,
        unmatchedCount: OFFICIAL_TIMETABLE_REVIEWERS.length - matchedUserIds.length,
      };
    });
  }

  /**
   * Designates the designated reviewer accounts (e.g. 3 reviewers).
   */
  async setReviewers(userIds: string[], actorUserId: string) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException('Please provide an array of reviewer user IDs');
    }

    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

    // Verify all users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      include: { member: true },
    });

    if (users.length !== uniqueUserIds.length) {
      throw new BadRequestException('One or more user accounts could not be found');
    }

    const reviewerRole = await this.prisma.accessRole.findUnique({
      where: { key: 'TIMETABLE_REVIEWER' },
    });

    return this.prisma.$transaction(async (tx) => {
      // Deactivate existing reviewers not in new list
      await tx.timetableReviewer.updateMany({
        where: { userId: { notIn: uniqueUserIds } },
        data: { active: false },
      });

      // Upsert active designated reviewers and ensure TIMETABLE_REVIEWER access role
      for (let i = 0; i < uniqueUserIds.length; i++) {
        const uId = uniqueUserIds[i];
        await tx.timetableReviewer.upsert({
          where: { userId: uId },
          update: {
            active: true,
            orderIndex: i + 1,
            designatedByUserId: actorUserId,
          },
          create: {
            userId: uId,
            active: true,
            orderIndex: i + 1,
            designatedByUserId: actorUserId,
          },
        });

        if (reviewerRole) {
          await tx.userAccessRole.upsert({
            where: {
              userId_roleId: {
                userId: uId,
                roleId: reviewerRole.id,
              },
            },
            update: {},
            create: {
              userId: uId,
              roleId: reviewerRole.id,
            },
          });
        }
      }

      await this.audit.recordWithin(tx, {
        actorUserId,
        action: 'TIMETABLE_REVIEWERS_DESIGNATED',
        entity: 'TimetableReviewer',
        entityId: 'DESIGNATED_REVIEWERS',
        newData: { userIds: uniqueUserIds },
      });

      return tx.timetableReviewer.findMany({
        where: { active: true },
        include: {
          user: {
            select: { id: true, email: true, role: true, member: { select: { firstName: true, lastName: true, memberCode: true } } },
          },
        },
        orderBy: { orderIndex: 'asc' },
      });
    });
  }

  /**
   * Lists active designated reviewers.
   */
  async getReviewers() {
    return this.prisma.timetableReviewer.findMany({
      where: { active: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            member: { select: { id: true, firstName: true, lastName: true, memberCode: true } },
          },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
  }

  /**
   * Submits a reviewer decision (APPROVE or REJECT).
   * Enforces:
   * 1. Only a designated active reviewer can submit a review.
   * 2. Cannot submit duplicate approvals from the same reviewer for the same version.
   * 3. Requires 3 approvals before publication.
   */
  async submitReview(params: {
    versionId: string;
    reviewerUserId: string;
    decision: TimetableReviewDecision;
    comments?: string;
    rejectionReason?: string;
  }) {
    // 1. Verify version exists and is in reviewable state
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: params.versionId },
      include: { period: true, reviews: true },
    });
    if (!version) throw new NotFoundException('Timetable version not found');

    if (!['PENDING_REVIEW', 'DRAFT'].includes(version.status)) {
      throw new BadRequestException(
        `This timetable version cannot be reviewed (current status: ${version.status})`,
      );
    }

    // 2. Verify reviewer is a designated active reviewer or Platform Owner (engreseglory)
    const reviewer = await this.prisma.timetableReviewer.findFirst({
      where: { userId: params.reviewerUserId, active: true },
    });
    const reviewerUser = await this.prisma.user.findUnique({
      where: { id: params.reviewerUserId },
    });
    const isOwnerOrGlory = Boolean(
      reviewerUser?.email &&
      (reviewerUser.email.toLowerCase() === 'engreseglory@gmail.com' ||
       reviewerUser.email.toLowerCase().includes('engreseglory') ||
       reviewerUser.email.toLowerCase() === 'portal-admin@tfhc.org' ||
       reviewerUser.email.toLowerCase() === (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase())
    );

    if (!reviewer && !isOwnerOrGlory) {
      throw new ForbiddenException('You are not a designated reviewer for weekly timetables');
    }

    // 3. Duplicate review prevention
    const existingReview = await this.prisma.timetableReview.findUnique({
      where: {
        versionId_reviewerUserId: {
          versionId: params.versionId,
          reviewerUserId: params.reviewerUserId,
        },
      },
    });
    if (existingReview) {
      throw new ConflictException('You have already submitted your review for this timetable version');
    }

    if (params.decision === TimetableReviewDecision.REJECTED && !params.rejectionReason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting a timetable');
    }

    const policy = await this.getPolicy();

    const result = await this.prisma.$transaction(async (tx) => {
      // Create review record
      const review = await tx.timetableReview.create({
        data: {
          versionId: params.versionId,
          reviewerUserId: params.reviewerUserId,
          decision: params.decision,
          comments: params.comments?.trim() || null,
          rejectionReason: params.rejectionReason?.trim() || null,
        },
      });

      await this.audit.recordWithin(tx, {
        actorUserId: params.reviewerUserId,
        action: params.decision === 'APPROVED' ? 'TIMETABLE_REVIEW_APPROVED' : 'TIMETABLE_REVIEW_REJECTED',
        entity: 'TimetableVersion',
        entityId: params.versionId,
        reason: params.rejectionReason || params.comments || undefined,
        newData: {
          versionId: params.versionId,
          decision: params.decision,
          rejectionReason: params.rejectionReason,
        },
      });

      if (params.decision === TimetableReviewDecision.REJECTED) {
        // Mark version and period REJECTED
        await tx.timetableVersion.update({
          where: { id: params.versionId },
          data: { status: TimetableVersionStatus.REJECTED },
        });
        await tx.timetablePeriod.update({
          where: { id: version.periodId },
          data: { status: TimetablePeriodStatus.REJECTED },
        });

        return {
          review,
          status: 'REJECTED',
          message: 'Timetable has been rejected and returned for revision/regeneration',
          approvedCount: 0,
          requiredCount: policy.requiredApprovalsCount,
          isFullyApproved: false,
          isPublished: false,
        };
      }

      // Check total approvals count for this version
      const allApprovals = await tx.timetableReview.findMany({
        where: { versionId: params.versionId, decision: TimetableReviewDecision.APPROVED },
      });

      const approvedCount = allApprovals.length;
      const isFullyApproved = approvedCount >= policy.requiredApprovalsCount;

      let isPublished = false;

      if (isFullyApproved) {
        // Mark version APPROVED
        await tx.timetableVersion.update({
          where: { id: params.versionId },
          data: { status: TimetableVersionStatus.APPROVED },
        });
        await tx.timetablePeriod.update({
          where: { id: version.periodId },
          data: { status: TimetablePeriodStatus.APPROVED },
        });

        // Auto-publish if policy specifies
        if (policy.autoPublishOnFullApproval) {
          const publishedAt = new Date();
          await tx.timetableVersion.update({
            where: { id: params.versionId },
            data: {
              status: TimetableVersionStatus.PUBLISHED,
              publishedAt,
              publishedByUserId: params.reviewerUserId,
            },
          });
          await tx.timetablePeriod.update({
            where: { id: version.periodId },
            data: {
              status: TimetablePeriodStatus.PUBLISHED,
              publishedAt,
              publishedByUserId: params.reviewerUserId,
            },
          });
          isPublished = true;

          await this.audit.recordWithin(tx, {
            actorUserId: params.reviewerUserId,
            action: 'TIMETABLE_PUBLISHED',
            entity: 'TimetableVersion',
            entityId: params.versionId,
            newData: { autoPublished: true, approvalsCount: approvedCount },
          });
        }
      }

      return {
        review,
        status: isPublished ? 'PUBLISHED' : isFullyApproved ? 'APPROVED' : 'PENDING_REVIEW',
        approvedCount,
        requiredCount: policy.requiredApprovalsCount,
        isFullyApproved,
        isPublished,
        message: isPublished
          ? `All required approvals (${approvedCount}/${policy.requiredApprovalsCount}) received. Timetable has been officially published!`
          : isFullyApproved
          ? `All required approvals (${approvedCount}/${policy.requiredApprovalsCount}) received. Timetable is approved and eligible for publication.`
          : `Approval recorded (${approvedCount} of ${policy.requiredApprovalsCount} required approvals).`,
      };
    });

    if (result.isPublished) {
      this.notifications.notifyPublished({
        versionId: params.versionId,
        weekLabel: version.period?.label || 'Weekly Timetable',
      }).catch((e) => this.logger.warn(`Failed to dispatch publication notifications: ${e.message}`));
    }

    return result;
  }

  /**
   * Explicit publish action by Super Admin / Platform Owner once fully approved,
   * or immediate override publish for emergency / initial rollout.
   */
  async publishTimetable(versionId: string, actorUserId: string, bypassRequirements = false) {
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: versionId },
      include: { period: true, reviews: true },
    });
    if (!version) throw new NotFoundException('Timetable version not found');

    if (version.status === TimetableVersionStatus.REJECTED) {
      throw new BadRequestException('Cannot publish a rejected timetable');
    }

    const isAuthorizedOverride = Boolean(bypassRequirements);

    const policy = await this.getPolicy();
    const approvedReviews = version.reviews.filter((r) => r.decision === TimetableReviewDecision.APPROVED);

    if (!isAuthorizedOverride && approvedReviews.length < policy.requiredApprovalsCount) {
      throw new BadRequestException(
        `Cannot publish timetable. Only ${approvedReviews.length} of ${policy.requiredApprovalsCount} required reviewer approvals have been received.`,
      );
    }

    const publishedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Mark version and period as PUBLISHED
      const updatedVersion = await tx.timetableVersion.update({
        where: { id: versionId },
        data: {
          status: TimetableVersionStatus.PUBLISHED,
          publishedAt,
          publishedByUserId: actorUserId,
        },
      });

      const updatedPeriod = await tx.timetablePeriod.update({
        where: { id: version.periodId },
        data: {
          status: TimetablePeriodStatus.PUBLISHED,
          publishedAt,
          publishedByUserId: actorUserId,
        },
      });

      await this.audit.recordWithin(tx, {
        actorUserId,
        action: 'TIMETABLE_PUBLISHED',
        entity: 'TimetableVersion',
        entityId: versionId,
        newData: { manualPublish: true },
      });

      return {
        period: updatedPeriod,
        version: updatedVersion,
        publishedAt,
      };
    });

    this.notifications.notifyPublished({
      versionId,
      weekLabel: version.period?.label || 'Weekly Timetable',
    }).catch((e) => this.logger.warn(`Failed to dispatch publication notifications: ${e.message}`));

    return result;
  }

  /**
   * Checks whether a user is an authorized reviewer (one of the 3 designated reviewers or Super Admin / Admin).
   */
  async isAuthorizedReviewerOrAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        timetableReviewerDesignations: { where: { active: true } },
        accessRoles: { include: { role: true } },
      },
    });
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (user.timetableReviewerDesignations.length > 0) return true;
    if (OFFICIAL_TIMETABLE_REVIEWERS.some((r) => r.email.toLowerCase() === user.email.toLowerCase())) return true;
    return user.accessRoles.some(
      (ar) =>
        ar.role.key === 'SUPER_ADMIN' ||
        ar.role.key === 'TIMETABLE_REVIEWER' ||
        ar.role.key === 'ADMIN',
    );
  }

  /**
   * Only the three designated reviewers and the Platform Owner may initiate special-event timetable generation.
   * Super Admin visibility and management permissions must not automatically grant permission to initiate special-event generation.
   */
  async isAuthorizedForSpecialEvent(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        timetableReviewerDesignations: { where: { active: true } },
      },
    });
    if (!user) return false;

    // 1. Is designated active reviewer in DB?
    if (user.timetableReviewerDesignations.length > 0) return true;

    // 2. Is in the 3 official designated reviewers definition?
    if (OFFICIAL_TIMETABLE_REVIEWERS.some((r) => r.email.toLowerCase() === user.email.toLowerCase())) {
      return true;
    }

    // 3. Is the Platform Owner?
    const platformOwnerEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase();
    if (user.email.toLowerCase() === platformOwnerEmail) {
      return true;
    }

    return false;
  }

  /**
   * Resets prior approvals for a version when a material change (swap, replace, position, minister) occurs.
   * Modifying an already-approved version resets approval status so all 3 reviewers must independently re-approve.
   */
  private async resetPriorApprovals(
    tx: Prisma.TransactionClient,
    versionId: string,
    periodId: string,
    reason: string,
    actorUserId: string,
  ) {
    const existingReviews = await tx.timetableReview.findMany({
      where: { versionId },
    });

    if (existingReviews.length > 0) {
      await tx.timetableReview.deleteMany({
        where: { versionId },
      });
    }

    await tx.timetableVersion.update({
      where: { id: versionId },
      data: {
        status: TimetableVersionStatus.PENDING_REVIEW,
        publishedAt: null,
        publishedByUserId: null,
      },
    });

    await tx.timetablePeriod.update({
      where: { id: periodId },
      data: {
        status: TimetablePeriodStatus.PENDING_REVIEW,
        publishedAt: null,
        publishedByUserId: null,
      },
    });

    if (existingReviews.length > 0) {
      await this.audit.recordWithin(tx, {
        actorUserId,
        action: 'TIMETABLE_APPROVALS_RESET',
        entity: 'TimetableVersion',
        entityId: versionId,
        reason: `Approvals reset due to timetable modification: ${reason}`,
        newData: { previousApprovedCount: existingReviews.length },
      });
    }
  }

  /**
   * Controlled manual assignment adjustment by Designated Reviewer or Admin.
   * Changes an usher assignment, records an audit log, validates constraints,
   * and resets prior approvals requiring fresh review.
   */
  async adjustAssignment(params: {
    sessionId: string;
    existingMemberId: string;
    newMemberId: string;
    reason: string;
    actorUserId: string;
  }) {
    if (!params.reason?.trim()) {
      throw new BadRequestException('A reason is required for manual assignment adjustment');
    }

    const isAuth = await this.isAuthorizedReviewerOrAdmin(params.actorUserId);
    if (!isAuth) {
      throw new ForbiddenException('Only designated reviewers or administrators can adjust assignments');
    }

    const session = await this.prisma.timetableServiceSession.findUnique({
      where: { id: params.sessionId },
      include: { version: { include: { period: true } }, assignments: true },
    });
    if (!session) throw new NotFoundException('Service session not found');

    // Verify existing assignment
    const existing = session.assignments.find((a) => a.memberId === params.existingMemberId);
    if (!existing) {
      throw new NotFoundException('The specified existing member is not assigned to this service session');
    }

    // Verify replacement member exists and is active
    const newMember = await this.prisma.member.findUnique({
      where: { id: params.newMemberId },
    });
    if (!newMember || newMember.status !== 'ACTIVE') {
      throw new BadRequestException('Replacement member does not exist or is not active');
    }

    // Verify new member is not already in this session
    if (session.assignments.some((a) => a.memberId === params.newMemberId)) {
      throw new BadRequestException('The replacement member is already assigned to this service session');
    }

    const res = await this.prisma.$transaction(async (tx) => {
      // Delete old assignment and create replacement
      await tx.timetableAssignment.delete({ where: { id: existing.id } });
      const newAssignment = await tx.timetableAssignment.create({
        data: {
          sessionId: params.sessionId,
          memberId: params.newMemberId,
          role: existing.role,
          position: existing.position,
          isManualAdjustment: true,
          adjustedByUserId: params.actorUserId,
          adjustmentReason: params.reason.trim(),
        },
      });

      // Reset approvals if any existed
      await this.resetPriorApprovals(
        tx,
        session.version.id,
        session.version.periodId,
        params.reason.trim(),
        params.actorUserId,
      );

      await this.audit.recordWithin(tx, {
        actorUserId: params.actorUserId,
        action: 'TIMETABLE_MANUAL_ADJUSTMENT',
        entity: 'TimetableAssignment',
        entityId: newAssignment.id,
        reason: params.reason.trim(),
        newData: {
          sessionId: params.sessionId,
          previousMemberId: params.existingMemberId,
          newMemberId: params.newMemberId,
          reason: params.reason.trim(),
        },
      });

      return newAssignment;
    });

    this.notifications.notifyReviewers({
      versionId: session.version.id,
      weekLabel: session.version.period?.label || 'Weekly Timetable',
      isResubmission: true,
      reason: params.reason.trim(),
    }).catch((e) => this.logger.warn(`Failed to dispatch notification: ${e.message}`));

    return res;
  }

  /**
   * Swaps two usher assignments across or within sessions.
   * Authorized for designated reviewers and Super Admins.
   * Resets prior approvals so all 3 reviewers must re-approve.
   */
  async swapAssignments(params: {
    assignmentId1: string;
    assignmentId2: string;
    reason?: string;
    actorUserId: string;
  }) {
    const isAuth = await this.isAuthorizedReviewerOrAdmin(params.actorUserId);
    if (!isAuth) {
      throw new ForbiddenException('Only designated reviewers or administrators can swap assignments');
    }

    const a1 = await this.prisma.timetableAssignment.findUnique({
      where: { id: params.assignmentId1 },
      include: { session: { include: { version: true } }, member: true },
    });
    const a2 = await this.prisma.timetableAssignment.findUnique({
      where: { id: params.assignmentId2 },
      include: { session: { include: { version: true } }, member: true },
    });

    if (!a1 || !a2) {
      throw new NotFoundException('One or both assignments could not be found');
    }

    if (a1.session.versionId !== a2.session.versionId) {
      throw new BadRequestException('Cannot swap assignments belonging to different timetable versions');
    }

    const versionId = a1.session.versionId;
    const periodId = a1.session.version.periodId;
    const reason = params.reason?.trim() || `Swapped ${a1.member.firstName} ${a1.member.lastName} with ${a2.member.firstName} ${a2.member.lastName}`;

    const res = await this.prisma.$transaction(async (tx) => {
      if (a1.sessionId !== a2.sessionId) {
        const clash1 = await tx.timetableAssignment.findFirst({
          where: { sessionId: a1.sessionId, memberId: a2.memberId },
        });
        if (clash1) {
          throw new BadRequestException(
            `${a2.member.firstName} ${a2.member.lastName} is already assigned to ${a1.session.serviceName}`,
          );
        }
        const clash2 = await tx.timetableAssignment.findFirst({
          where: { sessionId: a2.sessionId, memberId: a1.memberId },
        });
        if (clash2) {
          throw new BadRequestException(
            `${a1.member.firstName} ${a1.member.lastName} is already assigned to ${a2.session.serviceName}`,
          );
        }
      }

      // Safe swap that avoids unique constraint collisions on (sessionId, memberId)
      // by temporarily removing a2 before updating a1, then recreating a2 with the same ID.
      const a2Data = {
        id: a2.id,
        sessionId: a2.sessionId,
        role: a2.role,
        position: a2.position,
      };

      await tx.timetableAssignment.delete({
        where: { id: a2.id },
      });

      const updated1 = await tx.timetableAssignment.update({
        where: { id: a1.id },
        data: {
          memberId: a2.memberId,
          isManualAdjustment: true,
          adjustedByUserId: params.actorUserId,
          adjustmentReason: reason,
        },
        include: { member: true },
      });

      const updated2 = await tx.timetableAssignment.create({
        data: {
          id: a2Data.id,
          sessionId: a2Data.sessionId,
          memberId: a1.memberId,
          role: a2Data.role,
          position: a2Data.position,
          isManualAdjustment: true,
          adjustedByUserId: params.actorUserId,
          adjustmentReason: reason,
        },
        include: { member: true },
      });

      await this.resetPriorApprovals(tx, versionId, periodId, reason, params.actorUserId);

      await this.audit.recordWithin(tx, {
        actorUserId: params.actorUserId,
        action: 'TIMETABLE_ASSIGNMENT_SWAP',
        entity: 'TimetableVersion',
        entityId: versionId,
        reason,
        newData: {
          assignment1: { id: a1.id, previousMember: a1.memberId, newMember: a2.memberId },
          assignment2: { id: a2.id, previousMember: a2.memberId, newMember: a1.memberId },
        },
      });

      return { assignment1: updated1, assignment2: updated2 };
    });

    this.notifications.notifyReviewers({
      versionId,
      weekLabel: 'Weekly Timetable',
      isResubmission: true,
      reason,
    }).catch((e) => this.logger.warn(`Failed to dispatch notification: ${e.message}`));

    return res;
  }

  /**
   * Updates an assigned usher's position and/or role.
   * Authorized for designated reviewers and Super Admins.
   * Resets prior approvals so all 3 reviewers must re-approve.
   */
  async updateAssignmentPosition(params: {
    assignmentId: string;
    position?: string;
    role?: string;
    reason?: string;
    actorUserId: string;
  }) {
    const isAuth = await this.isAuthorizedReviewerOrAdmin(params.actorUserId);
    if (!isAuth) {
      throw new ForbiddenException('Only designated reviewers or administrators can update assignments');
    }

    const assignment = await this.prisma.timetableAssignment.findUnique({
      where: { id: params.assignmentId },
      include: { session: { include: { version: true } }, member: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const versionId = assignment.session.versionId;
    const periodId = assignment.session.version.periodId;
    const reason = params.reason?.trim() || `Updated position to "${params.position || assignment.position}" / role to "${params.role || assignment.role}"`;

    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.timetableAssignment.update({
        where: { id: params.assignmentId },
        data: {
          position: params.position !== undefined ? params.position : assignment.position,
          role: params.role !== undefined ? params.role : assignment.role,
          isManualAdjustment: true,
          adjustedByUserId: params.actorUserId,
          adjustmentReason: reason,
        },
        include: { member: true },
      });

      await this.resetPriorApprovals(tx, versionId, periodId, reason, params.actorUserId);

      await this.audit.recordWithin(tx, {
        actorUserId: params.actorUserId,
        action: 'TIMETABLE_POSITION_UPDATE',
        entity: 'TimetableAssignment',
        entityId: params.assignmentId,
        reason,
        newData: {
          assignmentId: params.assignmentId,
          position: updated.position,
          role: updated.role,
        },
      });

      return updated;
    });

    this.notifications.notifyReviewers({
      versionId,
      weekLabel: 'Weekly Timetable',
      isResubmission: true,
      reason,
    }).catch((e) => this.logger.warn(`Failed to dispatch notification: ${e.message}`));

    return res;
  }

  /**
   * Updates the supervising minister for a timetable service session.
   * Authorized for designated reviewers and Super Admins.
   * Resets prior approvals so all 3 reviewers must re-approve.
   */
  async updateSessionSupervisingMinister(params: {
    sessionId: string;
    supervisingMinisterId: string;
    reason?: string;
    actorUserId: string;
  }) {
    const isAuth = await this.isAuthorizedReviewerOrAdmin(params.actorUserId);
    if (!isAuth) {
      throw new ForbiddenException('Only designated reviewers or administrators can update supervising ministers');
    }

    const session = await this.prisma.timetableServiceSession.findUnique({
      where: { id: params.sessionId },
      include: { version: true, supervisingMinister: true },
    });
    if (!session) throw new NotFoundException('Service session not found');

    const minister = await this.prisma.member.findUnique({
      where: { id: params.supervisingMinisterId },
    });
    if (!minister || minister.status !== 'ACTIVE') {
      throw new BadRequestException('Selected supervising minister does not exist or is not active');
    }

    const versionId = session.versionId;
    const periodId = session.version.periodId;
    const reason = params.reason?.trim() || `Changed supervising minister to ${minister.firstName} ${minister.lastName}`;

    const res = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.timetableServiceSession.update({
        where: { id: params.sessionId },
        data: {
          supervisingMinisterId: params.supervisingMinisterId,
        },
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
        },
      });

      await this.resetPriorApprovals(tx, versionId, periodId, reason, params.actorUserId);

      await this.audit.recordWithin(tx, {
        actorUserId: params.actorUserId,
        action: 'TIMETABLE_SUPERVISING_MINISTER_UPDATE',
        entity: 'TimetableServiceSession',
        entityId: params.sessionId,
        reason,
        newData: {
          sessionId: params.sessionId,
          previousMinisterId: session.supervisingMinisterId,
          newMinisterId: params.supervisingMinisterId,
        },
      });

      return updatedSession;
    });

    this.notifications.notifyReviewers({
      versionId,
      weekLabel: 'Weekly Timetable',
      isResubmission: true,
      reason,
    }).catch((e) => this.logger.warn(`Failed to dispatch notification: ${e.message}`));

    return res;
  }

  /**
   * Manually sends review request notifications to all 4 required approvers.
   */
  async sendReviewNotifications(versionId: string, actorUserId: string) {
    const isAuth = await this.isAuthorizedReviewerOrAdmin(actorUserId);
    if (!isAuth) {
      throw new ForbiddenException('Only designated reviewers or administrators can send review notifications');
    }
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: versionId },
      include: { period: true },
    });
    if (!version) throw new NotFoundException('Timetable version not found');

    return this.notifications.notifyReviewers({
      versionId,
      weekLabel: version.period?.label || 'Weekly Timetable',
      isResubmission: version.status === TimetableVersionStatus.PENDING_REVIEW,
    });
  }
}
