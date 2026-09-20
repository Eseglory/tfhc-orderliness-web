import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

function isValidPushHost(hostname: string): boolean {
  if (
    hostname === 'fcm.googleapis.com' ||
    hostname === 'android.googleapis.com' ||
    hostname.endsWith('.googleapis.com') ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname.endsWith('.push.services.mozilla.com') ||
    hostname === 'web.push.apple.com' ||
    hostname.endsWith('.push.apple.com') ||
    hostname.endsWith('.notify.windows.com') ||
    hostname.endsWith('.wns.windows.com') ||
    hostname.endsWith('.microsoft.com')
  ) {
    return true;
  }
  return false;
}

function parseBase64UrlOrStandard(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function validateSubscription(value: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const input = value as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    const url = new URL(input?.endpoint);
    if (
      input.endpoint.length > 2048 ||
      url.protocol !== 'https:' ||
      !isValidPushHost(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error();
    }
    const { p256dh, auth } = input.keys || {};
    if (!p256dh || !auth) throw new Error();
    if (!/^[A-Za-z0-9_\-+/]+=*$/.test(p256dh) || !/^[A-Za-z0-9_\-+/]+=*$/.test(auth)) throw new Error();

    const p256dhBuf = parseBase64UrlOrStandard(p256dh);
    const authBuf = parseBase64UrlOrStandard(auth);
    if (p256dhBuf.length !== 65 || p256dhBuf[0] !== 4 || authBuf.length !== 16) throw new Error();

    return { endpoint: url.href, keys: { p256dh, auth } };
  } catch {
    throw new BadRequestException('Unsupported push subscription');
  }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private vapid() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:tfhc-orderliness@eglobalicthub.com';
    if (publicKey && privateKey) {
      return { publicKey, privateKey, subject };
    }
    // Subscription keys must remain stable across restarts and deployments.
    return null;
  }

  configuration() {
    const details = this.vapid();
    return { enabled: Boolean(details), publicKey: details?.publicKey || null };
  }

  async subscribe(userId: string, input: unknown, expiresAt: Date) {
    if (!this.vapid()) throw new ServiceUnavailableException('Push notifications are not configured');
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('Session has expired');
    const subscription = validateSubscription(input);
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
    if (existing && existing.userId !== userId) throw new ConflictException('Remove the previous device subscription before enabling notifications');
    // Device limits are a resource guard; endpoints remain unique in the database.
    if (!existing && (await this.prisma.pushSubscription.count({ where: { userId } })) >= 10) throw new BadRequestException('Maximum of ten notification devices reached');
    try {
      if (existing) {
        await this.prisma.pushSubscription.update({
          where: { id: existing.id },
          data: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            sessionExpiresAt: expiresAt,
            createdAt: new Date(),
          },
        });
      } else {
        await this.prisma.pushSubscription.create({
          data: {
            userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            sessionExpiresAt: expiresAt,
            lastNotifiedAt: new Date(Date.now() - 60000),
          },
        });
      }
    } catch (error: any) {
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

  async sendDirectPush(userId: string, payload: { title: string; body: string; url?: string }) {
    const vapidDetails = this.vapid();
    if (!vapidDetails) return { sent: 0, failed: 0 };
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, sessionExpiresAt: { gt: new Date() } },
    });
    let sent = 0;
    let failed = 0;
    const jsonPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/member/notifications',
    });
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          jsonPayload,
          { vapidDetails, TTL: 300, topic: 'tfhc-activity', timeout: 10000 }
        );
        sent++;
      } catch (err: any) {
        failed++;
        const status = Number(err?.statusCode || 0);
        this.logger.warn(`PushFailed status=${status}`);
        if ([404, 410].includes(status)) {
          await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        }
      }
    }
    return { sent, failed };
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
        where: { nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        take: 100,
        include: { user: { include: { member: { include: { approvedMember: true } } } } },
      });
      // Small batches bound outbound concurrency and database load.
      for (let i = 0; i < subscriptions.length; i += 5) {
        await Promise.all(
          subscriptions.slice(i, i + 5).map(async (subscription) => {
            const { user } = subscription;
            if (
              !user.isActive ||
              (user.member && user.member.status === 'INACTIVE') ||
              (user.member?.approvedMember && user.member.approvedMember.status !== 'ACTIVE') ||
              (user.passwordChangedAt && user.passwordChangedAt > subscription.createdAt) ||
              (user.lastLogoutAt && user.lastLogoutAt > subscription.createdAt)
            ) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
              return;
            }
            const claimed = await this.prisma.pushSubscription.updateMany({
              where: { id: subscription.id, nextAttemptAt: { lte: now } },
              data: { nextAttemptAt: new Date(now.getTime() + 120000) },
            });
            if (!claimed.count) return;

            const memberId = user.member?.id;
            const hasActivity = memberId
              ? await this.prisma.memberNotification.findFirst({
                  where: {
                    memberId,
                    status: 'UNREAD',
                    createdAt: { gt: subscription.lastNotifiedAt, lte: now },
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  select: { id: true, title: true, body: true, data: true },
                })
              : null;
            if (!hasActivity) {
              await this.prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: { nextAttemptAt: now } });
              return;
            }
            try {
              // Generic notification: no personal or business data is sent to push providers.
              await webpush.sendNotification(
                { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
                JSON.stringify({ title: hasActivity.title, body: hasActivity.body,
                  url: (hasActivity.data as { url?: string } | null)?.url || '/member/notifications' }),
                { vapidDetails, TTL: 300, topic: 'tfhc-activity', timeout: 10000 }
              );
              await this.prisma.pushSubscription.updateMany({
                where: { id: subscription.id },
                data: { lastNotifiedAt: now, failures: 0, nextAttemptAt: now },
              });
              this.logger.log('push_delivered');
            } catch (error: any) {
              const status = Number(error?.statusCode || 0);
              if ([404, 410].includes(status)) {
                await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
                this.logger.log('push_subscription_expired');
              } else {
                const failures = subscription.failures + 1;
                await this.prisma.pushSubscription.updateMany({
                  where: { id: subscription.id },
                  data: {
                    failures,
                    nextAttemptAt: new Date(now.getTime() + Math.min(86400000, 60000 * 2 ** Math.min(failures, 11))),
                  },
                });
                this.logger.warn(`push_failed status=${status}`);
              }
            }
          })
        );
      }
    } catch {
      this.logger.error('push_dispatch_failed');
    } finally {
      this.running = false;
    }
  }
}
