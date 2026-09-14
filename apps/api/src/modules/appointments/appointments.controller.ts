import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AppointmentsService,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppointmentStatus } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('appointments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('serviceId') serviceId?: string,
    @Query('memberId') memberId?: string,
    @Query('providerId') providerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const isStaff = user?.role !== 'MEMBER' || user?.permissions?.some(p => ['*', 'events.read', 'events.create'].includes(p));
    const effectiveMemberId = isStaff ? memberId : user?.memberId;

    return this.appointmentsService.findAll({
      search,
      status,
      serviceId,
      memberId: effectiveMemberId,
      providerId,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('availability')
  getAvailability(
    @Query('date') date: string,
    @Query('providerId') providerId?: string,
    @Query('duration') duration?: string,
  ) {
    return this.appointmentsService.getAvailability(
      date || new Date().toISOString().split('T')[0],
      providerId,
      duration ? Number(duration) : 30,
    );
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.appointmentsService.findById(id, user);
  }

  @Post()
  @RequirePermissions('events.create')
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.appointmentsService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermissions('events.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.appointmentsService.update(id, dto, userId);
  }

  @Patch(':id/reschedule')
  @RequirePermissions('events.update')
  reschedule(
    @Param('id') id: string,
    @Body() body: { startTime: string; endTime?: string; reason?: string },
    @CurrentUser('userId') userId: string,
  ) {
    return this.appointmentsService.reschedule(id, body.startTime, body.endTime, body.reason, userId);
  }

  @Patch(':id/status')
  @RequirePermissions('events.update')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: AppointmentStatus; cancellationReason?: string },
  ) {
    return this.appointmentsService.updateStatus(id, body.status, body.cancellationReason);
  }
}
