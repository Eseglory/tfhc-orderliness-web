import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ExcusesService } from './excuses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('excuses')
export class ExcusesController {
  constructor(private excusesService: ExcusesService) {}

  @Get('mine')
  mine(@CurrentUser('memberId') memberId?: string) {
    return this.excusesService.getMyExcuses(memberId);
  }

  @Post()
  submitExcuse(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.excusesService.submitExcuse({
      memberId,
      meetingId: body?.meetingId,
      reason: body?.reason,
      category: body?.category,
    });
  }

  @RequirePermissions('excuses.review')
  @Get('pending')
  getPendingExcuses() {
    return this.excusesService.getPendingExcuses();
  }

  @RequirePermissions('excuses.review')
  @Put(':id/review')
  reviewExcuse(@Param('id') excuseId: string, @CurrentUser('userId') adminUserId: string, @Body() body: any) {
    return this.excusesService.reviewExcuse({
      excuseId,
      adminUserId,
      status: body.status,
      reviewNote: body.reviewNote,
    });
  }

  @Post('corrections')
  submitCorrection(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.excusesService.submitCorrectionRequest({
      memberId,
      meetingId: body?.meetingId,
      requestedStatus: body.requestedStatus,
      reason: body?.reason,
    });
  }

  @RequirePermissions('corrections.review')
  @Get('corrections/pending')
  getPendingCorrections() {
    return this.excusesService.getPendingCorrections();
  }

  @RequirePermissions('corrections.review')
  @Put('corrections/:id/review')
  reviewCorrection(@Param('id') correctionId: string, @CurrentUser('userId') adminUserId: string, @Body() body: any) {
    return this.excusesService.reviewCorrection({
      correctionId,
      adminUserId,
      status: body.status,
    });
  }
}
