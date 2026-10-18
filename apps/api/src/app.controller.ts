import { Controller, Get, Optional, UseGuards } from '@nestjs/common';
import { DailySyncJob } from './database-sync/daily-sync.job';
import { PrismaService } from './prisma/prisma.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/rbac/permissions.guard';
import { RequirePermissions } from './common/rbac/permissions.decorator';

@Controller()
export class AppController {
  constructor(@Optional() private readonly sync?: DailySyncJob, @Optional() private readonly prisma?: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('health/database-sync')
  databaseSync() {
    // Deliberately no record counts, database paths, or error details on a public route.
    const sqlite = process.env.OPERATIONAL_DATABASE === 'sqlite';
    return { operationalDatabase: sqlite ? 'sqlite' : 'postgresql', sqlitePrimaryReady: sqlite,
      dailyOperationalSyncEnabled: this.sync?.status().enabled ?? false };
  }

  @Get('health/database-sync/details')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('reports.view')
  async databaseSyncDetails() {
    const backlog = this.prisma?.operationalAdapter ? await this.prisma.operationalAdapter.journal.status() : null;
    return { ...this.databaseSync(), schedule: this.sync?.status(), backlog,
      recoveryProtection: process.env.SQLITE_DURABILITY === 'postgres-journal' ? 'postgres-journal' : 'local',
      status: backlog && (backlog.conflicts > 0 || (process.env.SQLITE_DURABILITY === 'postgres-journal' && backlog.unprotected > 0)) ? 'degraded' : 'ok' };
  }
}
