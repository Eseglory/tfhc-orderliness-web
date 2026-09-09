import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovalDecision, ApprovalRequestType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApprovalsService } from './approvals.service';
import { ApprovalWorkflowsService } from './approval-workflows.service';

const asType = (t?: string): ApprovalRequestType | undefined => {
  if (!t) return undefined;
  if (!Object.values(ApprovalRequestType).includes(t as ApprovalRequestType)) throw new BadRequestException('Unknown request type');
  return t as ApprovalRequestType;
};

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @RequirePermissions('approvals.act')
  pending(@CurrentUser('userId') userId: string, @Query('type') type?: string) {
    return this.approvals.pendingFor(userId, asType(type));
  }

  @Get('mine')
  mine(@CurrentUser('memberId') memberId?: string) {
    return memberId ? this.approvals.listForRequester(memberId) : [];
  }

  @Get('history')
  @RequirePermissions('approvals.read')
  history(@Query('type') type?: string) {
    return this.approvals.history(asType(type));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.approvals.getById(id);
  }

  @Post(':id/act')
  @RequirePermissions('approvals.act')
  act(
    @Param('id') id: string,
    @Body() body: { decision: ApprovalDecision; comment?: string },
    @CurrentUser('userId') userId: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(body?.decision)) throw new BadRequestException('decision must be APPROVED or REJECTED');
    return this.approvals.act(id, userId, body.decision, body.comment);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser('userId') userId: string, @CurrentUser('memberId') memberId?: string) {
    return this.approvals.cancel(id, userId, memberId);
  }
}

@Controller('approval-workflows')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalWorkflowsController {
  constructor(private readonly workflows: ApprovalWorkflowsService) {}

  @Get()
  @RequirePermissions('approvals.read')
  list() {
    return this.workflows.list();
  }

  @Post()
  @RequirePermissions('approvals.configure')
  create(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.workflows.create(body, userId);
  }

  @Patch(':id')
  @RequirePermissions('approvals.configure')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.workflows.update(id, body, userId);
  }

  @Delete(':id')
  @RequirePermissions('approvals.configure')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.workflows.remove(id, userId);
  }
}
