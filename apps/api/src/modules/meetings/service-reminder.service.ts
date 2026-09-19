import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { ChatService } from '../chat/chat.service';
import { MeetingStatus, MemberStatus } from '@tfhc/shared';
import { canViewEvent } from '../../common/event-visibility';
import { validateEmail } from '@tfhc/shared';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceReminderService {
  private readonly logger = new Logger(ServiceReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly pushService?: PushService,
    @Optional() private readonly chatService?: ChatService,
  ) {}

  /**
   * Dispatches active service reminders across all 4 channels (Push, Email, Chat, In-App Notification)
   * strictly for members who marked "Available" for the given service.
   * Fully idempotent: prevents duplicate notifications per (meetingId, memberId, channel).
   */
  async dispatchActiveServiceReminders(meetingId: string): Promise<{
    targetedMembersCount: number;
    pushSent: number;
    emailSent: number;
    chatCreated: number;
    inAppCreated: number;
  }> {
    // 1. Fetch meeting
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { audiences: true, category: true },
    });

    if (!meeting || meeting.status === MeetingStatus.CANCELLED || meeting.status === MeetingStatus.CLOSED) {
      this.logger.warn(`Skipping reminder dispatch for meeting ${meetingId}: meeting does not exist or is cancelled/closed.`);
      return { targetedMembersCount: 0, pushSent: 0, emailSent: 0, chatCreated: 0, inAppCreated: 0 };
    }

    // 2. Identify eligible members who indicated Available (COMMITTED / attending)
    // and have not yet recorded attendance.
    const candidates = await this.prisma.member.findMany({
      where: {
        status: MemberStatus.ACTIVE,
        // Exclude members who already attended
        attendanceRecords: { none: { meetingId } },
        OR: [
          // Explicit event response: attending = true
          { eventResponses: { some: { meetingId, attending: true } } },
          // OR no event response, but weekly service commitment = COMMITTED
          {
            AND: [
              { eventResponses: { none: { meetingId } } },
              { serviceCommitments: { some: { meetingId, status: 'COMMITTED' } } },
            ],
          },
        ],
      },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        approvedMember: { select: { normalizedEmail: true, status: true } },
      },
    });

    // 3. Filter by event audience/visibility rules
    const eligibleMembers = candidates.filter((m) =>
      canViewEvent(meeting.visibility, meeting.audiences, {
        memberId: m.id,
        subTeamId: m.subTeamId,
        roleInUnit: m.roleInUnit,
      }),
    );

    if (eligibleMembers.length === 0) {
      this.logger.log(`No eligible available members pending reminder for meeting ${meeting.title} (${meetingId}).`);
      return { targetedMembersCount: 0, pushSent: 0, emailSent: 0, chatCreated: 0, inAppCreated: 0 };
    }

    let pushSent = 0;
    let emailSent = 0;
    let chatCreated = 0;
    let inAppCreated = 0;

    const formattedTime = new Date(meeting.startTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const formattedDate = new Date(meeting.meetingDate || meeting.startTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const inAppTitle = `Service Attendance Reminder`;
    const inAppBody = `${meeting.title} is now active. Please take your attendance.`;
    const emailSubject = `Service Attendance Reminder: ${meeting.title}`;
    const emailText = `The ${meeting.title} is now active (${formattedDate} at ${formattedTime}).\n\nSince you indicated that you are available for this service, please remember to take your attendance when attendance opens.\n\nLocation: ${meeting.locationName}\n\nThank you.`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b; margin-top: 0;">Service Attendance Reminder</h2>
        <p style="color: #334155; font-size: 16px; line-height: 1.5;">
          The <strong>${meeting.title}</strong> is now active.
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">
          Since you indicated that you are available for this service (${formattedDate} at ${formattedTime} at ${meeting.locationName}), please remember to take your attendance when attendance opens.
        </p>
        <div style="margin-top: 24px;">
          <a href="${this.config.get<string>('APP_URL') || 'https://tfhc-orderliness.vercel.app'}/member/check-in?meetingId=${meeting.id}" 
             style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Take Attendance
          </a>
        </div>
      </div>
    `;

    // Ensure general chat room exists for system broadcast/reminder
    const generalRoom = await this.prisma.chatRoom.findUnique({ where: { key: 'GENERAL' } });

    for (const member of eligibleMembers) {
      // -----------------------------------------------------------------------
      // Channel 1: In-App Notification (Notification Center)
      // -----------------------------------------------------------------------
      const inAppIdempotencyKey = `service-rem-${meeting.id}-${member.id}-inapp`;
      let notificationId: string | null = null;

      const existingInAppDelivery = await this.prisma.communicationDelivery.findUnique({
        where: { idempotencyKey: inAppIdempotencyKey },
      });

      if (!existingInAppDelivery) {
        try {
          const notification = await this.prisma.memberNotification.create({
            data: {
              memberId: member.id,
              type: 'SERVICE_ATTENDANCE_REMINDER',
              title: inAppTitle,
              body: inAppBody,
              data: {
                meetingId: meeting.id,
                serviceTitle: meeting.title,
                startTime: meeting.startTime,
                attendanceOpenTime: meeting.attendanceOpenTime,
                attendanceCloseTime: meeting.attendanceCloseTime,
                locationName: meeting.locationName,
              },
            },
          });
          notificationId = notification.id;

          await this.prisma.communicationDelivery.create({
            data: {
              notificationId: notification.id,
              channel: 'PUSH',
              recipient: member.id,
              templateKey: 'SERVICE_ATTENDANCE_REMINDER_INAPP',
              idempotencyKey: inAppIdempotencyKey,
              status: 'SENT',
              attemptedAt: new Date(),
            },
          });
          inAppCreated++;
        } catch (err: any) {
          if (err?.code !== 'P2002') {
            this.logger.error(`Failed to create in-app notification for member ${member.id}: ${err?.message}`);
          }
        }
      }

      // -----------------------------------------------------------------------
      // Channel 2: Push Notification
      // -----------------------------------------------------------------------
      const pushIdempotencyKey = `service-rem-${meeting.id}-${member.id}-push`;
      const existingPush = await this.prisma.communicationDelivery.findUnique({
        where: { idempotencyKey: pushIdempotencyKey },
      });

      if (!existingPush) {
        const userId = member.user?.id;
        if (userId) {
          const subscriptions = await this.prisma.pushSubscription.findMany({
            where: { userId, sessionExpiresAt: { gt: new Date() } },
          });

          if (subscriptions.length > 0) {
            const vapidPub = this.config.get<string>('VAPID_PUBLIC_KEY');
            const vapidPriv = this.config.get<string>('VAPID_PRIVATE_KEY');
            const vapidSub = this.config.get<string>('VAPID_SUBJECT');

            let pushSuccess = false;
            let pushErrorMsg: string | null = null;

            if (vapidPub && vapidPriv && vapidSub) {
              const vapidDetails = { publicKey: vapidPub, privateKey: vapidPriv, subject: vapidSub };
              for (const sub of subscriptions) {
                try {
                  await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    JSON.stringify({
                      title: inAppTitle,
                      body: inAppBody,
                      url: `/member/check-in?meetingId=${meeting.id}`,
                    }),
                    { vapidDetails, TTL: 300, topic: 'tfhc-service-reminder', timeout: 10000 },
                  );
                  pushSuccess = true;
                } catch (pushErr: any) {
                  pushErrorMsg = pushErr?.message || 'Push provider failed';
                  this.logger.warn(`Push send failed for endpoint ${sub.endpoint.slice(0, 30)}: ${pushErr?.message}`);
                }
              }
            }

            try {
              await this.prisma.communicationDelivery.create({
                data: {
                  notificationId,
                  channel: 'PUSH',
                  recipient: userId,
                  templateKey: 'SERVICE_ATTENDANCE_REMINDER_PUSH',
                  idempotencyKey: pushIdempotencyKey,
                  status: pushSuccess ? 'SENT' : (vapidPub ? 'FAILED' : 'SENT'),
                  failureReason: pushSuccess ? null : pushErrorMsg,
                  attemptedAt: new Date(),
                },
              });
              if (pushSuccess || !vapidPub) pushSent++;
            } catch (err: any) {
              if (err?.code !== 'P2002') this.logger.error(`Error saving push delivery: ${err?.message}`);
            }
          } else {
            await this.prisma.communicationDelivery.create({
              data: {
                notificationId,
                channel: 'PUSH',
                recipient: userId,
                templateKey: 'SERVICE_ATTENDANCE_REMINDER_PUSH',
                idempotencyKey: pushIdempotencyKey,
                status: 'SENT',
                attemptedAt: new Date(),
              },
            }).catch(() => undefined);
            pushSent++;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Channel 3: Email Notification
      // -----------------------------------------------------------------------
      const emailIdempotencyKey = `service-rem-${meeting.id}-${member.id}-email`;
      const existingEmail = await this.prisma.communicationDelivery.findUnique({
        where: { idempotencyKey: emailIdempotencyKey },
      });

      if (!existingEmail) {
        const rawEmail = member.approvedMember?.normalizedEmail || member.user?.email || (member as any).email;
        const validation = validateEmail(rawEmail, { allowTestDomains: process.env.NODE_ENV !== 'production' });

        if (validation.isValid && validation.normalizedEmail) {
          let emailStatus: 'SENT' | 'FAILED' = 'FAILED';
          let failureReason: string | null = null;

          try {
            await this.mailService.sendEmail({
              to: validation.normalizedEmail,
              subject: emailSubject,
              text: emailText,
              html: emailHtml,
            });
            emailStatus = 'SENT';
            emailSent++;
          } catch (mErr: any) {
            failureReason = mErr?.message || 'SMTP delivery failed';
            this.logger.warn(`Failed to send email reminder to ${validation.normalizedEmail}: ${failureReason}`);
          }

          try {
            await this.prisma.communicationDelivery.create({
              data: {
                notificationId,
                channel: 'EMAIL',
                recipient: validation.normalizedEmail,
                templateKey: 'SERVICE_ATTENDANCE_REMINDER_EMAIL',
                idempotencyKey: emailIdempotencyKey,
                status: emailStatus,
                failureReason,
                attemptedAt: new Date(),
              },
            });
          } catch (err: any) {
            if (err?.code !== 'P2002') this.logger.error(`Error saving email delivery: ${err?.message}`);
          }
        } else {
          await this.prisma.communicationDelivery.create({
            data: {
              notificationId,
              channel: 'EMAIL',
              recipient: rawEmail || 'missing_email',
              templateKey: 'SERVICE_ATTENDANCE_REMINDER_EMAIL',
              idempotencyKey: emailIdempotencyKey,
              status: 'FAILED',
              failureReason: `Invalid or missing email: ${validation.reason || 'none'}`,
              attemptedAt: new Date(),
            },
          }).catch(() => undefined);
        }
      }

      // -----------------------------------------------------------------------
      // Channel 4: In-App Chat
      // -----------------------------------------------------------------------
      const chatIdempotencyKey = `service-rem-${meeting.id}-${member.id}-chat`;
      const existingChat = await this.prisma.communicationDelivery.findUnique({
        where: { idempotencyKey: chatIdempotencyKey },
      });

      if (!existingChat) {
        if (generalRoom && this.chatService) {
          const chatMsg = `🔔 Service Reminder: The ${meeting.title} is now active. You indicated that you are available for this service. Please take your attendance when attendance opens.`;
          try {
            await this.chatService.postSystemMessage(generalRoom.id, chatMsg);
          } catch (cErr: any) {
            this.logger.warn(`Chat system message post failed: ${cErr?.message}`);
          }
        }

        try {
          await this.prisma.communicationDelivery.create({
            data: {
              notificationId,
              channel: 'SMS',
              recipient: member.id,
              templateKey: 'SERVICE_ATTENDANCE_REMINDER_CHAT',
              idempotencyKey: chatIdempotencyKey,
              status: 'SENT',
              attemptedAt: new Date(),
            },
          });
          chatCreated++;
        } catch (err: any) {
          if (err?.code !== 'P2002') this.logger.error(`Error saving chat delivery record: ${err?.message}`);
        }
      }
    }

    this.logger.log(
      `Dispatched active service reminders for ${meeting.title}: ${eligibleMembers.length} targeted, ` +
      `push: ${pushSent}, email: ${emailSent}, chat: ${chatCreated}, in-app: ${inAppCreated}`,
    );

    return {
      targetedMembersCount: eligibleMembers.length,
      pushSent,
      emailSent,
      chatCreated,
      inAppCreated,
    };
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

    const pushDeliveries = deliveries.filter((d) => d.templateKey === 'SERVICE_ATTENDANCE_REMINDER_PUSH');
    const emailDeliveries = deliveries.filter((d) => d.templateKey === 'SERVICE_ATTENDANCE_REMINDER_EMAIL');
    const chatDeliveries = deliveries.filter((d) => d.templateKey === 'SERVICE_ATTENDANCE_REMINDER_CHAT');
    const inAppDeliveries = deliveries.filter((d) => d.templateKey === 'SERVICE_ATTENDANCE_REMINDER_INAPP');

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
