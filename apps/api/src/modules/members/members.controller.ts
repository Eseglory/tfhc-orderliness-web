import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, MemberStatus } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get()
  async getAll(
    @Query('status') status?: MemberStatus,
    @Query('subTeamId') subTeamId?: string,
    @Query('search') search?: string
  ) {
    return this.membersService.findAll({ status, subTeamId, search });
  }

  @Get('sub-teams')
  async getSubTeams() {
    return this.membersService.getSubTeams();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('sub-teams')
  async createSubTeam(@Body() body: { name: string; description?: string }) {
    return this.membersService.createSubTeam(body);
  }

  @Get(':id')
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
