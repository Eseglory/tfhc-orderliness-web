import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhooksService } from '../src/modules/webhooks/webhooks.service';
import { ServiceReminderService } from '../src/modules/meetings/service-reminder.service';
import { MailService } from '../src/modules/mail/mail.service';

// Real local PostgreSQL: transactions, uniqueness, recipient selection and rollback.
// Provider delivery is deliberately not claimed by this suite.
describe('Notification reliability (real PostgreSQL)', () => {
  const db = new PrismaService();
  const suffix = randomUUID();
  const config = new ConfigService({ WEBHOOK_SECRET: 'local-webhook-test', TFHC_TIMEZONE: 'Africa/Lagos' });
  const push = { deliver: jest.fn().mockResolvedValue(undefined) };
  const gateway = { notifyMember: jest.fn() };
  const webhook = new WebhooksService(db, push as any, config, gateway as any);
  const reminders = new ServiceReminderService(db, new MailService(config), config, push as any);
  let user: any;
  let unavailable: any;
  let category: any;
  let meeting: any;

  beforeAll(async () => {
    await db.onModuleInit();
    const createUser = (label: string) => db.user.create({ data: {
      email: `${label}-${suffix}@tfhc.org`, passwordHash: 'unused-local-fixture', role: 'MEMBER',
      member: { create: { memberCode: `${label}-${suffix}`, firstName: label, lastName: 'Local test', phoneNumber: '08000000000' } },
    }, include: { member: true } });
    user = await createUser('available');
    unavailable = await createUser('unavailable');
    category = await db.meetingCategory.create({ data: { name: `Reliability ${suffix}` } });
    const startTime = new Date(Date.now() + 24 * 3600000);
    meeting = await db.meeting.create({ data: {
      title: `Local reminder ${suffix}`, categoryId: category.id, meetingDate: startTime, startTime,
      expectedArrivalTime: startTime, attendanceOpenTime: startTime, attendanceCloseTime: new Date(+startTime + 3600000),
      locationName: 'Local test venue', latitude: 0, longitude: 0,
    } });
    await db.eventResponse.createMany({ data: [
      { meetingId: meeting.id, memberId: user.member.id, attending: true },
      { meetingId: meeting.id, memberId: unavailable.member.id, attending: false },
    ] });
  });

  afterAll(async () => {
    if (meeting) await db.meeting.delete({ where: { id: meeting.id } });
    if (category) await db.meetingCategory.delete({ where: { id: category.id } });
    const ids = [user?.member.id, unavailable?.member.id].filter(Boolean);
    await db.communicationDelivery.deleteMany({ where: { OR: [
      { recipient: { in: ids } }, { idempotencyKey: { contains: suffix } },
      ...(meeting ? [{ idempotencyKey: { startsWith: `service-rem-${meeting.id}` } }] : []),
    ] } });
    await db.member.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [user?.id, unavailable?.id].filter(Boolean) } } });
    await db.$disconnect();
  });

  it('verifies raw bytes and rejects forged signatures', async () => {
    const event = { event: 'NOTIFICATION_DISPATCH', eventId: suffix, targetMemberId: user.member.id, data: { title: 'Test', body: 'Local transaction test' } };
    const raw = Buffer.from(JSON.stringify(event, null, 2));
    await expect(webhook.handleInboundWebhook(event, 'invalid', raw)).rejects.toThrow('Invalid webhook signature');
    const signature = createHmac('sha256', 'local-webhook-test').update(raw).digest('hex');
    const results = await Promise.all(Array.from({ length: 4 }, () => webhook.handleInboundWebhook(event, signature, raw)));
    expect(results.filter(r => !r.duplicate)).toHaveLength(1);
    expect(await db.memberNotification.count({ where: { memberId: user.member.id, title: 'Test' } })).toBe(1);
  });

  it('rejects a mismatched user/member target and unconfigured secret', async () => {
    const event = { event: 'ALERT_DISPATCH', eventId: `${suffix}-mismatch`, targetUserId: unavailable.id, targetMemberId: user.member.id, data: { title: 'Private', body: 'Private' } };
    const signature = createHmac('sha256', 'local-webhook-test').update(JSON.stringify(event)).digest('hex');
    await expect(webhook.handleInboundWebhook(event, signature)).rejects.toThrow('Recipient does not match');
    const disabled = new WebhooksService(db, push as any, new ConfigService(), gateway as any);
    await expect(disabled.handleInboundWebhook(event)).rejects.toThrow('not configured');
  });

  it.each(['24h', '12h', '1h'] as const)('claims %s reminders atomically and selects only available members', async window => {
    const results = await Promise.all([
      reminders.dispatchServiceReminderWindow(meeting.id, window, user.member.id),
      reminders.dispatchServiceReminderWindow(meeting.id, window, user.member.id),
    ]);
    expect(results.reduce((sum, r) => sum + r.inAppCreated, 0)).toBe(1);
    const absent = await reminders.dispatchServiceReminderWindow(meeting.id, window, unavailable.member.id);
    expect(absent.targetedMembersCount).toBe(0);
    const key = `service-rem-${meeting.id}-${window}-${user.member.id}-email`;
    const email = await db.communicationDelivery.findUniqueOrThrow({ where: { idempotencyKey: key } });
    // Missing SMTP is a real failure, not a fabricated successful send.
    expect(email.status).toBe('FAILED');
    expect(results.every(r => r.emailSent === 0 && r.pushSent === 0)).toBe(true);
  });

  it('rejects invalid reminder windows', async () => {
    await expect(reminders.dispatchServiceReminderWindow(meeting.id, 'bad' as any)).rejects.toThrow('Invalid reminder window');
  });
});
