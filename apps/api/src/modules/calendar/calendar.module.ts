import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { PrismaModule } from '../../prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarProvider],
  exports: [CalendarService, GoogleCalendarProvider],
})
export class CalendarModule {}
