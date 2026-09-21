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
        startTime: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) },
      }, orderBy: { startTime: 'asc' } });
      let remindersSent = 0;
      for (const meeting of meetings) {
        const hours = (meeting.startTime.getTime() - now.getTime()) / 3600000;
        // Never send early. Catch up only the most recent window after downtime.
        const window: ReminderWindow = hours > 12 ? '24h' : hours > 1 ? '12h' : '1h';
        try {
          const result = await this.dispatchServiceReminderWindow(meeting.id, window);
          remindersSent += result.inAppCreated + result.emailSent;
        } catch (error) {
          this.logger.error(`ServiceReminderFailed meeting=${meeting.id} window=${window}`);
        }
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
    const candidates = await this.prisma.member.findMany({ where: {
      status: MemberStatus.ACTIVE, ...(targetMemberId ? { id: targetMemberId } : {}),
      user: { isActive: true },
      attendanceRecords: { none: { meetingId, status: { notIn: ['ABSENT', 'EXCUSED', 'EXEMPT'] } } },
      OR: [
        { eventResponses: { some: { meetingId, attending: true } } },
        { AND: [{ eventResponses: { none: { meetingId } } }, { serviceCommitments: { some: { meetingId, status: 'COMMITTED' } } }] },
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
    const title = window === 'active' ? `Service Attendance Open: ${meeting.title}` : `Service Reminder (${window}): ${meeting.title}`;
    const body = `${meeting.title} starts ${date} (${timezone}). Expected arrival: ${arrival}. Venue: ${meeting.locationName}. Please prepare for your responsibilities.`;
    const path = `/member/check-in?meetingId=${meeting.id}`;
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('APP_WEB_URL') || 'https://tfhc-orderliness-web.vercel.app';

    // Do not expose restricted event details to the general group. A targeted
    // diagnostic trigger must not notify the entire church.
    if (window === '24h' && !targetMemberId && meeting.visibility === 'PUBLIC' && members.length) {
      const room = await this.prisma.chatRoom.findUnique({ where: { key: 'GENERAL' } });
      if (room) {
        const idempotencyKey = `service-rem-${meeting.id}-24h-general-chat`;
        const message = await this.prisma.$transaction(async tx => {
          const claim = await tx.communicationDelivery.createMany({ data: [{ channel: 'PUSH', recipient: room.id,
            templateKey: 'SERVICE_REMINDER_GENERAL_CHAT', idempotencyKey, status: 'PENDING' }], skipDuplicates: true });
          if (!claim.count) return null;
          const message = await tx.chatMessage.create({ data: { roomId: room.id, type: 'SYSTEM',
            body: `${body} Everyone scheduled and available to serve should prepare ahead and be ready for assigned responsibilities.` } });
          await tx.communicationDelivery.update({ where: { idempotencyKey }, data: { status: 'SENT', attemptedAt: new Date() } });
          return message;
        });
        if (message) {
          result.chatCreated++;
          await this.gateway?.fanOut(room.id, { ...message, sender: null, mine: false }, false);
        }
      }
    }
    for (const member of members) {
      const prefix = window === 'active' ? `service-rem-${meeting.id}-${member.id}` : `service-rem-${meeting.id}-${window}-${member.id}`;
      const notification = await this.prisma.$transaction(async tx => {
        const key = `${prefix}-inapp`;
        const claim = await tx.communicationDelivery.createMany({ data: [{ channel: 'PUSH', recipient: member.id,
          templateKey: `SERVICE_REMINDER_${window.toUpperCase()}_INAPP`, idempotencyKey: key, status: 'PENDING' }], skipDuplicates: true });
        if (!claim.count) return null;
        const item = await tx.memberNotification.create({ data: { memberId: member.id,
          type: window === 'active' ? 'SERVICE_ATTENDANCE_REMINDER' : 'SERVICE_REMINDER', title, body,
          data: { meetingId, window, url: path, startTime: meeting.startTime.toISOString() }, expiresAt: meeting.attendanceCloseTime } });
        await tx.communicationDelivery.update({ where: { idempotencyKey: key }, data: {
          notificationId: item.id, status: 'SENT', attemptedAt: new Date(),
        } });
        return item;
      });
      if (notification) {
        result.inAppCreated++;
        this.gateway?.notifyMember(member.id);
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
      }
      const email = validateEmail(member.approvedMember?.normalizedEmail || member.user?.email, { allowTestDomains: process.env.NODE_ENV !== 'production' });
      if (!email.isValid) continue;
      const key = `${prefix}-email`;
      // Claim BEFORE contacting SMTP. Concurrent jobs cannot send twice. An
      // ambiguous SMTP result stays FAILED for review, never blindly resent.
      const claim = await this.prisma.communicationDelivery.createMany({ data: [{ channel: 'EMAIL', recipient: email.normalizedEmail,
        templateKey: `SERVICE_REMINDER_${window.toUpperCase()}_EMAIL`, idempotencyKey: key,
        notificationId: notification?.id, provider: 'SMTP', status: 'PENDING', attemptedAt: new Date() }], skipDuplicates: true });
      if (!claim.count) continue;
      const rendered = renderBrandedEmail({ category: 'reminder', heading: title, recipientName: member.firstName,
        paragraphs: [body, 'You are receiving this reminder because you indicated availability for this service.'],
        details: [
          { label: 'Service', value: meeting.title },
          { label: 'Starts', value: date },
          { label: 'Arrival', value: arrival },
          { label: 'Venue', value: meeting.locationName || 'Church Auditorium' },
        ],
        cta: { label: 'View Service Details', url: `${appUrl}${path}`, tone: 'primary' },
      });
      try {
        const sent = await this.mailService.sendEmail({ to: email.normalizedEmail, subject: title, text: rendered.text, html: rendered.html });
        await this.prisma.communicationDelivery.update({ where: { idempotencyKey: key }, data: { status: 'SENT', providerRef: sent.messageId } });
        result.emailSent++;
      } catch {
        await this.prisma.communicationDelivery.update({ where: { idempotencyKey: key }, data: {
          status: 'FAILED', failureReason: 'SMTP delivery failed; reconcile provider acceptance before retrying.',
        } });
        this.logger.error(`EmailFailed delivery=${key}`);
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
}
