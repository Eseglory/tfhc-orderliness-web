import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, MemberStatus } from '@tfhc/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.LEADER)
  async getAll(
    @Query('status') status?: MemberStatus,
    @Query('subTeamId') subTeamId?: string,
    @Query('search') search?: string
  ) {
    return this.membersService.findAll({ status, subTeamId, search });
  }

  @Get('sub-teams')
  @Roles(Role.ADMIN, Role.LEADER)
  async getSubTeams() {
    return this.membersService.getSubTeams();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('sub-teams')
  async createSubTeam(@Body() body: { name: string; description?: string }) {
    return this.membersService.createSubTeam(body);
  }

  @Get('me/profile')
  async getMyProfile(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.findProfile(memberId);
  }

  @Put('me/profile')
  async updateMyProfile(@CurrentUser('memberId') memberId: string | undefined, @Body() body: any) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.updateSelfProfile(memberId, body);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.LEADER)
  async getOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post()
  async create(@Body() body: any) {
    return this.membersService.createMember(body);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.membersService.updateMember(id, body);
  }
}
