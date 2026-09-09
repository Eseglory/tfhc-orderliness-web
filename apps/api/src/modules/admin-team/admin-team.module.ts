import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminTeamController } from './admin-team.controller';
import { AdminTeamService } from './admin-team.service';

@Module({
  imports: [ConfigModule],
  controllers: [AdminTeamController],
  providers: [AdminTeamService],
  exports: [AdminTeamService],
})
export class AdminTeamModule {}
