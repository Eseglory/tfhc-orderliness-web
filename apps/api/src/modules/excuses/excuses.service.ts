import { canViewEvent } from '../../common/event-visibility';
import { unitPolicy } from '../../common/unit-policy';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { ExcuseStatus, AttendanceStatus, AttendanceMethod, calculateAttendancePoints } from '@tfhc/shared';
import { isJacob, isDaniel } from '../../common/rbac/authorization-rules';
import { ApprovalsService } from '../approvals/approvals.service';

const EXCUSE_ENTITY = 'AbsenceExcuse';

export interface SubmitExcuseDto {
  memberId: string;
  meetingId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  requestType?: string;
  reason: string;
  category: string;
  supportingDocUrl?: string;
}

@Injectable()
export class ExcusesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private approvals: ApprovalsService,
    private cache: CacheService,
  ) {}

  onModuleInit() {
    // When the (possibly multi-level) approval request for an excuse reaches a
    // terminal state, apply the decision: excuse the attendance or record a
    // rejection, and notify the member.
    this.approvals.registerFinalizer(EXCUSE_ENTITY, async ({ entityId, approved, actorUserId, comment }) => {
      await this.applyExcuseDecision(entityId, approved ? ExcuseStatus.APPROVED : ExcuseStatus.REJECTED, actorUserId, comment ?? undefined);
    });
  }

  async submitExcuse(dto: SubmitExcuseDto) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (typeof dto.reason !== 'string' || !dto.reason.trim() || dto.reason.length > 2000) {
      throw new BadRequestException('A detailed reason is required (up to 2000 characters)');
    }
    if (typeof dto.category !== 'string' || !dto.category.trim()) {
      throw new BadRequestException('A reason category is required');
    }

    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can request absence');

    let start: Date | undefined;
    let end: Date | undefined;

    if (dto.startDate) {
      start = new Date(dto.startDate);
      if (!Number.isFinite(start.getTime())) throw new BadRequestException('Invalid start date');
    }
    if (dto.endDate) {
      end = new Date(dto.endDate);
      if (!Number.isFinite(end.getTime())) throw new BadRequestException('Invalid end date');
    }
    if (start && end && start > end) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }

    // Specific meeting / service / event flow
    if (dto.meetingId) {
      if (typeof dto.meetingId !== 'string') throw new BadRequestException('Invalid meeting ID');
      const meeting = await this.prisma.meeting.findUnique({
        where: { id: dto.meetingId },
        include: { audiences: true },
      });
      if (!meeting) throw new NotFoundException('Meeting not found');
      if (!canViewEvent(meeting.visibility, meeting.audiences, { memberId: member.id, subTeamId: member.subTeamId, roleInUnit: member.roleInUnit })) {
        throw new NotFoundException('Meeting not found');
      }
      if (meeting.status === 'CANCELLED') throw new BadRequestException('This event has been cancelled');

      const existing = await this.prisma.absenceExcuse.findFirst({
        where: {
          memberId: dto.memberId,
          meetingId: dto.meetingId,
          status: { in: [ExcuseStatus.PENDING, ExcuseStatus.APPROVED] },
        },
      });
      if (existing) throw new BadRequestException('You already have an active excuse request for this meeting');
    } else if (start && end) {
      // General unavailability flow (date range)
      const existing = await this.prisma.absenceExcuse.findFirst({
        where: {
          memberId: dto.memberId,
          status: { in: [ExcuseStatus.PENDING, ExcuseStatus.APPROVED] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (existing) throw new BadRequestException('You already have an active leave request covering this date period');
    } else {
      throw new BadRequestException('Either a specific meeting or a start and end date range is required');
    }

    const requestType = dto.requestType?.trim() || (dto.meetingId ? 'MEETING' : 'GENERAL_UNAVAILABILITY');

    const excuse = await this.prisma.absenceExcuse.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId ?? null,
        startDate: start ?? null,
        endDate: end ?? null,
        requestType,
        supportingDocUrl: dto.supportingDocUrl?.trim() || null,
        reason: dto.reason.trim(),
        category: dto.category.trim(),
        status: ExcuseStatus.PENDING,
      },
      include: { meeting: true, member: true },
    });

    const summary = excuse.meeting
      ? `Absence: ${excuse.member.firstName} ${excuse.member.lastName} — ${excuse.meeting.title}`
      : `Leave: ${excuse.member.firstName} ${excuse.member.lastName} (${excuse.category}) ${start?.toLocaleDateString()} to ${end?.toLocaleDateString()}`;

    const approval = await this.approvals.open({
      requestType: 'ABSENCE',
      entityType: EXCUSE_ENTITY,
      entityId: excuse.id,
      summary,
      requestedByMemberId: dto.memberId,
      requestedByUserId: member.userId,
    });
    if (approval) {
      await this.prisma.absenceExcuse.update({ where: { id: excuse.id }, data: { approvalRequestId: approval.id } });
    }
    this.cache.invalidateTags(['excuses', 'dashboard', 'analytics']);
    return excuse;
  }

  /** Idempotently apply a terminal excuse decision. */
  private async applyExcuseDecision(excuseId: string, status: ExcuseStatus, actorUserId: string, reviewNote?: string) {
    const excuse = await this.prisma.absenceExcuse.findUnique({
      where: { id: excuseId },
      include: { meeting: true, member: true },
    });
    if (!excuse) throw new NotFoundException('Absence excuse request not found');

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.absenceExcuse.updateMany({
        where: { id: excuseId, status: ExcuseStatus.PENDING },
        data: { status, reviewedBy: actorUserId, reviewNote: reviewNote ?? excuse.reviewNote },
      });
      if (!claimed.count) return excuse;

      const updatedExcuse = await tx.absenceExcuse.update({
        where: { id: excuseId },
        data: { status, reviewedBy: actorUserId, reviewNote: reviewNote ?? excuse.reviewNote },
        include: { meeting: true, member: true },
      });

      if (status === ExcuseStatus.APPROVED) {
        // Case 1: Specific meeting linked
        if (excuse.meetingId && excuse.meeting) {
          const existingRecord = await tx.attendanceRecord.findUnique({
            where: { memberId_meetingId: { memberId: excuse.memberId, meetingId: excuse.meetingId } },
          });
          const record = existingRecord
            ? await tx.attendanceRecord.update({
                where: { id: existingRecord.id },
                data: { status: AttendanceStatus.EXCUSED, isModified: true, pointsEarned: 0 },
              })
            : await tx.attendanceRecord.create({
                data: {
                  memberId: excuse.memberId,
                  meetingId: excuse.meetingId,
                  expectedArrivalTime: excuse.meeting.expectedArrivalTime,
                  status: AttendanceStatus.EXCUSED,
                  isModified: true,
                  pointsEarned: 0,
                },
              });
          await tx.auditLog.create({
            data: {
              actorUserId,
              action: 'ABSENCE_EXCUSE_APPROVED',
              entity: 'AttendanceRecord',
              entityId: record.id,
              previousData: existingRecord ? JSON.parse(JSON.stringify(existingRecord)) : undefined,
              newData: JSON.parse(JSON.stringify(record)),
              reason: `Excuse approved: ${reviewNote || excuse.reason}`,
            },
          });
        }

        // Case 2: General unavailability date range linked
        if (excuse.startDate && excuse.endDate) {
          const overlappingMeetings = await tx.meeting.findMany({
            where: {
              startTime: { gte: excuse.startDate, lte: excuse.endDate },
              status: { not: 'CANCELLED' },
            },
            include: { audiences: true },
          });

          for (const m of overlappingMeetings) {
            if (!canViewEvent(m.visibility, m.audiences, { memberId: excuse.memberId, subTeamId: excuse.member?.subTeamId, roleInUnit: excuse.member?.roleInUnit })) {
              continue;
            }
            const existingRecord = await tx.attendanceRecord.findUnique({
              where: { memberId_meetingId: { memberId: excuse.memberId, meetingId: m.id } },
            });
            const rec = existingRecord
              ? await tx.attendanceRecord.update({
                  where: { id: existingRecord.id },
                  data: { status: AttendanceStatus.EXCUSED, isModified: true, pointsEarned: 0 },
                })
              : await tx.attendanceRecord.create({
                  data: {
                    memberId: excuse.memberId,
                    meetingId: m.id,
                    expectedArrivalTime: m.expectedArrivalTime,
                    status: AttendanceStatus.EXCUSED,
                    isModified: true,
                    pointsEarned: 0,
                  },
                });
            await tx.auditLog.create({
              data: {
                actorUserId,
                action: 'ABSENCE_EXCUSE_APPROVED',
                entity: 'AttendanceRecord',
                entityId: rec.id,
                reason: `General leave approved (${excuse.category}): ${reviewNote || excuse.reason}`,
              },
            });
          }
        }
      } else if (status === ExcuseStatus.REJECTED) {
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: 'ABSENCE_EXCUSE_REJECTED',
            entity: 'AbsenceExcuse',
            entityId: excuse.id,
            reason: `Excuse rejected: ${reviewNote || 'No reason provided'}`,
          },
        });
      }

      await tx.memberNotification.create({
        data: {
          memberId: excuse.memberId,
          type: 'ABSENCE_DECISION',
          title: `Absence request ${status === ExcuseStatus.APPROVED ? 'approved' : 'rejected'}`,
          body: `${excuse.meeting ? excuse.meeting.title : 'Leave period'}: your absence request was ${status.toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
          data: { meetingId: excuse.meetingId, excuseId: excuse.id },
        },
      });

      return updatedExcuse;
    }).then((res) => {
      this.cache.invalidateTags(['excuses', 'leaderboard', 'analytics', 'dashboard', 'attendance']);
      return res;
    });
  }

  async reviewExcuse(dto: { excuseId: string; adminUserId: string; status: ExcuseStatus; reviewNote?: string }) {
    if (![ExcuseStatus.APPROVED, ExcuseStatus.REJECTED].includes(dto.status)) throw new BadRequestException('Approve or reject the request');
    if (dto.status === ExcuseStatus.REJECTED && (!dto.reviewNote || !dto.reviewNote.trim())) {
      throw new BadRequestException('A reason is required when rejecting an absence request');
    }
    if (dto.reviewNote !== undefined && (typeof dto.reviewNote !== 'string' || dto.reviewNote.length > 2000)) {
      throw new BadRequestException('Invalid review note');
    }
    const excuse = await this.prisma.absenceExcuse.findUnique({
      where: { id: dto.excuseId },
      include: { member: { include: { user: true, approvedMember: true } } },
    });
    if (!excuse) throw new NotFoundException('Absence excuse request not found');
    if (excuse.status !== ExcuseStatus.PENDING) throw new BadRequestException('This request has already been reviewed');

    const requesterEmail = excuse.member.user?.email ?? excuse.member.approvedMember?.normalizedEmail ?? null;
    const adminUser = await this.prisma.user.findUnique({ where: { id: dto.adminUserId }, select: { email: true } });

    if (isJacob(requesterEmail)) {
      if (!isDaniel(adminUser?.email)) {
        throw new ForbiddenException("Only Daniel is authorized to approve Jacob's requests.");
      }
    }

    // Routed through the approval engine when a workflow is attached; this
    // endpoint then fast-tracks every step the caller is authorised for.
    if (excuse.approvalRequestId) {
      const requestId = excuse.approvalRequestId;
      if (dto.status === ExcuseStatus.REJECTED) {
        await this.approvals.act(requestId, dto.adminUserId, 'REJECTED', dto.reviewNote || 'Rejected');
      } else {
        for (let guard = 0; guard < 8; guard++) {
          const current = await this.approvals.getById(requestId);
          if (current.status !== 'PENDING') break;
          try {
            await this.approvals.act(requestId, dto.adminUserId, 'APPROVED', dto.reviewNote);
          } catch (error) {
            const code = (error as { status?: number }).status;
            if (code === 403 || code === 409) break; // not an approver for the remaining step(s)
            throw error;
          }
        }
      }
      this.cache.invalidateTags(['excuses', 'leaderboard', 'analytics', 'dashboard', 'attendance']);
      return this.prisma.absenceExcuse.findUnique({
        where: { id: dto.excuseId },
        include: { meeting: true, member: { include: { subTeam: true } } },
      });
    }

    // Legacy single-level path (no workflow configured).
    return this.applyExcuseDecision(dto.excuseId, dto.status, dto.adminUserId, dto.reviewNote);
  }

  async cancelExcuse(excuseId: string, memberId: string, actorUserId: string) {
    const excuse = await this.prisma.absenceExcuse.findUnique({ where: { id: excuseId } });
    if (!excuse) throw new NotFoundException('Absence excuse not found');
    if (excuse.memberId !== memberId) throw new ForbiddenException('You can only cancel your own requests');
    if (excuse.status !== ExcuseStatus.PENDING) throw new BadRequestException('Only pending requests can be cancelled');

    if (excuse.approvalRequestId) {
      try {
        await this.approvals.cancel(excuse.approvalRequestId, actorUserId, memberId);
      } catch {
        // Continue even if approval request was already finalized or not cancellable
      }
    }

    const updated = await this.prisma.absenceExcuse.update({
      where: { id: excuseId },
      data: { status: ExcuseStatus.CANCELLED },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: 'ABSENCE_EXCUSE_CANCELLED',
        entity: 'AbsenceExcuse',
        entityId: excuseId,
        reason: 'Cancelled by requester',
      },
    });

    this.cache.invalidateTags(['excuses', 'dashboard']);
    return updated;
  }

  async getMyExcuses(memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.cache.wrap(`excuses:my:${memberId}`, 30, () => this.prisma.absenceExcuse.findMany({
      where: { memberId },
      include: {
        meeting: { select: { id: true, title: true, startTime: true, endTime: true, locationName: true } },
        approvalRequest: {
          include: {
            workflow: { select: { key: true, name: true } },
            actions: { select: { stepOrder: true, stepName: true, decision: true, comment: true, createdAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }), ['excuses']);
  }

  async getPendingExcuses(query?: { category?: string; requestType?: string; search?: string }) {
    const key = JSON.stringify([query?.category, query?.requestType, query?.search]);
    return this.cache.wrap(`excuses:pending:${key}`, 30, () => {
      const where: any = { status: ExcuseStatus.PENDING };
      if (query?.category && query.category !== 'ALL') where.category = query.category;
      if (query?.requestType && query.requestType !== 'ALL') where.requestType = query.requestType;
      if (query?.search?.trim()) {
        const q = query.search.trim();
        where.OR = [
          { member: { firstName: { contains: q, mode: 'insensitive' } } },
          { member: { lastName: { contains: q, mode: 'insensitive' } } },
          { member: { memberCode: { contains: q, mode: 'insensitive' } } },
          { meeting: { title: { contains: q, mode: 'insensitive' } } },
          { reason: { contains: q, mode: 'insensitive' } },
        ];
      }

      return this.prisma.absenceExcuse.findMany({
        where,
        include: {
          member: { include: { subTeam: true } },
          meeting: true,
          approvalRequest: {
            include: {
              workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
              actions: { orderBy: { createdAt: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }, ['excuses']);
  }

  async getExcuseHistory(query?: { category?: string; status?: string; search?: string; limit?: number }) {
    const key = JSON.stringify([query?.category, query?.status, query?.search, query?.limit]);
    return this.cache.wrap(`excuses:history:${key}`, 30, () => {
      const allowedHistoryStatuses = [ExcuseStatus.APPROVED, ExcuseStatus.REJECTED, ExcuseStatus.CANCELLED].filter(Boolean);
      const where: any = {
        status: query?.status && query.status !== 'ALL'
          ? (query.status as ExcuseStatus)
          : { in: allowedHistoryStatuses },
      };
      if (query?.category && query.category !== 'ALL') where.category = query.category;
      if (query?.search?.trim()) {
        const q = query.search.trim();
        where.OR = [
          { member: { firstName: { contains: q, mode: 'insensitive' } } },
          { member: { lastName: { contains: q, mode: 'insensitive' } } },
          { member: { memberCode: { contains: q, mode: 'insensitive' } } },
          { meeting: { title: { contains: q, mode: 'insensitive' } } },
          { reason: { contains: q, mode: 'insensitive' } },
        ];
      }

      return this.prisma.absenceExcuse.findMany({
        where,
        include: {
          member: { include: { subTeam: true } },
          meeting: true,
          approvalRequest: {
            include: {
              workflow: { select: { key: true, name: true } },
              actions: { select: { stepOrder: true, stepName: true, decision: true, comment: true, createdAt: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(query?.limit || 100, 200),
      });
    }, ['excuses']);
  }

  async submitCorrectionRequest(dto: {
    memberId: string;
    meetingId: string;
    requestedStatus: AttendanceStatus;
    reason: string;
  }) {
    if (!dto.memberId) throw new ForbiddenException('A member profile is required');
    if (typeof dto.meetingId !== 'string' || !dto.meetingId.trim()) throw new BadRequestException('A meeting is required');
    if (!Object.values(AttendanceStatus).includes(dto.requestedStatus)) throw new BadRequestException('Invalid attendance status');
    if (typeof dto.reason !== 'string' || !dto.reason.trim() || dto.reason.length > 2000) {
      throw new BadRequestException('A detailed reason is required (up to 2000 characters)');
    }
    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can request corrections');
    const meeting = await this.prisma.meeting.findUnique({ where: { id: dto.meetingId }, include: { audiences: true } });
    if (!meeting || !canViewEvent(meeting.visibility, meeting.audiences, {
      memberId: member.id, subTeamId: member.subTeamId, roleInUnit: member.roleInUnit,
    })) throw new NotFoundException('Meeting not found');
    if (meeting.status === 'CANCELLED') throw new BadRequestException('This event has been cancelled');
    const existing = await this.prisma.correctionRequest.findFirst({
      where: { memberId: dto.memberId, meetingId: dto.meetingId, status: ExcuseStatus.PENDING },
    });
    if (existing) throw new BadRequestException('You already have a pending correction request for this meeting');
    return this.prisma.correctionRequest.create({
      data: {
        memberId: dto.memberId,
        meetingId: dto.meetingId,
        requestedStatus: dto.requestedStatus,
        reason: dto.reason.trim(),
        status: ExcuseStatus.PENDING,
      },
      include: { meeting: true },
    });
  }

  async reviewCorrection(dto: {
    correctionId: string;
    adminUserId: string;
    status: ExcuseStatus;
  }) {
    if (![ExcuseStatus.APPROVED, ExcuseStatus.REJECTED].includes(dto.status)) throw new BadRequestException('Approve or reject the request');
    const correction = await this.prisma.correctionRequest.findUnique({
      where: { id: dto.correctionId },
      include: {
        meeting: { include: { category: true } },
        member: { include: { user: true, approvedMember: true } },
      },
    });
    if (!correction) throw new NotFoundException('Correction request not found');

    const requesterEmail = correction.member?.user?.email ?? correction.member?.approvedMember?.normalizedEmail ?? null;
    const adminUser = await this.prisma.user.findUnique({ where: { id: dto.adminUserId }, select: { email: true } });

    if (isJacob(requesterEmail)) {
      if (!isDaniel(adminUser?.email)) {
        throw new ForbiddenException("Only Daniel is authorized to approve Jacob's requests.");
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.correctionRequest.updateMany({ where: { id: dto.correctionId, status: ExcuseStatus.PENDING }, data: { status: dto.status } });
      if (!claimed.count) throw new BadRequestException('This request has already been reviewed');
      const updated = await tx.correctionRequest.update({
        where: { id: dto.correctionId },
        data: {
          status: dto.status,
          reviewedBy: dto.adminUserId,
        },
      });

      if (dto.status === ExcuseStatus.APPROVED) {
        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            memberId_meetingId: {
              memberId: correction.memberId,
              meetingId: correction.meetingId,
            },
          },
        });

        let record;
        if (existingRecord) {
          record = await tx.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: {
              status: correction.requestedStatus,
              pointsEarned: calculateAttendancePoints(correction.requestedStatus as AttendanceStatus, correction.meeting.pointWeight * correction.meeting.category.pointWeight, await unitPolicy(tx)),
              method: AttendanceMethod.CORRECTION_APPROVED,
              isModified: true,
            },
          });
        }

        if (!existingRecord) {
          record = await tx.attendanceRecord.create({
            data: {
              memberId: correction.memberId,
              meetingId: correction.meetingId,
              expectedArrivalTime: correction.meeting.expectedArrivalTime,
              status: correction.requestedStatus,
              method: AttendanceMethod.CORRECTION_APPROVED,
              isModified: true,
              pointsEarned: calculateAttendancePoints(correction.requestedStatus as AttendanceStatus, correction.meeting.pointWeight * correction.meeting.category.pointWeight, await unitPolicy(tx)),
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: dto.adminUserId,
            action: 'CORRECTION_REQUEST_APPROVED',
            entity: 'AttendanceRecord',
            entityId: record?.id || 'N/A',
            previousData: existingRecord ? JSON.parse(JSON.stringify(existingRecord)) : null,
            newData: record ? JSON.parse(JSON.stringify(record)) : null,
            reason: `Correction approved: ${correction.reason}`,
          },
        });
      }

      await tx.memberNotification.create({
        data: {
          memberId: correction.memberId,
          type: 'CORRECTION_DECISION',
          title: `Attendance correction ${dto.status.toLowerCase()}`,
          body: `${correction.meeting.title}: ${dto.status.toLowerCase()}`,
          data: { meetingId: correction.meetingId },
        },
      });
      return updated;
    });
    this.cache.invalidateTags(['attendance', 'leaderboard', 'analytics', 'dashboard', 'excuses']);
    return result;
  }

  async getPendingCorrections() {
    return this.prisma.correctionRequest.findMany({
      where: { status: ExcuseStatus.PENDING },
      include: { member: { include: { subTeam: true } }, meeting: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
