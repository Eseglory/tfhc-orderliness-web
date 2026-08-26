import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LEADER)
@Controller('alerts')
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  async getActiveFlags() {
    return this.alertsService.getActiveFlags();
  }

  @Post('evaluate')
  async evaluateFlags() {
    return this.alertsService.evaluateFollowUpFlags();
  }

  @Put(':id/resolve')
  async resolveFlag(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.alertsService.resolveFlag(id, body.notes);
  }
}
