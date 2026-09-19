import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AvailabilityService } from '../modules/availability/availability.service';

@Injectable()
export class WeeklyAvailabilityJob {
  private readonly logger = new Logger(WeeklyAvailabilityJob.name);

  constructor(private readonly availability: AvailabilityService) {}

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

    // Availability opens every Monday at 12:00 AM (00:00) WAT
    if (value('weekday') === 'Mon' && value('hour') === '00' && value('minute') === '00') {
      await this.availability.openCurrentWeek(now);
      this.logger.log('Opened weekly availability cycle for current week');
    }

    const finalized = await this.availability.finalizeDue(now);
    if (finalized) {
      this.logger.log(`Finalized ${finalized} weekly availability cycle(s)`);
    }
  }
}

