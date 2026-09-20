import { ServiceReminderModule } from '../modules/meetings/service-reminder.module';
import { Module } from '@nestjs/common';
import { AbsenceProcessingJob } from './absence-processing.job';
@Module({ imports: [ServiceReminderModule], providers: [AbsenceProcessingJob], exports: [AbsenceProcessingJob] })
export class AbsenceProcessingModule {}
