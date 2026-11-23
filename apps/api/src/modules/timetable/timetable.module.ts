import { Module } from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { TimetableGeneratorService } from './timetable-generator.service';
import { TimetableReviewService } from './timetable-review.service';
import { TimetableEligibilityService } from './timetable-eligibility.service';
import { MemberTimetableController, TimetableAdminController } from './timetable.controller';
import { WeeklyTimetableJob } from '../../jobs/weekly-timetable.job';
import { AuditService } from '../../common/rbac/audit.service';

@Module({
  controllers: [MemberTimetableController, TimetableAdminController],
  providers: [
    TimetableService,
    TimetableGeneratorService,
    TimetableReviewService,
    TimetableEligibilityService,
    WeeklyTimetableJob,
    AuditService,
  ],
  exports: [
    TimetableService,
    TimetableGeneratorService,
    TimetableReviewService,
    TimetableEligibilityService,
  ],
})
export class TimetableModule {}
