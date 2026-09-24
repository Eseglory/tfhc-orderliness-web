import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { MeetingStatus, MemberStatus, validateEmail } from '@tfhc/shared';
import { canViewEvent } from '../../common/event-visibility';
import { renderBrandedEmail } from '../mail/templates';
import { ConfigService } from '@nestjs/config';

export type ReminderWindow = '24h' | '12h' | '1h';

@Injectable()
export class ServiceReminderService {
  private readonly logger = new Logger(ServiceReminderService.name);
  private isEvaluating = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly pushService?: PushService,
    @Optional() private readonly chatService?: ChatService,
    @Optional() private readonly gateway?: ChatGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async evaluateUpcomingReminders(now = new Date()): Promise<{ processed: number; remindersSent: number }> {
    if (this.isEvaluating) return { processed: 0, remindersSent: 0 };
    this.isEvaluating = true;
    try {
      const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'recurring_services_config' } });
      if (setting) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed?.remindersEnabled === false) return { processed: 0, remindersSent: 0 };
        } catch {
          // If unparseable, proceed with default enabled
        }
      }
      const meetings = await this.prisma.meeting.findMany({ where: {
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        OR: [{ serviceScheduleId: null }, { serviceSchedule: { enabled: true } }],
        startTime: { gt: now, lte: new Date(now.getTime() + 25 * 3600000) },
      }, orderBy: { startTime: 'asc' } });
      let remindersSent = 0;
      for (const meeting of meetings) {
        const hours = (meeting.startTime.getTime() - now.getTime()) / 3600000;
        const windowsToEvaluate: ReminderWindow[] = [];
        if (hours <= 24.5 && hours > 12.0) {
          windowsToEvaluate.push('24h');
        } else if (hours <= 12.0 && hours > 1.0) {
          windowsToEvaluate.push('12h');
        } else if (hours <= 1.0 && hours > 0.0) {
          windowsToEvaluate.push('1h');
        }
        for (const window of windowsToEvaluate) {
          try {
            const result = await this.dispatchServiceReminderWindow(meeting.id, window);
            remindersSent += result.inAppCreated + result.emailSent;
          } catch (error) {
            this.logger.error(`ServiceReminderFailed meeting=${meeting.id} window=${window}`);
          }
        }
      }

      // Evaluate the dedicated 5-Hour Service Team Reminder grounded in weekly availability
      try {
        const teamReminders = await this.evaluateFiveHourServiceTeamReminders(now);
        remindersSent += teamReminders.remindersSent;
      } catch (error) {
        this.logger.error(`FiveHourServiceTeamReminderEvaluationFailed: ${error}`);
      }

      return { processed: meetings.length, remindersSent };
    } finally { this.isEvaluating = false; }
  }

  async dispatchServiceReminderWindow(meetingId: string, window: ReminderWindow, targetMemberId?: string) {
    if (!['24h', '12h', '1h'].includes(window)) throw new BadRequestException('Invalid reminder window');
    return this.dispatch(meetingId, window, targetMemberId);
  }

  async dispatchActiveServiceReminders(meetingId: string) {
    return this.dispatch(meetingId, 'active');
  }

  private async dispatch(meetingId: string, window: ReminderWindow | 'active', targetMemberId?: string) {
    const result = { targetedMembersCount: 0, pushSent: 0, emailSent: 0, chatCreated: 0, inAppCreated: 0 };
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, include: { audiences: true, category: true } });
    if (!meeting || ['CANCELLED', 'CLOSED'].includes(meeting.status)) return result;
    const isAllMembers = Boolean(meeting.audiences?.some(a => a.scope === 'ALL_MEMBERS') || meeting.serviceScheduleId === 'wednesday-unit-meeting');
    const candidates = await this.prisma.member.findMany({ where: {
      status: MemberStatus.ACTIVE, ...(targetMemberId ? { id: targetMemberId } : {}),
      user: { isActive: true },
      attendanceRecords: { none: { meetingId, status: { notIn: ['ABSENT', 'EXCUSED', 'EXEMPT'] } } },
      OR: [
        { eventResponses: { some: { meetingId, attending: true } } },
        { AND: [{ eventResponses: { none: { meetingId } } }, { serviceCommitments: { some: { meetingId, status: 'COMMITTED' } } }] },
        ...(isAllMembers ? [{ eventResponses: { none: { meetingId, attending: false } } }] : []),
      ],
    }, include: { user: true, approvedMember: true } });
    const members = candidates.filter(m => (!m.approvedMember || m.approvedMember.status === 'ACTIVE') && canViewEvent(meeting.visibility, meeting.audiences, {
      memberId: m.id, subTeamId: m.subTeamId, roleInUnit: m.roleInUnit,
    }));
    result.targetedMembersCount = members.length;
    const timezone = this.config.get<string>('TFHC_TIMEZONE') || 'Africa/Lagos';
    const format = (date: Date) => date.toLocaleString('en-GB', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const date = format(meeting.startTime);
    const arrival = format(meeting.expectedArrivalTime || meeting.startTime);
    const isOnline = Boolean(
      (meeting.address && meeting.address.startsWith('http')) ||
      (meeting.locationName && /online|google meet|zoom|virtual/i.test(meeting.locationName))
    );
    const title = window === 'active' ? `Service Attendance Open: ${meeting.title}` : `Service Reminder (${window}): ${meeting.title}`;
    const body = isOnline
      ? `${meeting.title} (Online Meeting) starts ${date} (${timezone}). Join Google Meet: ${meeting.address || 'Online'}. Expected arrival: ${arrival}.`
      : `${meeting.title} starts ${date} (${timezone}). Expected arrival: ${arrival}. Venue: ${meeting.locationName || 'Main Auditorium'}. Please prepare for your responsibilities.`;
    const path = `/member/check-in?meetingId=${meeting.id}`;
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('APP_WEB_URL') || 'https://tfhc-orderliness-web.vercel.app';

    // Do not expose restricted event details to the general group. A targeted
    // diagnostic trigger must not notify the entire church.
    if (window === '24h' && !targetMemberId && meeting.visibility === 'PUBLIC' && members.length) {
      const room = await this.prisma.chatRoom.findUnique({ where: { key: 'GENERAL' } });
      if (room) {
        const idempotencyKey = `service-rem-${meeting.id}-24h-general-chat`;
        const existingChatDelivery = await this.prisma.communicationDelivery.findUnique({
          where: { idempotencyKey },
        });
        if (!existingChatDelivery || existingChatDelivery.status !== 'SENT') {
          const message = await this.prisma.$transaction(async tx => {
            const claim = await tx.communicationDelivery.createMany({
              skipDuplicates: true,
              data: [{
                channel: 'PUSH',
                recipient: room.id,
                templateKey: 'SERVICE_REMINDER_GENERAL_CHAT',
                idempotencyKey,
                status: 'PENDING',
                attemptedAt: new Date(),
              }],
            });
            if (!claim.count) {
              const retry = await tx.communicationDelivery.updateMany({ where: { idempotencyKey, status: { not: 'SENT' } }, data: { status: 'PENDING', attemptedAt: new Date() } });
              if (!retry.count) return null;
            }
            const generalChatBody = `Service reminder: Tomorrow's service (${meeting.title}) is approaching on ${date} (${timezone}). Expected arrival: ${arrival}. Venue: ${meeting.locationName || 'Church Auditorium'}. Everyone scheduled and available to serve is encouraged to prepare ahead of time and be active and ready for assigned responsibilities.`;
            const msg = await tx.chatMessage.create({
              data: { roomId: room.id, type: 'SYSTEM', body: generalChatBody },
            });
            await tx.communicationDelivery.update({
              where: { idempotencyKey },
              data: { status: 'SENT', attemptedAt: new Date() },
            });
            return msg;
          });
          if (message) {
            result.chatCreated++;
            await this.gateway?.fanOut(room.id, { ...message, sender: null, mine: false }, false);
          }
        }
      }
    }
    for (const member of members) {
      const prefix = window === 'active' ? `service-rem-${meeting.id}-${member.id}` : `service-rem-${meeting.id}-${window}-${member.id}`;
      const inAppKey = `${prefix}-inapp`;
      const existingInApp = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: inAppKey } });

      let notification = null;
      if (!existingInApp || existingInApp.status !== 'SENT') {
        notification = await this.prisma.$transaction(async tx => {
          const claim = await tx.communicationDelivery.createMany({
            skipDuplicates: true,
            data: [{
              channel: 'PUSH',
              recipient: member.id,
              templateKey: `SERVICE_REMINDER_${window.toUpperCase()}_INAPP`,
              idempotencyKey: inAppKey,
              status: 'PENDING',
              attemptedAt: new Date(),
            }],
          });
          if (!claim.count) {
            const retry = await tx.communicationDelivery.updateMany({ where: { idempotencyKey: inAppKey, status: { not: 'SENT' } }, data: { status: 'PENDING', attemptedAt: new Date() } });
            if (!retry.count) return null;
          }
          const item = await tx.memberNotification.create({
            data: {
              memberId: member.id,
              type: window === 'active' ? 'SERVICE_ATTENDANCE_REMINDER' : 'SERVICE_REMINDER',
              title,
              body,
              data: { meetingId, window, url: path, startTime: meeting.startTime.toISOString() },
              expiresAt: meeting.attendanceCloseTime,
            },
          });
          await tx.communicationDelivery.update({
            where: { idempotencyKey: inAppKey },
            data: { notificationId: item.id, status: 'SENT', attemptedAt: new Date() },
          });
          return item;
        });
      }

      if (notification) {
        result.inAppCreated++;
        this.gateway?.notifyMember(member.id);
      }

      // Dispatch push notification to member's devices
      if (this.pushService) {
        try {
          const pushRes = await this.pushService.sendDirectPush(
            { userId: member.userId, memberId: member.id },
            { title, body, url: path }
          );
          if (pushRes?.sent) result.pushSent += pushRes.sent;
        } catch (err) {
          this.logger.warn(`Push reminder failed for member=${member.id}`);
        }
      }

      const email = validateEmail(member.approvedMember?.normalizedEmail || member.user?.email, { allowTestDomains: process.env.NODE_ENV !== 'production' });
      if (!email.isValid) continue;

      const emailKey = `${prefix}-email`;
      const existingEmailDelivery = await this.prisma.communicationDelivery.findUnique({
        where: { idempotencyKey: emailKey },
      });
      if (existingEmailDelivery?.status === 'SENT') {
        continue;
      }

      // Reclaim / prepare delivery record
      await this.prisma.communicationDelivery.upsert({
        where: { idempotencyKey: emailKey },
        create: {
          channel: 'EMAIL',
          recipient: email.normalizedEmail,
          templateKey: `SERVICE_REMINDER_${window.toUpperCase()}_EMAIL`,
          idempotencyKey: emailKey,
          notificationId: notification?.id,
          provider: 'SMTP',
          status: 'PENDING',
          attemptedAt: new Date(),
        },
        update: { status: 'PENDING', attemptedAt: new Date() },
      });

      const toUtcString = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const gCalDates = `${toUtcString(meeting.startTime)}/${toUtcString(meeting.endTime || new Date(meeting.startTime.getTime() + 3600000))}`;
      const isWednesdayUnitMeeting = meeting.serviceScheduleId === 'wednesday-unit-meeting';
      const gCalRecur = isWednesdayUnitMeeting ? '&recur=RRULE:FREQ=WEEKLY;BYDAY=WE' : '';
      const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meeting.title)}&dates=${gCalDates}&ctz=${encodeURIComponent(timezone)}&location=${encodeURIComponent(meeting.address || meeting.locationName || 'Online')}&details=${encodeURIComponent((meeting.description || meeting.title) + (meeting.address ? `\n\nMeeting link: ${meeting.address}` : ''))}${gCalRecur}`;

      const rendered = renderBrandedEmail({
        category: 'reminder',
        heading: title,
        recipientName: member.firstName,
        paragraphs: [
          body,
          isOnline
            ? `Add this recurring meeting to your Google Calendar:\n<a href="${googleCalendarUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 600;">Click here to Add to Google Calendar</a>`
            : 'You are receiving this reminder because you indicated availability for this service.',
        ],
        details: [
          { label: 'Event', value: meeting.title },
          { label: 'Starts', value: date },
          { label: 'Venue / Platform', value: meeting.locationName || 'Church Auditorium' },
          ...(meeting.address && meeting.address.startsWith('http') ? [{ label: 'Meeting Link', value: meeting.address }] : []),
          ...(isWednesdayUnitMeeting ? [{ label: 'Recurrence', value: 'Every Wednesday (Recurring)' }] : []),
        ],
        cta: meeting.address && meeting.address.startsWith('http')
          ? { label: 'Join Google Meet', url: meeting.address, tone: 'primary' }
          : { label: 'View Service Details', url: `${appUrl}${path}`, tone: 'primary' },
      });
      try {
        const sent = await this.mailService.sendEmail({
          to: email.normalizedEmail,
          subject: title,
          text: rendered.text,
          html: rendered.html,
        });
        await this.prisma.communicationDelivery.update({
          where: { idempotencyKey: emailKey },
          data: { status: 'SENT', providerRef: sent.messageId },
        });
        result.emailSent++;
      } catch (err: any) {
        await this.prisma.communicationDelivery.update({
          where: { idempotencyKey: emailKey },
          data: {
            status: 'FAILED',
            failureReason: `SMTP delivery error: ${(err as Error).message}`,
          },
        });
        this.logger.error(`EmailFailed delivery=${emailKey}: ${(err as Error).message}`);
      }
    }
    // Background deliver for any batched subscriptions
    void this.pushService?.deliver();
    this.logger.log(`ServiceReminderProcessed meeting=${meetingId} window=${window} notifications=${result.inAppCreated} emails=${result.emailSent} push=${result.pushSent}`);
    return result;
  }

  /**
   * Retrieves active service reminder for the authenticated member.
   * Only returns an active reminder if:
   * 1. A service is currently ACTIVE (or attendance window is open) and not closed/cancelled.
   * 2. The member indicated "Available" for this exact service.
   * 3. The member has NOT yet recorded attendance.
   * 4. The member is eligible to view the service.
   */
  async getActiveReminderForMember(memberId?: string) {
    if (!memberId) return { hasActiveReminder: false, meeting: null };

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, subTeamId: true, roleInUnit: true, status: true },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      return { hasActiveReminder: false, meeting: null };
    }

    const now = new Date();

    const activeMeetings = await this.prisma.meeting.findMany({
      where: {
        status: { in: [MeetingStatus.ACTIVE, MeetingStatus.SCHEDULED] },
        attendanceOpenTime: { lte: now },
        attendanceCloseTime: { gte: now },
      },
      include: {
        audiences: true,
        category: true,
      },
      orderBy: { startTime: 'asc' },
    });

    for (const meeting of activeMeetings) {
      if (!canViewEvent(meeting.visibility, meeting.audiences, { memberId, subTeamId: member.subTeamId, roleInUnit: member.roleInUnit })) {
        continue;
      }

      const hasAttended = await this.prisma.attendanceRecord.findFirst({
        where: { meetingId: meeting.id, memberId },
      });
      if (hasAttended) continue;

      const eventResponse = await this.prisma.eventResponse.findUnique({
        where: { memberId_meetingId: { memberId, meetingId: meeting.id } },
      });

      let isAvailable = false;
      if (eventResponse) {
        isAvailable = eventResponse.attending === true;
      } else {
        const commitment = await this.prisma.memberServiceCommitment.findFirst({
          where: { meetingId: meeting.id, memberId, status: 'COMMITTED' },
        });
        isAvailable = Boolean(commitment);
      }

      if (isAvailable) {
        return {
          hasActiveReminder: true,
          meeting: {
            id: meeting.id,
            title: meeting.title,
            description: meeting.description,
            meetingDate: meeting.meetingDate,
            startTime: meeting.startTime,
            expectedArrivalTime: meeting.expectedArrivalTime,
            attendanceOpenTime: meeting.attendanceOpenTime,
            attendanceCloseTime: meeting.attendanceCloseTime,
            locationName: meeting.locationName,
            status: meeting.status,
            isAttendanceOpen: meeting.attendanceOpenTime <= now && meeting.attendanceCloseTime >= now,
          },
        };
      }
    }

    return { hasActiveReminder: false, meeting: null };
  }

  /**
   * Retrieves notification and attendance breakdown for administrators.
   */
  async getReminderStats(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { audiences: true },
    });
    if (!meeting) return null;

    const availableMembers = await this.prisma.member.findMany({
      where: {
        status: MemberStatus.ACTIVE,
        OR: [
          { eventResponses: { some: { meetingId, attending: true } } },
          {
            AND: [
              { eventResponses: { none: { meetingId } } },
              { serviceCommitments: { some: { meetingId, status: 'COMMITTED' } } },
            ],
          },
        ],
      },
      select: { id: true, subTeamId: true, roleInUnit: true },
    });

    const eligibleAvailableMembers = availableMembers.filter((m) =>
      canViewEvent(meeting.visibility, meeting.audiences, {
        memberId: m.id,
        subTeamId: m.subTeamId,
        roleInUnit: m.roleInUnit,
      }),
    );

    const deliveries = await this.prisma.communicationDelivery.findMany({
      where: {
        idempotencyKey: { startsWith: `service-rem-${meetingId}-` },
      },
    });

    const pushDeliveries = deliveries.filter((d) => d.templateKey.includes('PUSH'));
    const emailDeliveries = deliveries.filter((d) => d.templateKey.includes('EMAIL'));
    const chatDeliveries = deliveries.filter((d) => d.templateKey.includes('CHAT'));
    const inAppDeliveries = deliveries.filter((d) => d.templateKey.includes('INAPP'));

    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: { meetingId },
      select: { memberId: true, status: true },
    });

    const attendedMemberIds = new Set(
      attendanceRecords
        .filter((r) => !['ABSENT', 'EXCUSED', 'EXEMPT'].includes(r.status))
        .map((r) => r.memberId),
    );

    const takenCount = eligibleAvailableMembers.filter((m) => attendedMemberIds.has(m.id)).length;
    const notYetTakenCount = eligibleAvailableMembers.length - takenCount;

    return {
      meetingId,
      meetingTitle: meeting.title,
      totalAvailableMembers: eligibleAvailableMembers.length,
      reminder: {
        push: {
          sent: pushDeliveries.filter((d) => d.status === 'SENT').length,
          failed: pushDeliveries.filter((d) => d.status === 'FAILED').length,
        },
        email: {
          sent: emailDeliveries.filter((d) => d.status === 'SENT').length,
          failed: emailDeliveries.filter((d) => d.status === 'FAILED').length,
        },
        chat: {
          created: chatDeliveries.length,
        },
        inApp: {
          created: inAppDeliveries.length,
        },
      },
      attendance: {
        taken: takenCount,
        notYetTaken: notYetTakenCount,
      },
    };
  }

  /**
   * Immediately notify the appointed Supervising Minister via In-App notification,
   * Branded Email, and post an update message to the General Chat Group.
   * Completely idempotent and protected against duplicate dispatches.
   */
  async notifySupervisingMinisterAssigned(meetingId: string, ministerMemberId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        supervisingMinister: {
          include: {
            user: true,
            approvedMember: true,
            subTeam: true,
          },
        },
      },
    });

    if (!meeting || !meeting.supervisingMinister || meeting.supervisingMinister.id !== ministerMemberId) {
      return { inAppSent: false, emailSent: false, chatSent: false };
    }

    const minister = meeting.supervisingMinister;
    const timezone = this.config.get<string>('TFHC_TIMEZONE') || 'Africa/Lagos';
    const dateStr = meeting.startTime.toLocaleDateString('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = meeting.startTime.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
    const ministerName = (minister.preferredName?.trim() || `${minister.firstName} ${minister.lastName}`).trim();
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('APP_WEB_URL') || 'https://tfhc-orderliness-web.vercel.app';
    const path = `/member/meetings/${meeting.id}`;

    let inAppSent = false;
    let emailSent = false;
    let chatSent = false;

    // 1. In-App Notification (Idempotent)
    const inAppKey = `minister-assignment-${meeting.id}-${minister.id}-inapp`;
    const existingInApp = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: inAppKey } });
    if (!existingInApp || existingInApp.status !== 'SENT') {
      try {
        await this.prisma.$transaction(async (tx) => {
          const claim = await tx.communicationDelivery.createMany({
            skipDuplicates: true,
            data: [{
              channel: 'PUSH',
              recipient: minister.id,
              templateKey: 'SERVICE_ASSIGNMENT_INAPP',
              idempotencyKey: inAppKey,
              status: 'PENDING',
              attemptedAt: new Date(),
            }],
          });
          if (!claim.count) {
            const retry = await tx.communicationDelivery.updateMany({
              where: { idempotencyKey: inAppKey, status: { not: 'SENT' } },
              data: { status: 'PENDING', attemptedAt: new Date() },
            });
            if (!retry.count) return;
          }

          const notification = await tx.memberNotification.create({
            data: {
              memberId: minister.id,
              type: 'SERVICE_ASSIGNMENT',
              title: 'Service Assignment',
              body: `You have been assigned as the Supervising Minister for the ${meeting.title}.\n\nDate: ${dateStr}\nTime: ${timeStr} (${timezone})\n\nPlease review the service details and prepare accordingly.`,
              data: { meetingId: meeting.id, url: path },
              expiresAt: meeting.attendanceCloseTime,
            },
          });

          await tx.communicationDelivery.update({
            where: { idempotencyKey: inAppKey },
            data: { notificationId: notification.id, status: 'SENT', attemptedAt: new Date() },
          });
        });
        inAppSent = true;
        this.gateway?.notifyMember(minister.id);
      } catch (err) {
        this.logger.error(`Supervising minister in-app notification failed for member=${minister.id}: ${err}`);
      }
    }

    // 2. Email Notification (Idempotent)
    const rawEmail = minister.approvedMember?.normalizedEmail || minister.user?.email;
    const validated = validateEmail(rawEmail, { allowTestDomains: process.env.NODE_ENV !== 'production' });
    if (validated.isValid) {
      const emailKey = `minister-assignment-${meeting.id}-${minister.id}-email`;
      const existingEmail = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: emailKey } });
      if (!existingEmail || existingEmail.status !== 'SENT') {
        try {
          await this.prisma.communicationDelivery.upsert({
            where: { idempotencyKey: emailKey },
            create: {
              channel: 'EMAIL',
              recipient: validated.normalizedEmail,
              templateKey: 'SERVICE_ASSIGNMENT_EMAIL',
              idempotencyKey: emailKey,
              provider: 'SMTP',
              status: 'PENDING',
              attemptedAt: new Date(),
            },
            update: { status: 'PENDING', attemptedAt: new Date() },
          });

          const emailContent = renderBrandedEmail({
            category: 'notification',
            heading: 'Service Assignment: Supervising Minister',
            recipientName: minister.firstName,
            paragraphs: [
              `You have been assigned as the Supervising Minister for the <strong>${meeting.title}</strong>.`,
              `Please review the service details and prepare to coordinate with the service team.`,
            ],
            details: [
              { label: 'Service', value: meeting.title },
              { label: 'Date', value: dateStr },
              { label: 'Time', value: `${timeStr} (${timezone})` },
              { label: 'Location', value: meeting.address || meeting.locationName || 'Online' },
              { label: 'Role', value: 'Supervising Minister' },
            ],
            cta: {
              label: 'View Gathering Details',
              url: `${appUrl}${path}`,
            },
          });

          await this.mailService.sendEmail({
            to: validated.normalizedEmail,
            subject: emailContent.subject || `Service Assignment: Supervising Minister - ${meeting.title}`,
            text: emailContent.text || `You have been assigned as the Supervising Minister for ${meeting.title}.\nDate: ${dateStr}\nTime: ${timeStr} (${timezone})\nPlease review the service details and prepare accordingly.`,
            html: emailContent.html,
          });

          await this.prisma.communicationDelivery.update({
            where: { idempotencyKey: emailKey },
            data: { status: 'SENT', attemptedAt: new Date() },
          });
          emailSent = true;
        } catch (err) {
          this.logger.error(`Supervising minister email failed for member=${minister.id}: ${err}`);
        }
      }
    }

    // 3. General Chat Group Announcement (Idempotent)
    const room = await this.prisma.chatRoom.findUnique({ where: { key: 'GENERAL' } });
    if (room && meeting.visibility === 'PUBLIC') {
      const chatKey = `minister-assignment-${meeting.id}-${minister.id}-general-chat`;
      const existingChat = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: chatKey } });
      if (!existingChat || existingChat.status !== 'SENT') {
        const chatBody = `📋 Service Assignment Update\n\nThe Supervising Minister for *${meeting.title}* has been assigned.\n\n👤 *Supervising Minister:* ${ministerName}\n📅 *Date:* ${dateStr}\n🕐 *Time:* ${timeStr}\n\nThank you for serving and coordinating the service.`;

        try {
          const msg = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.communicationDelivery.createMany({
              skipDuplicates: true,
              data: [{
                channel: 'PUSH',
                recipient: room.id,
                templateKey: 'SERVICE_ASSIGNMENT_GENERAL_CHAT',
                idempotencyKey: chatKey,
                status: 'PENDING',
                attemptedAt: new Date(),
              }],
            });
            if (!claim.count) {
              const retry = await tx.communicationDelivery.updateMany({
                where: { idempotencyKey: chatKey, status: { not: 'SENT' } },
                data: { status: 'PENDING', attemptedAt: new Date() },
              });
              if (!retry.count) return null;
            }

            const chatMsg = await tx.chatMessage.create({
              data: { roomId: room.id, type: 'SYSTEM', body: chatBody },
            });

            await tx.communicationDelivery.update({
              where: { idempotencyKey: chatKey },
              data: { status: 'SENT', attemptedAt: new Date() },
            });

            return chatMsg;
          });

          if (msg) {
            chatSent = true;
            if (this.chatService) {
              try {
                (this.chatService as any)['bufferRepo']?.seedLegacyMessages([
                  { ...msg, attachmentMeta: null, createdAt: msg.createdAt.toISOString(), editedAt: null, deletedAt: null },
                ]);
              } catch {}
            }
            await this.gateway?.fanOut(room.id, { ...msg, sender: null, mine: false }, false);
          }
        } catch (err) {
          this.logger.error(`Supervising minister general chat update failed for meeting=${meeting.id}: ${err}`);
        }
      }
    }

    return { inAppSent, emailSent, chatSent };
  }

  /**
   * Evaluates all upcoming meetings approximately 5 hours away and triggers the
   * dedicated 5-Hour Service Team Reminder grounded in Weekly Availability data.
   */
  async evaluateFiveHourServiceTeamReminders(now = new Date()): Promise<{ processed: number; remindersSent: number }> {
    // Window: between 4.0 and 5.2 hours in advance (robust against delayed cron ticks)
    const windowStart = new Date(now.getTime() + 4.0 * 3600000);
    const windowEnd = new Date(now.getTime() + 5.2 * 3600000);

    const meetings = await this.prisma.meeting.findMany({
      where: {
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        archivedAt: null,
        OR: [{ serviceScheduleId: null }, { serviceSchedule: { enabled: true } }],
        startTime: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    let remindersSent = 0;
    for (const meeting of meetings) {
      try {
        const result = await this.dispatchFiveHourServiceTeamReminder(meeting.id, now);
        remindersSent += result.chatCreated + result.inAppCreated + result.emailSent;
      } catch (err) {
        this.logger.error(`FiveHourServiceTeamReminderFailed meeting=${meeting.id}: ${err}`);
      }
    }

    return { processed: meetings.length, remindersSent };
  }

  /**
   * Dispatches the 5-Hour Service Team Reminder:
   * 1. Retrieves actual committed members from Weekly Availability for this specific meeting.
   * 2. Retrieves the assigned Supervising Minister (handling unassigned gracefully).
   * 3. Posts the beautiful reminder to the existing General Chat Group.
   * 4. Sends personalized in-app notifications and branded emails to the service team & minister.
   * 5. Strict idempotent delivery using persistent CommunicationDelivery records.
   * 6. DOES NOT create any attendance records.
   */
  async dispatchFiveHourServiceTeamReminder(meetingId: string, now = new Date()) {
    const result = { chatCreated: 0, inAppCreated: 0, emailSent: 0, availableMembersCount: 0 };

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        supervisingMinister: {
          include: {
            user: true,
            approvedMember: true,
            subTeam: true,
          },
        },
      },
    });

    if (!meeting || ['CANCELLED', 'CLOSED'].includes(meeting.status)) {
      return result;
    }

    // 1. Retrieve members who submitted availability for THIS specific service
    const commitments = await this.prisma.memberServiceCommitment.findMany({
      where: {
        meetingId: meeting.id,
        status: 'COMMITTED',
        member: { status: MemberStatus.ACTIVE },
      },
      include: {
        member: {
          include: {
            user: true,
            approvedMember: true,
            subTeam: true,
          },
        },
      },
      orderBy: [
        { member: { firstName: 'asc' } },
        { member: { lastName: 'asc' } },
      ],
    });

    const availableMembers = commitments.map((c) => c.member);
    result.availableMembersCount = availableMembers.length;

    const timezone = this.config.get<string>('TFHC_TIMEZONE') || 'Africa/Lagos';
    const dateStr = meeting.startTime.toLocaleDateString('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = meeting.startTime.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    });

    const minister = meeting.supervisingMinister;
    const ministerName = minister
      ? (minister.preferredName?.trim() || `${minister.firstName} ${minister.lastName}`).trim()
      : null;

    const teamListFormatted = availableMembers.length > 0
      ? availableMembers.map((m) => `🙌 ${(m.preferredName?.trim() || m.firstName).trim()}`).join('\n')
      : 'No members have indicated availability for this service yet.';

    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('APP_WEB_URL') || 'https://tfhc-orderliness-web.vercel.app';
    const path = `/member/meetings/${meeting.id}`;

    // 2. Post 5-Hour Reminder to General Chat Group (Idempotent)
    const room = await this.prisma.chatRoom.findUnique({ where: { key: 'GENERAL' } });
    if (room && meeting.visibility === 'PUBLIC') {
      const chatKey = `service-team-rem-5h-${meeting.id}-general-chat`;
      const existingChat = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: chatKey } });
      if (!existingChat || existingChat.status !== 'SENT') {
        const generalChatBody = [
          '🔔 *5-HOUR SERVICE REMINDER*',
          '',
          `*${meeting.title}*`,
          `🕐 ${timeStr}`,
          '',
          '*Supervising Minister*',
          `👤 ${ministerName || 'Not yet assigned'}`,
          '',
          '*Those Available to Serve*',
          teamListFormatted,
          '',
          'Thank you for making yourselves available.',
          "Let's prepare and serve together. 🙏",
          '',
          'See you at the service!',
        ].join('\n');

        try {
          const msg = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.communicationDelivery.createMany({
              skipDuplicates: true,
              data: [{
                channel: 'PUSH',
                recipient: room.id,
                templateKey: 'SERVICE_TEAM_REMINDER_5H_CHAT',
                idempotencyKey: chatKey,
                status: 'PENDING',
                attemptedAt: new Date(),
              }],
            });
            if (!claim.count) {
              const retry = await tx.communicationDelivery.updateMany({
                where: { idempotencyKey: chatKey, status: { not: 'SENT' } },
                data: { status: 'PENDING', attemptedAt: new Date() },
              });
              if (!retry.count) return null;
            }

            const chatMsg = await tx.chatMessage.create({
              data: { roomId: room.id, type: 'SYSTEM', body: generalChatBody },
            });

            await tx.communicationDelivery.update({
              where: { idempotencyKey: chatKey },
              data: { status: 'SENT', attemptedAt: new Date() },
            });

            return chatMsg;
          });

          if (msg) {
            result.chatCreated++;
            if (this.chatService) {
              try {
                (this.chatService as any)['bufferRepo']?.seedLegacyMessages([
                  { ...msg, attachmentMeta: null, createdAt: msg.createdAt.toISOString(), editedAt: null, deletedAt: null },
                ]);
              } catch {}
            }
            await this.gateway?.fanOut(room.id, { ...msg, sender: null, mine: false }, false);
          }
        } catch (err) {
          this.logger.error(`5-Hour general chat reminder failed for meeting=${meeting.id}: ${err}`);
        }
      }
    }

    // 3. Compile Participants: Supervising Minister + Available Service Team Members
    interface ParticipantTarget {
      member: typeof availableMembers[0];
      role: string;
      isMinister: boolean;
    }

    const participantsMap = new Map<string, ParticipantTarget>();

    if (minister && minister.status === MemberStatus.ACTIVE) {
      participantsMap.set(minister.id, {
        member: minister as any,
        role: 'Supervising Minister',
        isMinister: true,
      });
    }

    for (const mem of availableMembers) {
      if (!participantsMap.has(mem.id)) {
        participantsMap.set(mem.id, {
          member: mem,
          role: 'Service Team Member',
          isMinister: false,
        });
      }
    }

    const participants = Array.from(participantsMap.values());

    // 4. Send targeted In-App Notification and Branded Email to each participant
    for (const participant of participants) {
      const member = participant.member;
      const inAppKey = `service-team-rem-5h-${meeting.id}-${member.id}-inapp`;
      const existingInApp = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: inAppKey } });

      if (!existingInApp || existingInApp.status !== 'SENT') {
        try {
          await this.prisma.$transaction(async (tx) => {
            const claim = await tx.communicationDelivery.createMany({
              skipDuplicates: true,
              data: [{
                channel: 'PUSH',
                recipient: member.id,
                templateKey: 'SERVICE_TEAM_REMINDER_5H_INAPP',
                idempotencyKey: inAppKey,
                status: 'PENDING',
                attemptedAt: new Date(),
              }],
            });
            if (!claim.count) {
              const retry = await tx.communicationDelivery.updateMany({
                where: { idempotencyKey: inAppKey, status: { not: 'SENT' } },
                data: { status: 'PENDING', attemptedAt: new Date() },
              });
              if (!retry.count) return;
            }

            const item = await tx.memberNotification.create({
              data: {
                memberId: member.id,
                type: 'SERVICE_TEAM_REMINDER',
                title: `5-Hour Service Reminder: ${meeting.title}`,
                body: `${meeting.title} is coming up in 5 hours at ${timeStr} (${timezone}).\nYour role: ${participant.role}.\nSupervising Minister: ${ministerName || 'Not yet assigned'}.\nThank you for preparing and serving together!`,
                data: { meetingId: meeting.id, role: participant.role, url: path },
                expiresAt: meeting.attendanceCloseTime,
              },
            });

            await tx.communicationDelivery.update({
              where: { idempotencyKey: inAppKey },
              data: { notificationId: item.id, status: 'SENT', attemptedAt: new Date() },
            });
          });
          result.inAppCreated++;
          this.gateway?.notifyMember(member.id);
        } catch (err) {
          this.logger.error(`5-Hour in-app reminder failed for member=${member.id}: ${err}`);
        }
      }

      // Email dispatch
      const rawEmail = member.approvedMember?.normalizedEmail || member.user?.email;
      const validated = validateEmail(rawEmail, { allowTestDomains: process.env.NODE_ENV !== 'production' });
      if (validated.isValid) {
        const emailKey = `service-team-rem-5h-${meeting.id}-${member.id}-email`;
        const existingEmail = await this.prisma.communicationDelivery.findUnique({ where: { idempotencyKey: emailKey } });
        if (!existingEmail || existingEmail.status !== 'SENT') {
          try {
            await this.prisma.communicationDelivery.upsert({
              where: { idempotencyKey: emailKey },
              create: {
                channel: 'EMAIL',
                recipient: validated.normalizedEmail,
                templateKey: 'SERVICE_TEAM_REMINDER_5H_EMAIL',
                idempotencyKey: emailKey,
                provider: 'SMTP',
                status: 'PENDING',
                attemptedAt: new Date(),
              },
              update: { status: 'PENDING', attemptedAt: new Date() },
            });

            const emailContent = renderBrandedEmail({
              category: 'reminder',
              heading: `5-Hour Service Reminder: ${meeting.title}`,
              recipientName: member.firstName,
              paragraphs: [
                `<strong>${meeting.title}</strong> is coming up in 5 hours at ${timeStr} (${timezone}).`,
                `You are receiving this reminder as part of the service team coordinating today's gathering.`,
                `Supervising Minister: <strong>${ministerName || 'Not yet assigned'}</strong>`,
              ],
              details: [
                { label: 'Service', value: meeting.title },
                { label: 'Date', value: dateStr },
                { label: 'Time', value: `${timeStr} (${timezone})` },
                { label: 'Venue', value: meeting.address || meeting.locationName || 'Online' },
                { label: 'Your Role', value: participant.role },
              ],
              cta: {
                label: 'View Gathering Details',
                url: `${appUrl}${path}`,
              },
            });

            await this.mailService.sendEmail({
              to: validated.normalizedEmail,
              subject: emailContent.subject || `5-Hour Service Team Reminder: ${meeting.title}`,
              text: emailContent.text || `${meeting.title} starts in 5 hours at ${timeStr} (${timezone}).\nRole: ${participant.role}\nSupervising Minister: ${ministerName || 'Not yet assigned'}\nPlease review details in the app.`,
              html: emailContent.html,
            });

            await this.prisma.communicationDelivery.update({
              where: { idempotencyKey: emailKey },
              data: { status: 'SENT', attemptedAt: new Date() },
            });
            result.emailSent++;
          } catch (err) {
            this.logger.error(`5-Hour email reminder failed for member=${member.id}: ${err}`);
          }
        }
      }
    }

    return result;
  }
}
