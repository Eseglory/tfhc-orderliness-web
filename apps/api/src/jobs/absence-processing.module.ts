import { Module } from '@nestjs/common';
import { AbsenceProcessingJob } from './absence-processing.job';
@Module({ providers: [AbsenceProcessingJob], exports: [AbsenceProcessingJob] })
export class AbsenceProcessingModule {}
