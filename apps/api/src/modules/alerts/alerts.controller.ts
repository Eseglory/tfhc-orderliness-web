import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN, Role.LEADER)
@Controller('alerts')
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  @RequirePermissions('excuses.review')
  async getActiveFlags() {
    return this.alertsService.getActiveFlags();
  }

  @Post('evaluate')
  @RequirePermissions('excuses.review')
  async evaluateFlags() {
    return this.alertsService.evaluateFollowUpFlags();
  }

  @Put(':id/resolve')
  @RequirePermissions('excuses.review')
  async resolveFlag(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.alertsService.resolveFlag(id, body.notes);
  }
}
