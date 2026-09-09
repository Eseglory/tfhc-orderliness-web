import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { isValidRecurrenceRule, describeRecurrence, RecurrenceRule } from '@tfhc/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../../common/rbac/audit.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

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
    const schedules = await this.prisma.serviceSchedule.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
      include: {
        exceptions: { orderBy: { occurrenceStart: 'asc' } },
        _count: { select: { meetings: true } },
      },
    });
    return {
      schedules: schedules.map((s) => ({
        ...s,
        recurrenceSummary: s.recurrenceRule && isValidRecurrenceRule(s.recurrenceRule)
          ? describeRecurrence(s.recurrenceRule as RecurrenceRule)
          : `Weekly on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek]}`,
      })),
      config: await this.configuration(),
    };
  }

  /** Normalise an incoming recurrence rule; default WEEKLY to the schedule weekday. */
  private normaliseRule(rule: unknown, dayOfWeek: number): RecurrenceRule | null {
    if (rule === null || rule === undefined) return null;
    if (!isValidRecurrenceRule(rule)) throw new BadRequestException('Invalid recurrence rule');
    const r = { ...(rule as RecurrenceRule) };
    if (r.freq === 'WEEKLY' && (!r.byWeekday || r.byWeekday.length === 0)) r.byWeekday = [dayOfWeek];
    return r;
  }

  async saveConfiguration(config: RecurringConfig) {
    const validated = this.validateConfiguration(config);
    await this.prisma.systemSetting.upsert({ where: { key: 'recurring_services_config' }, update: { value: JSON.stringify(validated) }, create: { key: 'recurring_services_config', value: JSON.stringify(validated) } });
    return this.generateUpcoming(new Date(), true);
  }

  async saveSchedule(id: string | undefined, dto: any, actorUserId?: string) {
    if (!dto || typeof dto.title !== 'string' || !dto.title.trim() || dto.title.length > 120 || typeof dto.categoryName !== 'string' || !dto.categoryName.trim() || dto.categoryName.length > 80 || !Number.isInteger(dto.dayOfWeek) || dto.dayOfWeek < 0 || dto.dayOfWeek > 6 || !Number.isInteger(dto.startMinutes) || dto.startMinutes < 0 || dto.startMinutes > 1439 || (dto.endMinutes !== null && (!Number.isInteger(dto.endMinutes) || dto.endMinutes <= dto.startMinutes || dto.endMinutes > 1440)) || typeof dto.enabled !== 'boolean') throw new BadRequestException('Valid title, weekday, start time and optional later end time are required');

    const rule = dto.recurrenceRule === undefined ? undefined : this.normaliseRule(dto.recurrenceRule, dto.dayOfWeek);
    const horizonDays = dto.horizonDays === undefined ? undefined : Number(dto.horizonDays);
    if (horizonDays !== undefined && (!Number.isInteger(horizonDays) || horizonDays < 7 || horizonDays > 120))
      throw new BadRequestException('Generation horizon must be 7–120 days');

    const data: Prisma.ServiceScheduleUncheckedUpdateInput = {
      title: dto.title.trim(),
      categoryName: dto.categoryName.trim(),
      dayOfWeek: dto.dayOfWeek,
      startMinutes: dto.startMinutes,
      endMinutes: dto.endMinutes,
      enabled: dto.enabled,
      ...(rule !== undefined ? { recurrenceRule: rule === null ? Prisma.DbNull : (rule as unknown as Prisma.InputJsonValue) } : {}),
      ...(dto.eventTypeKey !== undefined ? { eventTypeKey: dto.eventTypeKey || null } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility === 'RESTRICTED' ? 'RESTRICTED' : 'PUBLIC' } : {}),
      ...(horizonDays !== undefined ? { horizonDays } : {}),
    };

    const saved = id
      ? await this.prisma.serviceSchedule.update({ where: { id }, data })
      : await this.prisma.serviceSchedule.create({ data: { id: randomUUID(), ...(data as Prisma.ServiceScheduleUncheckedCreateInput) } });

    if (actorUserId)
      await this.audit.record({
        actorUserId,
        action: id ? 'SERIES_UPDATED' : 'SERIES_CREATED',
        entity: 'ServiceSchedule',
        entityId: saved.id,
        newData: { title: saved.title, dayOfWeek: saved.dayOfWeek, enabled: saved.enabled },
      });

    await this.generateUpcoming(new Date(), true);
    return saved;
  }

  // -------------------------------------------------------------------------
  // Occurrence-level exceptions (§10 of the spec)
  // -------------------------------------------------------------------------

  private async occurrenceMeeting(scheduleId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.serviceScheduleId !== scheduleId) throw new NotFoundException('Occurrence not found for this series');
    if (meeting.status === 'CLOSED') throw new BadRequestException('A closed occurrence cannot be changed');
    return meeting;
  }

  async cancelOccurrence(scheduleId: string, meetingId: string, reason: string | undefined, actorUserId: string) {
    const meeting = await this.occurrenceMeeting(scheduleId, meetingId);
    const occurrenceStart = meeting.occurrenceStart ?? meeting.startTime;
    await this.prisma.$transaction([
      this.prisma.meeting.update({
        where: { id: meetingId },
        data: { status: 'CANCELLED', scheduleCancelled: true, isException: true, cancelReason: reason?.trim() || 'Cancelled for this date' },
      }),
      this.prisma.serviceScheduleException.upsert({
        where: { scheduleId_occurrenceStart: { scheduleId, occurrenceStart } },
        update: { kind: 'SKIP', reason: reason?.trim() || null, createdById: actorUserId },
        create: { scheduleId, occurrenceStart, kind: 'SKIP', reason: reason?.trim() || null, createdById: actorUserId },
      }),
    ]);
    await this.audit.record({ actorUserId, action: 'SERIES_OCCURRENCE_CANCELLED', entity: 'Meeting', entityId: meetingId, reason: reason?.trim() || null });
    return { cancelled: true };
  }

  async restoreOccurrence(scheduleId: string, meetingId: string, actorUserId: string) {
    const meeting = await this.occurrenceMeeting(scheduleId, meetingId);
    const occurrenceStart = meeting.occurrenceStart ?? meeting.startTime;
    await this.prisma.$transaction([
      this.prisma.serviceScheduleException.deleteMany({ where: { scheduleId, occurrenceStart } }),
      this.prisma.meeting.update({ where: { id: meetingId }, data: { status: 'SCHEDULED', scheduleCancelled: false, isException: false, cancelReason: null } }),
    ]);
    await this.audit.record({ actorUserId, action: 'SERIES_OCCURRENCE_RESTORED', entity: 'Meeting', entityId: meetingId });
    await this.generateUpcoming(new Date(), true);
    return { restored: true };
  }

  /** Mark a meeting as an individually-edited occurrence so series regeneration
   *  leaves it alone. Called by MeetingsService.updateMeeting for series events. */
  async markOccurrenceModified(scheduleId: string, meetingId: string, occurrenceStart: Date, actorUserId?: string) {
    await this.prisma.serviceScheduleException.upsert({
      where: { scheduleId_occurrenceStart: { scheduleId, occurrenceStart } },
      update: { kind: 'MODIFIED', createdById: actorUserId ?? null },
      create: { scheduleId, occurrenceStart, kind: 'MODIFIED', createdById: actorUserId ?? null },
    });
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
    const schedules = await this.prisma.serviceSchedule.findMany({ include: { exceptions: true } });
    const eventTypes = await this.prisma.eventType.findMany({ select: { id: true, key: true } });
    const typeByKey = new Map(eventTypes.map((t) => [t.key, t.id]));
    let created = 0;

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        if (reconcile)
          await this.prisma.meeting.updateMany({
            where: { serviceScheduleId: schedule.id, startTime: { gt: now }, status: 'SCHEDULED', isException: false },
            data: { status: 'CANCELLED', scheduleCancelled: true },
          });
        continue;
      }
      const category = await this.prisma.meetingCategory.upsert({ where: { name: schedule.categoryName }, update: {}, create: { name: schedule.categoryName, basePoints: 5 } });
      const eventTypeId = schedule.eventTypeKey ? typeByKey.get(schedule.eventTypeKey) ?? null : null;
      const skipDates = new Set(schedule.exceptions.filter((e) => e.kind === 'SKIP').map((e) => e.occurrenceStart.getTime()));
      const modifiedDates = new Set(schedule.exceptions.filter((e) => e.kind === 'MODIFIED').map((e) => e.occurrenceStart.getTime()));

      const data = occurrences(schedule, now)
        .filter(({ startTime }) => !skipDates.has(startTime.getTime()))
        .map(({ startTime, endTime }) => {
          const expectedArrivalTime = new Date(startTime.getTime() - config.arrivalMinutesBefore * 60000);
          return {
            serviceScheduleId: schedule.id,
            occurrenceStart: startTime,
            eventTypeId,
            visibility: schedule.visibility,
            title: schedule.title,
            categoryId: category.id,
            meetingDate: startTime,
            startTime,
            endTime,
            expectedArrivalTime,
            attendanceOpenTime: new Date(expectedArrivalTime.getTime() - 30 * 60000),
            attendanceCloseTime: endTime || new Date(startTime.getTime() + 10 * 60000),
            locationName: config.venue.name,
            latitude: config.venue.latitude,
            longitude: config.venue.longitude,
            geofenceRadiusMeters: config.venue.radiusMeters,
            isCompulsory: false,
          };
        });

      if (reconcile) {
        const upcoming = await this.prisma.meeting.findMany({
          where: {
            serviceScheduleId: schedule.id,
            startTime: { gt: now },
            isException: false,
            OR: [{ status: 'SCHEDULED' }, { status: 'CANCELLED', scheduleCancelled: true }],
          },
        });
        for (const meeting of upcoming) {
          const key = (meeting.occurrenceStart ?? meeting.startTime).getTime();
          const desired = data.find((d) => d.occurrenceStart.getTime() === key || d.startTime.getTime() === meeting.startTime.getTime());
          if (desired && !skipDates.has(key)) {
            await this.prisma.meeting.updateMany({
              where: { id: meeting.id, isException: false, OR: [{ status: 'SCHEDULED' }, { status: 'CANCELLED', scheduleCancelled: true }] },
              data: { ...desired, status: 'SCHEDULED', scheduleCancelled: false },
            });
          } else if (meeting.startTime.getTime() < now.getTime() + schedule.horizonDays * 86400000) {
            await this.prisma.meeting.updateMany({
              where: { id: meeting.id, status: 'SCHEDULED', isException: false },
              data: { status: 'CANCELLED', scheduleCancelled: true },
            });
          }
        }
      }

      // Never (re)create a modified occurrence — its edited meeting already exists.
      const toCreate = data.filter((d) => !modifiedDates.has(d.occurrenceStart.getTime()));
      const result = await this.prisma.meeting.createMany({ data: toCreate, skipDuplicates: true });
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
