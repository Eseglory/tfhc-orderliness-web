import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServicesService, CreateServiceDto, UpdateServiceDto } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { assertEventCreateAuthority } from '../../common/rbac/authorization-rules';
import { ServiceCategory } from '@prisma/client';

@Controller('services')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: ServiceCategory,
    @Query('activeOnly') activeOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.servicesService.findAll({
      search,
      category,
      activeOnly: activeOnly === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.servicesService.findById(id);
  }

  @Post()
  @RequirePermissions('events.create')
  create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthenticatedUser) {
    assertEventCreateAuthority(user, 'services');
    return this.servicesService.create(dto, user.userId);
  }

  @Put(':id')
  @RequirePermissions('events.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('events.update')
  toggleStatus(@Param('id') id: string, @Body('active') active: boolean) {
    return this.servicesService.toggleStatus(id, active);
  }

  @Delete(':id')
  @RequirePermissions('events.cancel')
  delete(@Param('id') id: string) {
    return this.servicesService.delete(id);
  }
}
