import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseSecretsInterceptor } from './common/interceptors/response-secrets.interceptor';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { ExcusesModule } from './modules/excuses/excuses.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { AbsenceProcessingModule } from './jobs/absence-processing.module';
import { WeeklyAvailabilityJob } from './jobs/weekly-availability.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Generous global ceiling for normal app traffic; auth endpoints apply a
    // much stricter per-route @Throttle() limit against credential guessing.
    // Relaxed only for automated test runs, which reuse one server process
    // across far more requests per minute than any real user would issue.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: process.env.DISABLE_RATE_LIMIT === 'true' ? 100000 : 300 }]),
    PrismaModule,
    AbsenceProcessingModule,
    AuthModule,
    MembersModule,
    MeetingsModule,
    AttendanceModule,
    ScoringModule,
    ExcusesModule,
    AlertsModule,
    ReportsModule,
    DevicesModule,
    AvailabilityModule,
  ],
  controllers: [AppController],
  providers: [
    WeeklyAvailabilityJob,
    { provide: APP_INTERCEPTOR, useClass: ResponseSecretsInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
