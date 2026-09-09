import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@tfhc/shared';
import { RecurringServicesService, RecurringConfig } from './recurring-services.service';

@Controller('service-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RecurringServicesController {
  constructor(private readonly service: RecurringServicesService) {}
  @Get() list() { return this.service.list(); }
  @Put('config') configure(@Body() body: RecurringConfig) { return this.service.saveConfiguration(body); }
  @Post() create(@Body() body: unknown) { return this.service.saveSchedule(undefined, body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.service.saveSchedule(id, body); }
}
