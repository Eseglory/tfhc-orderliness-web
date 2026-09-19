import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';

export interface WebhookEventPayload {
  event: string;
  timestamp?: string | Date;
  data?: Record<string, unknown>;
  targetUserId?: string;
  targetMemberId?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async handleGoogleCalendarWebhook(headers: Record<string, string>, body: unknown) {
    const channelId = headers['x-goog-channel-id'] || headers['x-goog-channel-token'];
    const resourceState = headers['x-goog-resource-state'] || 'sync';
    this.logger.log(`Google Calendar webhook received: channelId=${channelId}, state=${resourceState}`);

    return {
      received: true,
      provider: 'google-calendar',
      channelId,
      resourceState,
      timestamp: new Date().toISOString(),
    };
  }

  async handleInboundWebhook(event: WebhookEventPayload, signature?: string) {
    this.logger.log(`Inbound webhook received: event=${event.event}`);

    // If webhook contains a notification or alert payload targeted at a user/member
    if (event.event === 'NOTIFICATION_DISPATCH' || event.event === 'ALERT_DISPATCH') {
      const { targetUserId, targetMemberId, data } = event;
      if (targetMemberId && data?.title && data?.body) {
        await this.prisma.memberNotification.create({
          data: {
            memberId: targetMemberId,
            type: String(data.type || 'SYSTEM_ANNOUNCEMENT'),
            title: String(data.title),
            body: String(data.body),
            data: data.meta ? (data.meta as any) : undefined,
          },
        }).catch((err: any) => {
          this.logger.warn(`Failed to persist webhook notification: ${err?.message}`);
        });
      }

      if (targetUserId && data?.title && data?.body) {
        await this.pushService.sendDirectPush(targetUserId, {
          title: String(data.title),
          body: String(data.body),
          url: typeof data.url === 'string' ? data.url : '/member/notifications',
        });
      }
    }

    return {
      received: true,
      event: event.event,
      status: 'PROCESSED',
      timestamp: new Date().toISOString(),
    };
  }

  async health() {
    const pushConfig = this.pushService.configuration();
    return {
      status: 'healthy',
      webhooksEnabled: true,
      pushConfigured: pushConfig.enabled,
      supportedEndpoints: [
        '/webhooks/google-calendar',
        '/webhooks/inbound',
        '/webhooks/health',
        '/calendar/integrations/google/webhook',
      ],
      timestamp: new Date().toISOString(),
    };
  }
}
