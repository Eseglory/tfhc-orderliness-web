import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { occurrences } from './service-schedules';
import { randomUUID } from 'crypto';

export type RecurringConfig = {
  venue: { name: string; latitude: number; longitude: number; radiusMeters: number };
  arrivalMinutesBefore: number;
  reminderMinutes: number[];
  recipients: 'all' | 'committed';
  remindersEnabled: boolean;
};

@Injectable()
export class RecurringServicesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringServicesService.name);
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private async configuration(): Promise<RecurringConfig | null> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'recurring_services_config' } });
    if (!setting) return null;
    return this.validateConfiguration(JSON.parse(setting.value));
  }

  private validateConfiguration(c: RecurringConfig) {
    if (!c || typeof c.remindersEnabled !== 'boolean' || typeof c.venue?.name !== 'string' || !c.venue.name.trim() || c.venue.name.length > 300 || !Number.isFinite(c.venue.latitude) || Math.abs(c.venue.latitude) > 90 || !Number.isFinite(c.venue.longitude) || Math.abs(c.venue.longitude) > 180 || !Number.isFinite(c.venue.radiusMeters) || !(c.venue.radiusMeters > 0) || !Number.isInteger(c.arrivalMinutesBefore) || c.arrivalMinutesBefore < 0 || c.arrivalMinutesBefore > 180 || !Array.isArray(c.reminderMinutes) || c.reminderMinutes.some(m => !Number.isInteger(m) || m <= 0 || m > 10080) || !['all', 'committed'].includes(c.recipients)) {
      throw new BadRequestException('Invalid recurring service configuration');
    }
    return c;
  }

  async list() {
    return { schedules: await this.prisma.serviceSchedule.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] }), config: await this.configuration() };
  }

  async saveConfiguration(config: RecurringConfig) {
    const validated = this.validateConfiguration(config);
    await this.prisma.systemSetting.upsert({ where: { key: 'recurring_services_config' }, update: { value: JSON.stringify(validated) }, create: { key: 'recurring_services_config', value: JSON.stringify(validated) } });
    return this.generateUpcoming(new Date(), true);
  }

  async saveSchedule(id: string | undefined, dto: any) {
    if (!dto || typeof dto.title !== 'string' || !dto.title.trim() || dto.title.length > 120 || typeof dto.categoryName !== 'string' || !dto.categoryName.trim() || dto.categoryName.length > 80 || !Number.isInteger(dto.dayOfWeek) || dto.dayOfWeek < 0 || dto.dayOfWeek > 6 || !Number.isInteger(dto.startMinutes) || dto.startMinutes < 0 || dto.startMinutes > 1439 || (dto.endMinutes !== null && (!Number.isInteger(dto.endMinutes) || dto.endMinutes <= dto.startMinutes || dto.endMinutes > 1440)) || typeof dto.enabled !== 'boolean') throw new BadRequestException('Valid title, weekday, start time and optional later end time are required');
    const data = { title: dto.title.trim(), categoryName: dto.categoryName.trim(), dayOfWeek: dto.dayOfWeek, startMinutes: dto.startMinutes, endMinutes: dto.endMinutes, enabled: dto.enabled };
    const saved = id ? await this.prisma.serviceSchedule.update({ where: { id }, data }) : await this.prisma.serviceSchedule.create({ data: { id: randomUUID(), ...data } });
    await this.generateUpcoming(new Date(), true);
    return saved;
  }

  async onApplicationBootstrap() {
    if (process.env.DISABLE_SCHEDULED_JOBS === 'true') return;
    try { await this.generateUpcoming(); }
    catch { this.logger.error('Recurring service generation failed; check configuration and database migrations'); }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Africa/Lagos', disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async generateUpcoming(now = new Date(), reconcile = false) {
    const config = await this.configuration();
    if (!config) return { created: 0, configured: false };
    const schedules = await this.prisma.serviceSchedule.findMany({});
    let created = 0;
    for (const schedule of schedules) {
      if (!schedule.enabled) {
        if (reconcile) await this.prisma.meeting.updateMany({ where: { serviceScheduleId: schedule.id, startTime: { gt: now }, status: 'SCHEDULED' }, data: { status: 'CANCELLED', scheduleCancelled: true } });
        continue;
      }
      const category = await this.prisma.meetingCategory.upsert({ where: { name: schedule.categoryName }, update: {}, create: { name: schedule.categoryName, basePoints: 5 } });
      const data = occurrences(schedule, now).map(({ startTime, endTime }) => {
        const expectedArrivalTime = new Date(startTime.getTime() - config.arrivalMinutesBefore * 60000);
        return {
          serviceScheduleId: schedule.id, title: schedule.title, categoryId: category.id,
          meetingDate: startTime, startTime, endTime, expectedArrivalTime,
          attendanceOpenTime: new Date(expectedArrivalTime.getTime() - 30 * 60000), attendanceCloseTime: endTime || new Date(startTime.getTime() + 10 * 60000),
          locationName: config.venue.name, latitude: config.venue.latitude, longitude: config.venue.longitude,
          geofenceRadiusMeters: config.venue.radiusMeters, isCompulsory: false,
        };
      });
      if (reconcile) {
        const upcoming = await this.prisma.meeting.findMany({ where: { serviceScheduleId: schedule.id, startTime: { gt: now }, OR: [{ status: 'SCHEDULED' }, { status: 'CANCELLED', scheduleCancelled: true }] } });
        for (const meeting of upcoming) {
          const desired = data.find(d => d.startTime.getTime() === meeting.startTime.getTime());
          if (desired) {
            await this.prisma.meeting.updateMany({ where: { id: meeting.id, OR: [{ status: 'SCHEDULED' }, { status: 'CANCELLED', scheduleCancelled: true }] }, data: { ...desired, status: 'SCHEDULED', scheduleCancelled: false } });
          } else if (meeting.startTime.getTime() < now.getTime() + 28 * 86400000) await this.prisma.meeting.updateMany({ where: { id: meeting.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', scheduleCancelled: true } });
        }
      }
      const result = await this.prisma.meeting.createMany({ data, skipDuplicates: true });
      created += result.count;
    }
    return { created, configured: true };
  }

  @Cron(CronExpression.EVERY_MINUTE, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async sendDueReminders(now = new Date()) {
    const config = await this.configuration();
    if (!config?.remindersEnabled || !config.reminderMinutes.length) return { sent: 0 };
    const offsets = [...new Set(config.reminderMinutes)];
    const meetings = await this.prisma.meeting.findMany({ where: {
      OR: [{ serviceScheduleId: null }, { serviceSchedule: { enabled: true } }], status: { in: ['SCHEDULED', 'ACTIVE'] },
      startTime: { gt: now, lte: new Date(now.getTime() + Math.max(...offsets) * 60000) },
    } });
    let sent = 0;
    for (const meeting of meetings) for (const minutes of offsets) {
      const due = meeting.startTime.getTime() - minutes * 60000;
      // Recover short outages without sending old reminders in a burst after deployment.
      if (due > now.getTime() || due < now.getTime() - 15 * 60000) continue;
      const recipients = await this.prisma.approvedMember.findMany({ where: {
        status: 'ACTIVE', member: { status: 'ACTIVE', ...(config.recipients === 'committed' ? { OR: [{ eventResponses: { some: { meetingId: meeting.id, attending: true } } }, { AND: [{ eventResponses: { none: { meetingId: meeting.id } } }, { serviceCommitments: { some: { meetingId: meeting.id, status: 'COMMITTED' } } }] }] } : {}) },
      }, include: { member: { select: { firstName: true } } } });
      for (const recipient of recipients) {
        const idempotencyKey = `service-reminder:${meeting.id}:${minutes}:${recipient.id}`;
        // Unique insert claims delivery across overlapping jobs and multiple API replicas.
        const claim = await this.prisma.communicationDelivery.createMany({ data: [{
          channel: 'EMAIL', recipient: recipient.normalizedEmail, templateKey: 'SERVICE_REMINDER',
          idempotencyKey, provider: 'SMTP', attemptedAt: now,
        }], skipDuplicates: true });
        if (!claim.count) continue;
        const format = (date: Date) => date.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true });
        try {
          // Recheck cancellation and approval immediately before contacting the provider.
          const active = await this.prisma.meeting.count({ where: { id: meeting.id, status: { in: ['SCHEDULED', 'ACTIVE'] }, startTime: meeting.startTime } });
          const approved = await this.prisma.approvedMember.count({ where: { id: recipient.id, status: 'ACTIVE', member: { status: 'ACTIVE' } } });
          if (!active || !approved) throw new Error('Reminder no longer applicable');
          const notification = await this.prisma.memberNotification.create({ data: {
            memberId: recipient.memberId!, type: 'SERVICE_REMINDER', title: `Reminder: ${meeting.title}`,
            body: `${meeting.title} starts ${format(meeting.startTime)} (Africa/Lagos). Venue: ${meeting.locationName}. Arrival: ${format(meeting.expectedArrivalTime)}.`,
            data: { meetingId: meeting.id }, expiresAt: meeting.attendanceCloseTime,
          } });
          await this.prisma.communicationDelivery.update({ where: { idempotencyKey }, data: { notificationId: notification.id } });
          const result = await this.mail.sendEmail({
            to: recipient.normalizedEmail, subject: `Reminder: ${meeting.title}`,
            text: `Hello ${recipient.member!.firstName},\n\n${meeting.title} starts ${format(meeting.startTime)} (Africa/Lagos).\nVenue: ${meeting.locationName}\nOrderliness arrival time: ${format(meeting.expectedArrivalTime)} (Africa/Lagos).\n\nTFHC Orderliness`,
          });
          await this.prisma.communicationDelivery.update({ where: { idempotencyKey }, data: { status: 'SENT', providerRef: result.messageId } });
          sent++;
        } catch {
          // Do not automatically retry ambiguous SMTP outcomes: delivery may have succeeded.
          await this.prisma.communicationDelivery.update({ where: { idempotencyKey }, data: { status: 'FAILED', failureReason: 'Delivery failed or reminder no longer applicable; review before retrying.' } });
          this.logger.warn('A service reminder failed; see communication delivery records');
        }
      }
    }
    return { sent };
  }
}
