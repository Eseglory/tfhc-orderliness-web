import { AbsenceProcessingModule } from '../../jobs/absence-processing.module';
import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { ServiceReminderService } from './service-reminder.service';
import { PushModule } from '../push/push.module';
import { ChatModule } from '../chat/chat.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [AbsenceProcessingModule, CalendarModule, PushModule, ChatModule],
  providers: [MeetingsService, ServiceReminderService],
  controllers: [MeetingsController],
  exports: [MeetingsService, ServiceReminderService],
})
export class MeetingsModule {}
