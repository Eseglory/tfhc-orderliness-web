import { AbsenceProcessingModule } from '../../jobs/absence-processing.module';
import { Module } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';

import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [AbsenceProcessingModule, CalendarModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
  exports: [MeetingsService],
})
export class MeetingsModule {}
