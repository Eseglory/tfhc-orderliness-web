import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ExcusesService } from './excuses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('excuses')
export class ExcusesController {
  constructor(private excusesService: ExcusesService) {}

  @Get('mine')
  async mine(@CurrentUser('memberId') memberId?: string) { return this.excusesService.getMyExcuses(memberId); }

  @Post()
  async submitExcuse(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.excusesService.submitExcuse({
      memberId,
      meetingId: body?.meetingId,
      reason: body?.reason,
      category: body?.category,
    });
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get('pending')
  async getPendingExcuses() {
    return this.excusesService.getPendingExcuses();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Put(':id/review')
  async reviewExcuse(
    @Param('id') excuseId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() body: any
  ) {
    return this.excusesService.reviewExcuse({
      excuseId,
      adminUserId,
      status: body.status,
      reviewNote: body.reviewNote,
    });
  }

  @Post('corrections')
  async submitCorrection(@CurrentUser('memberId') memberId: string, @Body() body: any) {
    return this.excusesService.submitCorrectionRequest({
      memberId,
      meetingId: body?.meetingId,
      requestedStatus: body.requestedStatus,
      reason: body?.reason,
    });
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get('corrections/pending')
  async getPendingCorrections() {
    return this.excusesService.getPendingCorrections();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Put('corrections/:id/review')
  async reviewCorrection(
    @Param('id') correctionId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() body: any
  ) {
    return this.excusesService.reviewCorrection({
      correctionId,
      adminUserId,
      status: body.status,
    });
  }
}
