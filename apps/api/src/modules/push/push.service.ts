import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
export function validateSubscription(value: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const input = value as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    const url = new URL(input?.endpoint);
    if (input.endpoint.length > 2048 || url.protocol !== 'https:' || !PUSH_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw new Error();
    const { p256dh, auth } = input.keys || {};
    if (!/^[A-Za-z0-9_-]{87}=?$/.test(p256dh || '') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth || '') ||
        Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(p256dh, 'base64url')[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) throw new Error();
    return { endpoint: url.href, keys: { p256dh, auth } };
  } catch { throw new BadRequestException('Unsupported push subscription'); }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private vapid() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
  }
  configuration() { const details = this.vapid(); return { enabled: Boolean(details), publicKey: details?.publicKey || null }; }
  async subscribe(userId: string, input: unknown, expiresAt: Date) {
    if (!this.vapid()) throw new ServiceUnavailableException('Push notifications are not configured');
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('Session has expired');
    const subscription = validateSubscription(input);
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
    if (existing && existing.userId !== userId) throw new ConflictException('Remove the previous device subscription before enabling notifications');
    // Device limits are a resource guard; endpoints remain unique in the database.
    if (!existing && await this.prisma.pushSubscription.count({ where: { userId } }) >= 10) throw new BadRequestException('Maximum of ten notification devices reached');
    try {
      if (existing) {
        await this.prisma.pushSubscription.update({ where: { id: existing.id }, data: {
          p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, sessionExpiresAt: expiresAt, createdAt: new Date(),
        } });
      } else {
        await this.prisma.pushSubscription.create({ data: { userId, endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, sessionExpiresAt: expiresAt } });
      }
    } catch (error) {
      if (error?.code === 'P2002') throw new ConflictException('Subscription changed; retry enabling notifications');
      throw error;
    }
    return { subscribed: true };
  }
  async status(userId: string, endpoint: unknown) {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new BadRequestException('A device endpoint is required');
    const row = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    return { subscribed: Boolean(row && row.userId === userId && row.sessionExpiresAt > new Date()) };
  }
  async unsubscribe(userId: string, endpoint: unknown) {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new BadRequestException('A device endpoint is required');
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { subscribed: false };
  }

  @Cron(CronExpression.EVERY_MINUTE, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async deliver() {
    const vapidDetails = this.vapid();
    if (!vapidDetails || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.prisma.pushSubscription.deleteMany({ where: { sessionExpiresAt: { lte: now } } });
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: 'asc' }, take: 100,
        include: { user: { include: { member: { include: { approvedMember: true } } } } },
      });
      // Small batches bound outbound concurrency and database load.
      for (let i = 0; i < subscriptions.length; i += 5) {
        await Promise.all(subscriptions.slice(i, i + 5).map(async subscription => {
          const { user } = subscription;
          if (!user.isActive || user.member?.status !== 'ACTIVE' ||
              user.member.approvedMember?.status !== 'ACTIVE' ||
              user.member.approvedMember.normalizedEmail !== user.email.toLowerCase() ||
              (user.passwordChangedAt && user.passwordChangedAt > subscription.createdAt) ||
              (user.lastLogoutAt && user.lastLogoutAt > subscription.createdAt)) {
            await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } }); return;
          }
          const claimed = await this.prisma.pushSubscription.updateMany({
            where: { id: subscription.id, nextAttemptAt: { lte: now } },
            data: { nextAttemptAt: new Date(now.getTime() + 120000) },
          });
          if (!claimed.count) return;
          const hasActivity = await this.prisma.memberNotification.findFirst({
            where: { memberId: user.member.id, status: 'UNREAD', createdAt: { gt: subscription.lastNotifiedAt, lte: now },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true },
          });
          if (!hasActivity) return;
          try {
            // Generic notification: no personal or business data is sent to push providers.
            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, undefined,
              { vapidDetails, TTL: 300, topic: 'tfhc-activity', timeout: 10000 });
            await this.prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: { lastNotifiedAt: now, failures: 0 } });
            this.logger.log('push_delivered');
          } catch (error) {
            const status = Number(error?.statusCode || 0);
            if ([404, 410].includes(status)) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
              this.logger.log('push_subscription_expired');
            } else {
              const failures = subscription.failures + 1;
              await this.prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: {
                failures, nextAttemptAt: new Date(now.getTime() + Math.min(86400000, 60000 * 2 ** Math.min(failures, 11))),
              } });
              this.logger.warn(`push_failed status=${status}`);
            }
          }
        }));
      }
    } catch { this.logger.error('push_dispatch_failed'); }
    finally { this.running = false; }
  }
}
