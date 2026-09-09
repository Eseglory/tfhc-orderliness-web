import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LookupKind, LookupsService } from './lookups.service';

const KINDS: LookupKind[] = ['event-types', 'meeting-categories', 'sub-teams'];
function assertKind(kind: string): LookupKind {
  if (!KINDS.includes(kind as LookupKind)) throw new BadRequestException('Unknown lookup table');
  return kind as LookupKind;
}

@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupsController {
  constructor(private readonly service: LookupsService) {}

  @Get(':kind')
  @RequirePermissions('lookups.read')
  list(@Param('kind') kind: string, @Query('includeInactive') includeInactive?: string) {
    return this.service.list(assertKind(kind), includeInactive === 'true');
  }

  @Post(':kind')
  @RequirePermissions('lookups.manage')
  create(@Param('kind') kind: string, @Body() dto: Record<string, unknown>, @CurrentUser('userId') userId: string) {
    return this.service.create(assertKind(kind), dto, userId);
  }

  @Patch(':kind/:id')
  @RequirePermissions('lookups.manage')
  update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.update(assertKind(kind), id, dto, userId);
  }

  @Delete(':kind/:id')
  @RequirePermissions('lookups.manage')
  remove(@Param('kind') kind: string, @Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.remove(assertKind(kind), id, userId);
  }
}
