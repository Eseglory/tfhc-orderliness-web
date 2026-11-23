import { Module } from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { TimetableGeneratorService } from './timetable-generator.service';
import { TimetableReviewService } from './timetable-review.service';
import { TimetableEligibilityService } from './timetable-eligibility.service';
import { TimetableAnalyticsService } from './timetable-analytics.service';
import { TimetableReportPdfService } from './timetable-report-pdf.service';
import { TimetableReportExcelService } from './timetable-report-excel.service';
import { MemberTimetableController, TimetableAdminController } from './timetable.controller';
import { TimetableAnalyticsController } from './timetable-analytics.controller';
import { WeeklyTimetableJob } from '../../jobs/weekly-timetable.job';
import { AuditService } from '../../common/rbac/audit.service';

@Module({
  controllers: [
    MemberTimetableController,
    TimetableAdminController,
    TimetableAnalyticsController,
  ],
  providers: [
    TimetableService,
    TimetableGeneratorService,
    TimetableReviewService,
    TimetableEligibilityService,
    TimetableAnalyticsService,
    TimetableReportPdfService,
    TimetableReportExcelService,
    WeeklyTimetableJob,
    AuditService,
  ],
  exports: [
    TimetableService,
    TimetableGeneratorService,
    TimetableReviewService,
    TimetableEligibilityService,
    TimetableAnalyticsService,
    TimetableReportPdfService,
    TimetableReportExcelService,
  ],
})
export class TimetableModule {}
