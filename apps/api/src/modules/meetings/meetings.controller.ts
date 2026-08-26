import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, MeetingStatus } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Get('categories')
  async getCategories() {
    return this.meetingsService.getCategories();
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('categories')
  async createCategory(@Body() body: any) {
    return this.meetingsService.createCategory(body);
  }

  @Get('active')
  async getActiveMeeting() {
    return this.meetingsService.findActiveMeeting();
  }

  @Get()
  async getAll(
    @Query('status') status?: MeetingStatus,
    @Query('categoryId') categoryId?: string
  ) {
    return this.meetingsService.findAll({ status, categoryId });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.meetingsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get(':id/qr-code')
  async getQrCode(@Param('id') id: string) {
    return this.meetingsService.generateDynamicQrCode(id);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post()
  async create(@Body() body: any) {
    return this.meetingsService.createMeeting(body);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('recurring')
  async createRecurring(@Body() body: any) {
    return this.meetingsService.createRecurringMeetings(body);
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: MeetingStatus }
  ) {
    return this.meetingsService.updateStatus(id, body.status);
  }
}
