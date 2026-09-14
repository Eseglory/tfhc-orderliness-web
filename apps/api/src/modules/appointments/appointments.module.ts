import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [PrismaModule, RbacModule, CalendarModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
