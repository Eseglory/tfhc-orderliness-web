import { ForbiddenException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scoring')
export class ScoringController {
  constructor(private scoringService: ScoringService) {}

  @Get('recognition')
  async recognition(@CurrentUser('role') role: string) {
    if (!['ADMIN', 'LEADER', 'SUPER_ADMIN'].includes(role)) throw new ForbiddenException('Leadership access required');
    return this.scoringService.recognition();
  }

  @Get('sub-teams')
  async teams() {
    return this.scoringService.teams();
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('subTeamId') subTeamId?: string,
    @Query('activityType') activityType?: 'ALL' | 'EVENT' | 'SERVICE' | 'MEETING',
    @Query('categoryId') categoryId?: string,
    @Query('statusFilter') statusFilter?: 'ALL' | 'PERFECT' | 'MISSED',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string
  ) {
    return this.scoringService.getLeaderboard({
      subTeamId,
      activityType,
      categoryId,
      statusFilter,
      startDate,
      endDate,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Get('attendance-analytics')
  @Roles(Role.ADMIN, Role.LEADER)
  async getAttendanceAnalytics(
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('activityType') activityType?: 'ALL' | 'EVENT' | 'SERVICE' | 'MEETING',
    @Query('categoryId') categoryId?: string,
    @Query('subTeamId') subTeamId?: string,
    @Query('memberId') memberId?: string
  ) {
    return this.scoringService.getAdvancedAttendanceAnalytics({
      days: days ? Number(days) : undefined,
      startDate,
      endDate,
      activityType,
      categoryId,
      subTeamId,
      memberId,
    });
  }

  @Get('member/:memberId')
  async getMemberPerformance(@Param('memberId') memberId: string, @CurrentUser() user: any) {
    if (user.role === 'MEMBER' && user.memberId !== memberId) {
      throw new ForbiddenException('You can only view your own performance details');
    }
    return this.scoringService.getMemberPerformance(memberId);
  }

  @Get('my-performance')
  async getMyPerformance(@CurrentUser('memberId') memberId: string) {
    return this.scoringService.getMemberPerformance(memberId);
  }
}
