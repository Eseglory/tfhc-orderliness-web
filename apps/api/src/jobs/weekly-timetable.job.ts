import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TimetableService } from '../modules/timetable/timetable.service';
import { TimetableReviewService } from '../modules/timetable/timetable-review.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WeeklyTimetableJob {
  private readonly logger = new Logger(WeeklyTimetableJob.name);

  constructor(
    private readonly timetableService: TimetableService,
    private readonly reviewService: TimetableReviewService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async process() {
    const now = new Date();
    const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: string) => parts.find((x) => x.type === type)?.value;

    // Trigger automated generation every Saturday at 18:00 WAT (6:00 PM)
    if (value('weekday') === 'Sat' && value('hour') === '18' && value('minute') === '00') {
      try {
        const result = await this.timetableService.runScheduledSaturdayGeneration();
        if ((result as any)?.skipped) {
          this.logger.log(`Scheduled Saturday generation skipped: ${(result as any).reason}`);
          return;
        }

        this.logger.log('Successfully completed automated Saturday timetable generation');

        // Notify designated reviewers
        const reviewers = await this.reviewService.getReviewers();
        for (const rev of reviewers) {
          if (rev.user.member?.id) {
            await this.prisma.memberNotification.create({
              data: {
                memberId: rev.user.member.id,
                type: 'TIMETABLE_REVIEW_REQUIRED',
                title: 'Timetable Ready for Review',
                body: 'The weekly ushering timetable has been generated and is ready for your inspection and review.',
                data: { periodId: (result as any)?.period?.id, versionId: (result as any)?.version?.id },
              },
            }).catch(() => undefined);
          }
        }
      } catch (err: any) {
        this.logger.error(`Automated Saturday timetable generation failed: ${err.message}`, err.stack);
      }
    }
  }

  /**
   * Directly triggers automated Saturday timetable generation for testing or administrative dispatch.
   */
  async handleSaturdayGeneration() {
    return this.timetableService.runScheduledSaturdayGeneration();
  }
}
