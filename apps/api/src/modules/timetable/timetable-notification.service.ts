import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ChatService } from '../chat/chat.service';
import { OFFICIAL_TIMETABLE_REVIEWERS } from './timetable-review.service';

export interface NotifyReviewersParams {
  versionId: string;
  weekLabel: string;
  isResubmission?: boolean;
  reason?: string;
}

export interface NotifyPublishedParams {
  versionId: string;
  weekLabel: string;
}

export interface NotifyChairGroupParams {
  groupName: string;
  memberIds: string[];
  serviceDate: Date;
}

@Injectable()
export class TimetableNotificationService {
  private readonly logger = new Logger(TimetableNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly chat: ChatService,
  ) {}

  /**
   * Dispatches review notifications to the 4 designated reviewers:
   * 1. Aanu Oyeniran (aanuoyeniran@gmail.com)
   * 2. Daniel Oguamanam (danoguamanam@gmail.com)
   * 3. Paseda Oluwafemi (folashadeogunlade86@gmail.com)
   * 4. Platform Owner / Glory Eseosa (engreseglory@gmail.com)
   *
   * Dispatches:
   * - Email notification with direct link to /admin/timetable
   * - In-app MemberNotification
   * - Executive in-app chat announcement
   */
  async notifyReviewers(params: NotifyReviewersParams): Promise<{
    emailCount: number;
    inAppCount: number;
    recipients: string[];
  }> {
    const platformOwnerEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'engreseglory@gmail.com').toLowerCase();
    
    // Combine 3 official reviewers + platform owner
    const approverEmails = [
      ...OFFICIAL_TIMETABLE_REVIEWERS.map((r) => r.email.toLowerCase()),
      platformOwnerEmail,
      'portal-admin@tfhc.org',
    ];
    const uniqueEmails = Array.from(new Set(approverEmails));

    const webBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tfhc-orderliness-web.vercel.app';
    const reviewUrl = `${webBaseUrl}/admin/timetable`;

    const subject = params.isResubmission
      ? `Action Required: Timetable Revised & Awaiting Re-approval (${params.weekLabel})`
      : `Action Required: Weekly Ushering Timetable Awaiting Review & Approval (${params.weekLabel})`;

    const emailBodyText = `Dear Approver,

The ushering timetable for "${params.weekLabel}" is ready for administrative review.
${params.reason ? `Update note: ${params.reason}\n` : ''}
All 4 designated approvers (Aanu Oyeniran, Daniel Oguamanam, Paseda Oluwafemi, and the Platform Owner) must independently review and record their decision before this timetable can be published to members.

Review Link: ${reviewUrl}

Please log in to inspect the service assignments, supervising ministers, and lead positions.

Thank you,
TFHC Ushering Administration
The Father's House Church`;

    const emailBodyHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 12px;">
        <h2 style="color: #dc2626; margin-bottom: 8px;">The Father's House Church</h2>
        <h3 style="color: #1e293b; margin-top: 0;">Weekly Ushering Timetable Review</h3>
        <p style="color: #475569; font-size: 15px;">
          The timetable for <strong>${params.weekLabel}</strong> has been generated and is awaiting your review and approval.
        </p>
        ${params.reason ? `<p style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px 14px; color: #991b1b; font-size: 13px;"><strong>Modification Reason:</strong> ${params.reason}</p>` : ''}
        <p style="color: #64748b; font-size: 14px;">
          <strong>Publication Rule:</strong> The timetable will become visible to members only after all designated approvers have approved this version.
        </p>
        <div style="margin: 24px 0;">
          <a href="${reviewUrl}" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; display: inline-block;">
            Open Timetable Review Page →
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">
          If the button above does not work, visit: <a href="${reviewUrl}" style="color: #2563eb;">${reviewUrl}</a>
        </p>
      </div>
    `;

    let emailCount = 0;
    let inAppCount = 0;

    for (const email of uniqueEmails) {
      // 1. Dispatch email
      try {
        await this.mail.sendEmail({
          to: email,
          subject,
          text: emailBodyText,
          html: emailBodyHtml,
        });
        emailCount++;
      } catch (err: any) {
        this.logger.warn(`Could not dispatch review email to ${email}: ${err?.message || err}`);
      }

      // 2. Dispatch in-app notification if user has a member profile
      try {
        const user = await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          include: { member: true },
        });

        if (user?.member?.id) {
          await this.prisma.memberNotification.create({
            data: {
              memberId: user.member.id,
              type: 'TIMETABLE_REVIEW_REQUEST',
              title: 'Timetable Awaiting Review & Approval',
              body: `The ushering timetable for ${params.weekLabel} is awaiting your approval decision.`,
              data: {
                versionId: params.versionId,
                url: '/admin/timetable',
              },
            },
          });
          inAppCount++;
        }
      } catch (err: any) {
        this.logger.warn(`Could not create in-app notification for ${email}: ${err?.message || err}`);
      }
    }

    this.logger.log(
      `Review notifications dispatched: ${emailCount} emails sent, ${inAppCount} in-app notifications created.`,
    );

    return {
      emailCount,
      inAppCount,
      recipients: uniqueEmails,
    };
  }

  /**
   * Dispatches publication notifications to all assigned ushers and reviewers once the timetable is published.
   */
  async notifyPublished(params: NotifyPublishedParams): Promise<{
    assignedCount: number;
    notificationsCreated: number;
  }> {
    const version = await this.prisma.timetableVersion.findUnique({
      where: { id: params.versionId },
      include: {
        sessions: {
          include: {
            assignments: {
              include: {
                member: {
                  include: { user: true },
                },
              },
            },
          },
        },
      },
    });

    if (!version) return { assignedCount: 0, notificationsCreated: 0 };

    const memberAssignmentsMap = new Map<string, { member: any; services: string[] }>();

    for (const session of version.sessions) {
      for (const assign of session.assignments) {
        const m = assign.member;
        if (!memberAssignmentsMap.has(m.id)) {
          memberAssignmentsMap.set(m.id, { member: m, services: [] });
        }
        memberAssignmentsMap.get(m.id)!.services.push(`${session.serviceName} (${session.serviceDay})`);
      }
    }

    let notificationsCreated = 0;
    const webBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tfhc-orderliness-web.vercel.app';

    for (const [memberId, info] of memberAssignmentsMap.entries()) {
      const servicesList = info.services.join(', ');
      try {
        // Create in-app notification
        await this.prisma.memberNotification.create({
          data: {
            memberId,
            type: 'TIMETABLE_PUBLISHED',
            title: 'Ushering Timetable Published — Service Duty Confirmed',
            body: `You are scheduled for: ${servicesList} for ${params.weekLabel}. Tap to view full timetable.`,
            data: {
              versionId: params.versionId,
              url: '/member/timetable',
            },
          },
        });
        notificationsCreated++;

        // Send email if user email is available
        const userEmail = info.member.user?.email;
        if (userEmail) {
          await this.mail.sendEmail({
            to: userEmail,
            subject: `Your Ushering Timetable Assignment: ${params.weekLabel}`,
            text: `Dear ${info.member.firstName},\n\nThe weekly ushering timetable for ${params.weekLabel} has been published.\n\nYour Assigned Services:\n${servicesList}\n\nPlease visit ${webBaseUrl}/member/timetable to review your reporting time, position, and supervising minister.\n\nThe Father's House Church`,
          }).catch((e) => this.logger.warn(`Failed to email member ${userEmail}: ${e.message}`));
        }
      } catch (err: any) {
        this.logger.warn(`Failed to notify member ${memberId}: ${err?.message}`);
      }
    }

    this.logger.log(`Publication notifications dispatched to ${notificationsCreated} members.`);
    return {
      assignedCount: memberAssignmentsMap.size,
      notificationsCreated,
    };
  }

  /**
   * Dispatches alerts to the designated Saturday Chair Arrangement group.
   */
  async notifySaturdayChairGroup(params: NotifyChairGroupParams): Promise<{ notifiedCount: number }> {
    let notifiedCount = 0;
    const dateFormatted = params.serviceDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });

    for (const memberId of params.memberIds) {
      try {
        const member = await this.prisma.member.findUnique({
          where: { id: memberId },
          include: { user: true },
        });
        if (!member) continue;

        await this.prisma.memberNotification.create({
          data: {
            memberId,
            type: 'SATURDAY_CHAIR_ARRANGEMENT',
            title: `Saturday Chair Arrangement Duty — ${params.groupName}`,
            body: `Your team (${params.groupName}) is on duty for chair arrangement this Saturday, ${dateFormatted}. Please arrive promptly at 5:00 PM WAT.`,
            data: {
              groupName: params.groupName,
              serviceDate: params.serviceDate.toISOString(),
            },
          },
        });
        notifiedCount++;

        if (member.user?.email) {
          await this.mail.sendEmail({
            to: member.user.email,
            subject: `Seat Arrangement Duty (${params.groupName}): Saturday ${dateFormatted}`,
            text: `Dear ${member.firstName},\n\nYour group (${params.groupName}) is responsible for seat arrangement this Saturday (${dateFormatted}) at 5:00 PM WAT.\n\nThank you for your faithful service in God's sanctuary!\n\nTFHC Ushering Department`,
          }).catch(() => {});
        }
      } catch (err: any) {
        this.logger.warn(`Failed to notify chair arrangement member ${memberId}: ${err.message}`);
      }
    }

    return { notifiedCount };
  }
}
