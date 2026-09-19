import { FileInterceptor } from '@nestjs/platform-express';
import { CreateMemberDto, UpdateMemberDto, GoogleAccessDto } from './member.dto';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ForbiddenException, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
import { MembersService } from './members.service';
import { MemberImportService } from './member-import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, MemberStatus } from '@tfhc/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';

import { LookupsService } from '../lookups/lookups.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('members')
export class MembersController {
  constructor(
    private membersService: MembersService,
    private memberImport: MemberImportService,
    private lookupsService: LookupsService,
  ) {}

  @RequirePermissions('members.create')
  @Post('import')
  async importDirectory(
    @Body() body: { rows: any[]; apply?: boolean },
    @CurrentUser('userId') userId: string,
  ) {
    return this.memberImport.importDirectory(body?.rows ?? [], userId, body?.apply === true);
  }

  @Get()
  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.read')
  async getAll(
    @Query('status') status?: MemberStatus,
    @Query('subTeamId') subTeamId?: string,
    @Query('search') search?: string
  ) {
    return this.membersService.findAll({ status, subTeamId, search });
  }

  @Get('sub-teams')
  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.read')
  async getSubTeams() {
    return this.membersService.getSubTeams();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.create')
  @Post('sub-teams')
  async createSubTeam(@Body() body: { name: string; description?: string }) {
    return this.membersService.createSubTeam(body);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Put('sub-teams/:id')
  async updateSubTeam(@Param('id') id: string, @Body() body: { name?: string; description?: string; active?: boolean }) {
    return this.membersService.updateSubTeam(id, body);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.delete')
  @Delete('sub-teams/:id')
  async deleteSubTeam(@Param('id') id: string) {
    return this.membersService.deleteSubTeam(id);
  }

  @Get('me/notifications')
  async notifications(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.notifications(memberId);
  }

  @Put('me/notifications/read')
  async readNotifications(@CurrentUser('memberId') memberId: string | undefined, @Body() body?: { ids?: string[] }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.readNotifications(memberId, body?.ids);
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

  @Post('me/banner')
  @UseInterceptors(FileInterceptor('banner', { limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 } }))
  async uploadMyBanner(@CurrentUser('memberId') memberId: string | undefined, @UploadedFile() file: { buffer: Buffer; size: number }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.updateBanner(memberId, file);
  }

  @Delete('me/banner')
  async removeMyBanner(@CurrentUser('memberId') memberId?: string) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.removeBanner(memberId);
  }

  @Post('me/banner-preset')
  async setMyBannerPreset(@CurrentUser('memberId') memberId: string | undefined, @Body() body: { bannerUrl: string }) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    return this.membersService.setBannerUrl(memberId, body.bannerUrl);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 } }))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number }) {
    await this.membersService.findOne(id);
    return this.membersService.updatePhoto(id, file);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Delete(':id/photo')
  async removePhoto(@Param('id') id: string) {
    await this.membersService.findOne(id);
    return this.membersService.removePhoto(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Post(':id/banner')
  @UseInterceptors(FileInterceptor('banner', { limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 } }))
  async uploadBanner(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number }) {
    await this.membersService.findOne(id);
    return this.membersService.updateBanner(id, file);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Post(':id/banner-preset')
  async setBannerPreset(@Param('id') id: string, @Body() body: { bannerUrl: string }) {
    await this.membersService.findOne(id);
    return this.membersService.setBannerUrl(id, body.bannerUrl);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Delete(':id/banner')
  async removeBanner(@Param('id') id: string) {
    await this.membersService.findOne(id);
    return this.membersService.removeBanner(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.read')
  @Get('invite-candidates')
  async getInviteCandidates(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.lookupsService.listApprovedMembers({
      search,
      inviteStatus: status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.create')
  @Post('invite')
  async inviteCandidate(
    @Body() body: {
      ids?: string[];
      approvedMemberIds?: string[];
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.email?.toLowerCase() !== 'engreseglory@gmail.com' && !user.isSuperAdmin && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only authorized administrators can invite members.');
    }
    return this.membersService.inviteCandidateByEmailOrId(body, user.userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.read')
  async getOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.create')
  @Post()
  async create(@Body() body: CreateMemberDto, @CurrentUser() user: any) {
    if (body.email && user.role !== Role.ADMIN) throw new ForbiddenException("Only administrators can approve Google access");
    return this.membersService.createMember(body);
  }

  @Roles(Role.ADMIN)
  @RequirePermissions('members.update')
  @Put(':id/google-access')
  async googleAccess(@Param('id') id: string, @Body() body: GoogleAccessDto, @CurrentUser('userId') actorId: string) {
    return this.membersService.setGoogleAccess(id, body, actorId);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.create')
  @Post(':id/invite')
  async inviteExistingMember(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.email?.toLowerCase() !== 'engreseglory@gmail.com' && !user.isSuperAdmin && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only authorized administrators can invite members.');
    }
    return this.membersService.inviteMember(id, user.userId);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @RequirePermissions('members.update')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateMemberDto) {
    return this.membersService.updateMember(id, body);
  }
}
