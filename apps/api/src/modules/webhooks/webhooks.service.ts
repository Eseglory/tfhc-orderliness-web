import { ChatGateway } from '../chat/chat.gateway';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';
import * as crypto from 'crypto';

export interface WebhookEventPayload {
  event: string;
  timestamp?: string | Date;
  data?: Record<string, unknown>;
  targetUserId?: string;
  targetMemberId?: string;
  eventId?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
    private readonly gateway: ChatGateway,
  ) {}

  private verifySignature(payload: unknown, signature?: string): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Inbound webhooks are not configured');
    if (!signature) return false;

    try {
      const hmac = crypto.createHmac('sha256', secret);
      const rawString = Buffer.isBuffer(payload) || typeof payload === 'string' ? payload : JSON.stringify(payload);
      hmac.update(rawString);
      const expected = hmac.digest('hex');
      const sigBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
      const expBuf = Buffer.from(expected, 'utf8');
      return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  async handleGoogleCalendarWebhook(headers: Record<string, string>, body: unknown) {
    throw new ServiceUnavailableException('Google Calendar push watches are not configured');
  }

  async handleInboundWebhook(event: WebhookEventPayload, signature?: string, rawBody?: Buffer) {
    if (!this.verifySignature(rawBody ?? event, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (!event || !['NOTIFICATION_DISPATCH', 'ALERT_DISPATCH'].includes(event.event) ||
        typeof event.eventId !== 'string' || !event.eventId.trim() || event.eventId.length > 200 ||
        typeof event.data?.title !== 'string' || !event.data.title.trim() || event.data.title.length > 200 ||
        typeof event.data?.body !== 'string' || !event.data.body.trim() || event.data.body.length > 10000 ||
        (!event.targetMemberId && !event.targetUserId)) {
      throw new BadRequestException('A supported event, eventId, recipient, title and body are required');
    }
    const member = await this.prisma.member.findFirst({ where: {
      ...(event.targetMemberId ? { id: event.targetMemberId } : {}),
      ...(event.targetUserId ? { userId: event.targetUserId } : {}),
      status: 'ACTIVE', user: { isActive: true },
    } });
    if (!member) throw new BadRequestException('Recipient does not match an active member');
    const idempotencyKey = `webhook:${event.event}:${event.eventId}`;
    this.logger.log(`WebhookValidated eventId=${event.eventId}`);
    // Receipt and business effect commit together. Failed transactions return 5xx
    // so the provider can retry; concurrent replays have no duplicate effect.
    const created = await this.prisma.$transaction(async tx => {
      const claim = await tx.communicationDelivery.createMany({ data: [{
        channel: 'PUSH', recipient: member.id, templateKey: `WEBHOOK_${event.event}`,
        idempotencyKey, status: 'PENDING', attemptedAt: new Date(),
      }], skipDuplicates: true });
      if (!claim.count) return false;
      const notification = await tx.memberNotification.create({ data: {
        memberId: member.id, type: 'SYSTEM_ANNOUNCEMENT',
        title: event.data!.title as string, body: event.data!.body as string,
        data: { url: '/member/notifications', eventId: event.eventId! },
      } });
      await tx.communicationDelivery.update({ where: { idempotencyKey }, data: {
        notificationId: notification.id, status: 'SENT',
      } });
      return true;
    });
    this.logger.log(`WebhookProcessed eventId=${event.eventId} duplicate=${!created}`);
    if (created) {
      this.gateway.notifyMember(member.id);
      void this.pushService.deliver();
    }
    return { received: true, event: event.event, status: created ? 'PROCESSED' : 'ALREADY_PROCESSED', duplicate: !created, timestamp: new Date().toISOString() };
  }

  async health() {
    const pushConfig = this.pushService.configuration();
    return {
      status: 'healthy',
      webhooksEnabled: Boolean(this.config.get<string>('WEBHOOK_SECRET')),
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
