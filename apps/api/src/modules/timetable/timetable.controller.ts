import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { TimetableService } from './timetable.service';
import { TimetableGeneratorService } from './timetable-generator.service';
import { TimetableReviewService } from './timetable-review.service';
import { TimetableEligibilityService } from './timetable-eligibility.service';
import { TimetableReviewDecision } from '@prisma/client';

// ---------------------------------------------------------------------------
// Member Timetable Controller
// ---------------------------------------------------------------------------
@Controller('me/timetable')
@UseGuards(JwtAuthGuard)
export class MemberTimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get('current')
  async getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.timetableService.getMemberCurrentTimetable(user.memberId);
  }
}

// ---------------------------------------------------------------------------
// Admin & Reviewer Timetable Controller
// ---------------------------------------------------------------------------
@Controller('timetable')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimetableAdminController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly generator: TimetableGeneratorService,
    private readonly reviewService: TimetableReviewService,
    private readonly eligibilityService: TimetableEligibilityService,
  ) {}

  @Get('admin/current')
  async getAdminCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.timetableService.getAdminCurrentTimetable(user.userId);
  }

  @Get('admin/history')
  @RequirePermissions('timetable.read')
  async getHistory() {
    return this.timetableService.listHistory();
  }

  @Get('admin/version/:id')
  @RequirePermissions('timetable.read')
  async getVersion(@Param('id') id: string) {
    return this.timetableService.getVersionDetails(id);
  }

  @Post('admin/generate')
  @RequirePermissions('timetable.generate')
  async generate(
    @Body() body: { targetWeek?: 'CURRENT' | 'NEXT'; customSeed?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetableService.catchUpOrGenerate(user.userId, body?.targetWeek || 'CURRENT');
  }

  @Post('admin/version/:id/review')
  async reviewVersion(
    @Param('id') id: string,
    @Body() body: { decision: TimetableReviewDecision; comments?: string; rejectionReason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.submitReview({
      versionId: id,
      reviewerUserId: user.userId,
      decision: body.decision,
      comments: body.comments,
      rejectionReason: body.rejectionReason,
    });
  }

  @Post('admin/version/:id/publish')
  @RequirePermissions('timetable.publish')
  async publishVersion(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.publishTimetable(id, user.userId);
  }

  @Post('admin/adjust')
  async adjustAssignment(
    @Body() body: { sessionId: string; existingMemberId: string; newMemberId: string; reason: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.adjustAssignment({
      sessionId: body.sessionId,
      existingMemberId: body.existingMemberId,
      newMemberId: body.newMemberId,
      reason: body.reason,
      actorUserId: user.userId,
    });
  }

  @Post('admin/swap-assignments')
  async swapAssignments(
    @Body() body: { assignmentId1: string; assignmentId2: string; reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.swapAssignments({
      assignmentId1: body.assignmentId1,
      assignmentId2: body.assignmentId2,
      reason: body.reason,
      actorUserId: user.userId,
    });
  }

  @Patch('admin/assignment-position')
  async updateAssignmentPosition(
    @Body() body: { assignmentId: string; position?: string; role?: string; reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.updateAssignmentPosition({
      assignmentId: body.assignmentId,
      position: body.position,
      role: body.role,
      reason: body.reason,
      actorUserId: user.userId,
    });
  }

  @Patch('admin/session-supervising-minister')
  async updateSessionSupervisingMinister(
    @Body() body: { sessionId: string; supervisingMinisterId: string; reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.updateSessionSupervisingMinister({
      sessionId: body.sessionId,
      supervisingMinisterId: body.supervisingMinisterId,
      reason: body.reason,
      actorUserId: user.userId,
    });
  }

  @Post('admin/special-event')
  async generateSpecialEvent(
    @Body()
    body: {
      title: string;
      eventDate: string;
      startTime: string;
      endTime?: string;
      requiredUshers: number;
      supervisingMinisterId?: string;
      notes?: string;
      manualMemberIds?: string[];
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isAuth = await this.reviewService.isAuthorizedForSpecialEvent(user.userId);
    if (!isAuth) {
      throw new ForbiddenException(
        'Only the three designated timetable reviewers and the Platform Owner may initiate special-event timetable generation.',
      );
    }
    return this.generator.generateSpecialEventTimetable({
      title: body.title,
      eventDate: new Date(body.eventDate),
      startTime: new Date(body.startTime),
      endTime: body.endTime ? new Date(body.endTime) : undefined,
      requiredUshers: Number(body.requiredUshers),
      supervisingMinisterId: body.supervisingMinisterId,
      notes: body.notes,
      manualMemberIds: body.manualMemberIds,
      actorUserId: user.userId,
    });
  }

  @Get('admin/supervising-ministers')
  @RequirePermissions('timetable.read')
  async getSupervisingMinisters() {
    return this.generator.getSupervisingMinisterCandidates();
  }

  @Get('admin/eligibility')
  @RequirePermissions('timetable.read')
  async getEligibility() {
    return this.eligibilityService.getEligibilityAudit();
  }

  @Get('admin/reviewers')
  @RequirePermissions('timetable.read')
  async getReviewers() {
    return this.reviewService.getReviewers();
  }

  @Get('admin/reviewers/official-status')
  @RequirePermissions('timetable.read')
  async getOfficialReviewersStatus() {
    return this.reviewService.getOfficialReviewersStatus();
  }

  @Post('admin/reviewers/sync-official')
  @RequirePermissions('timetable.manage')
  async syncOfficialReviewers(@CurrentUser() user: AuthenticatedUser) {
    return this.reviewService.syncOfficialReviewers(user.userId);
  }

  @Post('admin/reviewers')
  @RequirePermissions('timetable.manage')
  async setReviewers(
    @Body() body: { userIds: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.setReviewers(body.userIds, user.userId);
  }

  @Get('admin/policy')
  @RequirePermissions('timetable.read')
  async getPolicy() {
    return this.reviewService.getPolicy();
  }

  @Put('admin/policy')
  @RequirePermissions('timetable.manage')
  async updatePolicy(
    @Body() body: { requiredApprovalsCount?: number; autoPublishOnFullApproval?: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.updatePolicy(body, user.userId);
  }
}
