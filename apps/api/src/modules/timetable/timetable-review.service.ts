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
import {
  TimetablePeriodStatus,
  TimetableVersionStatus,
  TimetableReviewDecision,
  Prisma,
} from '@prisma/client';

export interface TimetableReviewPolicy {
  requiredApprovalsCount: number; // default 3
  autoPublishOnFullApproval: boolean;
}

export const DEFAULT_REVIEW_POLICY: TimetableReviewPolicy = {
  requiredApprovalsCount: 3,
  autoPublishOnFullApproval: true,
};

@Injectable()
export class TimetableReviewService {
  private readonly logger = new Logger(TimetableReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Retrieves the configured approval policy (default: 3 designated reviewers).
   */
  async getPolicy(): Promise<TimetableReviewPolicy> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'timetable_review_policy' },
    });
    if (!setting) return DEFAULT_REVIEW_POLICY;
    try {
      const parsed = JSON.parse(setting.value);
      return {
        requiredApprovalsCount: parsed.requiredApprovalsCount ?? 3,
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

    return this.prisma.$transaction(async (tx) => {
      // Deactivate existing reviewers not in new list
      await tx.timetableReviewer.updateMany({
        where: { userId: { notIn: uniqueUserIds } },
        data: { active: false },
      });

      // Upsert active designated reviewers
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

    // 2. Verify reviewer is a designated active reviewer
    const reviewer = await this.prisma.timetableReviewer.findFirst({
      where: { userId: params.reviewerUserId, active: true },
    });
    if (!reviewer) {
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

    return this.prisma.$transaction(async (tx) => {
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
          ? 'All 3 approvals received. Timetable has been officially published!'
          : isFullyApproved
          ? 'All 3 approvals received. Timetable is approved and eligible for publication.'
          : `Approval recorded (${approvedCount} of ${policy.requiredApprovalsCount} required approvals).`,
      };
    });
  }

  /**
   * Explicit publish action by Super Admin / Platform Owner once fully approved.
   */
  async publishTimetable(versionId: string, actorUserId: string) {
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: versionId },
      include: { period: true, reviews: true },
    });
    if (!version) throw new NotFoundException('Timetable version not found');

    if (version.status === TimetableVersionStatus.REJECTED) {
      throw new BadRequestException('Cannot publish a rejected timetable');
    }

    const policy = await this.getPolicy();
    const approvedReviews = version.reviews.filter((r) => r.decision === TimetableReviewDecision.APPROVED);

    if (approvedReviews.length < policy.requiredApprovalsCount) {
      throw new BadRequestException(
        `Cannot publish timetable. Only ${approvedReviews.length} of ${policy.requiredApprovalsCount} required reviewer approvals have been received.`,
      );
    }

    const publishedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
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
  }

  /**
   * Controlled manual assignment adjustment by Super Admin.
   * Changes an usher assignment, records an audit log, and validates constraints.
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

    return this.prisma.$transaction(async (tx) => {
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

      // Material change: if version was approved or published, reset to PENDING_REVIEW requiring fresh approval
      if (['APPROVED', 'PUBLISHED'].includes(session.version.status)) {
        await tx.timetableVersion.update({
          where: { id: session.version.id },
          data: { status: TimetableVersionStatus.PENDING_REVIEW },
        });
        await tx.timetablePeriod.update({
          where: { id: session.version.periodId },
          data: { status: TimetablePeriodStatus.PENDING_REVIEW },
        });
      }

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
  }
}
