import { FileInterceptor } from '@nestjs/platform-express';
import { CreateMemberDto, UpdateMemberDto, GoogleAccessDto } from './member.dto';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ForbiddenException, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
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

  @Get('me/notifications')
  async notifications(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.notifications(memberId);
  }

  @Put('me/notifications/read')
  async readNotifications(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.readNotifications(memberId);
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

  @Post('me/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 } }))
  async uploadMyPhoto(@CurrentUser('memberId') memberId: string | undefined, @UploadedFile() file: { buffer: Buffer; size: number }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.updatePhoto(memberId, file);
  }

  @Delete('me/photo')
  async removeMyPhoto(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.removePhoto(memberId);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 } }))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number }) {
    await this.membersService.findOne(id);
    return this.membersService.updatePhoto(id, file);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Delete(':id/photo')
  async removePhoto(@Param('id') id: string) {
    await this.membersService.findOne(id);
    return this.membersService.removePhoto(id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.LEADER)
  async getOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post()
  async create(@Body() body: CreateMemberDto, @CurrentUser() user: any) {
    if (body.email && user.role !== Role.ADMIN) throw new ForbiddenException("Only administrators can approve Google access");
    return this.membersService.createMember(body);
  }

  @Roles(Role.ADMIN)
  @Put(':id/google-access')
  async googleAccess(@Param('id') id: string, @Body() body: GoogleAccessDto, @CurrentUser('userId') actorId: string) {
    return this.membersService.setGoogleAccess(id, body, actorId);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateMemberDto) {
    return this.membersService.updateMember(id, body);
  }
}
