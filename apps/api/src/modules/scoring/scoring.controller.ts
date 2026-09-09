import { ForbiddenException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('scoring')
export class ScoringController {
  constructor(private scoringService: ScoringService) {}

  @Get('sub-teams')
  async teams() { return this.scoringService.teams(); }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('subTeamId') subTeamId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string
  ) {
    return this.scoringService.getLeaderboard({
      subTeamId,
      startDate,
      endDate,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('member/:memberId')
  async getMemberPerformance(@Param('memberId') memberId: string, @CurrentUser() user: any) {
    if (user.role === 'MEMBER' && user.memberId !== memberId) throw new ForbiddenException('You can only view your own performance details');
    return this.scoringService.getMemberPerformance(memberId);
  }

  @Get('my-performance')
  async getMyPerformance(@CurrentUser('memberId') memberId: string) {
    return this.scoringService.getMemberPerformance(memberId);
  }
}
