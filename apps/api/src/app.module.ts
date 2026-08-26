import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { ExcusesModule } from './modules/excuses/excuses.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AbsenceProcessingJob } from './jobs/absence-processing.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MembersModule,
    MeetingsModule,
    AttendanceModule,
    ScoringModule,
    ExcusesModule,
    AlertsModule,
    ReportsModule,
  ],
  providers: [AbsenceProcessingJob],
})
export class AppModule {}
