import { BadRequestException, ConflictException } from '@nestjs/common';
import { PushService, validateSubscription } from '../src/modules/push/push.service';
import { MembersService } from '../src/modules/members/members.service';
import * as webpush from 'web-push';
jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device',
  keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') },
};
const config = { get: (key: string) => ({ VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'mailto:admin@example.com' })[key] };
function fixture() {
  const prisma = {
    pushSubscription: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(),
      deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    memberNotification: { findFirst: jest.fn().mockResolvedValue({ id: 'notification' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { prisma, service: new PushService(prisma as any, config as any) };
}
function device() {
  return { id: 'device', ...subscription, ...subscription.keys, createdAt: new Date(), failures: 0, lastNotifiedAt: new Date(0),
    user: { isActive: true, email: 'member@example.com', member: { id: 'member', status: 'ACTIVE', approvedMember: { status: 'ACTIVE', normalizedEmail: 'member@example.com' } } } };
}
beforeEach(() => jest.clearAllMocks());
describe('Push security and lifecycle', () => {
  test.each(['http://fcm.googleapis.com/device', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user@fcm.googleapis.com/push', 'https://fcm.googleapis.com:444/push'])('rejects untrusted endpoint %s', endpoint => {
    expect(() => validateSubscription({ ...subscription, endpoint })).toThrow(BadRequestException);
  });
  test('accepts supported provider and rejects malformed keys', () => {
    expect(validateSubscription(subscription)).toEqual(subscription);
    expect(() => validateSubscription({ ...subscription, keys: { auth: 'invalid' } })).toThrow(BadRequestException);
  });
  test('never transfers a device to a different account', async () => {
    const { prisma, service } = fixture(); prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'other' });
    await expect(service.subscribe('user', subscription, new Date(Date.now() + 60000))).rejects.toThrow(ConflictException);
    expect(prisma.pushSubscription.update).not.toHaveBeenCalled();
  });
  test('device status is scoped to the account and session expiry', async () => {
    const { prisma, service } = fixture();
    prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'user', sessionExpiresAt: new Date(Date.now() + 60000) });
    await expect(service.status('other', subscription.endpoint)).resolves.toEqual({ subscribed: false });
    await expect(service.status('user', subscription.endpoint)).resolves.toEqual({ subscribed: true });
    prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'user', sessionExpiresAt: new Date(0) });
    await expect(service.status('user', subscription.endpoint)).resolves.toEqual({ subscribed: false });
  });
  test('unsubscribe is restricted to the authenticated owner', async () => {
    const { prisma, service } = fixture(); await service.unsubscribe('user', subscription.endpoint);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user', endpoint: subscription.endpoint } });
  });
  test('disabled configuration performs no database or outbound work', async () => {
    const { prisma } = fixture(); await new PushService(prisma as any, { get: () => undefined } as any).deliver();
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled(); expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  test('delivery uses a generic payload and records its cursor', async () => {
    const { prisma, service } = fixture(); prisma.pushSubscription.findMany.mockResolvedValue([device()]);
    await service.deliver();
    expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, undefined, expect.objectContaining({ TTL: 300, timeout: 10000 }));
    expect(prisma.pushSubscription.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { lastNotifiedAt: expect.any(Date), failures: 0 } }));
  });
  test('another process holding the delivery lease prevents duplicate sends', async () => {
    const { prisma, service } = fixture(); prisma.pushSubscription.findMany.mockResolvedValue([device()]);
    prisma.pushSubscription.updateMany.mockResolvedValue({ count: 0 }); await service.deliver();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  test('removes expired endpoints without logging provider secrets', async () => {
    const { prisma, service } = fixture(); prisma.pushSubscription.findMany.mockResolvedValue([device()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce({ statusCode: 410, body: 'secret' }); await service.deliver();
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'device' } });
  });
  test('retries provider failure without advancing notification cursor', async () => {
    const { prisma, service } = fixture(); prisma.pushSubscription.findMany.mockResolvedValue([device()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce({ statusCode: 503 }); await service.deliver();
    expect(prisma.pushSubscription.updateMany).toHaveBeenLastCalledWith({ where: { id: 'device' }, data: { failures: 1, nextAttemptAt: expect.any(Date) } });
  });
  test('revoked members cannot receive push', async () => {
    const { prisma, service } = fixture(); const row = device(); row.user.member.status = 'SUSPENDED'; prisma.pushSubscription.findMany.mockResolvedValue([row]);
    await service.deliver(); expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
describe('Offline notification read contract', () => {
  test('explicit IDs scope an idempotent read to the authenticated member', async () => {
    const { prisma } = fixture(); const service = new MembersService(prisma as any, {} as any, {} as any);
    await service.readNotifications('member', ['notification']);
    expect(prisma.memberNotification.updateMany).toHaveBeenCalledWith({ where: { memberId: 'member', status: 'UNREAD', id: { in: ['notification'] } }, data: { status: 'READ', readAt: expect.any(Date) } });
  });
  test('legacy bulk reads remain compatible and an empty list does not mark new activity', async () => {
    const { prisma } = fixture(); const service = new MembersService(prisma as any, {} as any, {} as any);
    await service.readNotifications('member');
    expect(prisma.memberNotification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { memberId: 'member', status: 'UNREAD' } }));
    await service.readNotifications('member', []);
    expect(prisma.memberNotification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { memberId: 'member', status: 'UNREAD', id: { in: [] } } }));
  });
  test('rejects malformed or oversized queues', async () => {
    const { prisma } = fixture(); const service = new MembersService(prisma as any, {} as any, {} as any);
    await expect(service.readNotifications('member', [null] as any)).rejects.toThrow(BadRequestException);
    await expect(service.readNotifications('member', Array(101).fill('id'))).rejects.toThrow(BadRequestException);
    expect(prisma.memberNotification.updateMany).not.toHaveBeenCalled();
  });
});
