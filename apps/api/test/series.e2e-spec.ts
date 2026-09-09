import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { RbacService } from '../src/common/rbac/rbac.service';
import { RecurringServicesService } from '../src/modules/recurring-services/recurring-services.service';
import { MailService } from '../src/modules/mail/mail.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('Recurring series + occurrence exceptions (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let svc: RecurringServicesService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());
  let token: string;
  let adminId: string;
  let scheduleId: string;
  let prevConfig: { key: string; value: string } | null = null;

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ sendEmail: jest.fn().mockResolvedValue({ messageId: 't' }), verifyConnection: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());
    db = app.get(PrismaService);
    svc = app.get(RecurringServicesService);
    await app.get(RbacService).syncSystemRoles();

    prevConfig = await db.systemSetting.findUnique({ where: { key: 'recurring_services_config' } });
    const admin = await db.user.create({ data: { email: `series-admin-${run}@example.test`, passwordHash: await argon2.hash('x'.repeat(12)), role: 'ADMIN' } });
    adminId = admin.id;
    await db.userAccessRole.create({ data: { userId: admin.id, roleId: (await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } })).id } });
    token = app.get(AuthService).generateToken(admin.id, admin.email, 'ADMIN');

    await http()
      .put('/service-schedules/config')
      .set(auth(token))
      .send({ venue: { name: `Series venue ${run}`, latitude: 6.66, longitude: 3.35, radiusMeters: 100 }, arrivalMinutesBefore: 30, reminderMinutes: [60], recipients: 'all', remindersEnabled: false })
      .expect(200);
  }, 45000);

  afterAll(async () => {
    if (db) {
      if (scheduleId) {
        await db.meeting.deleteMany({ where: { serviceScheduleId: scheduleId } });
        await db.serviceSchedule.delete({ where: { id: scheduleId } }).catch(() => undefined);
      }
      if (prevConfig) await db.systemSetting.update({ where: { key: prevConfig.key }, data: { value: prevConfig.value } });
      else await db.systemSetting.deleteMany({ where: { key: 'recurring_services_config' } });
      if (adminId) {
        await db.auditLog.deleteMany({ where: { actorUserId: adminId } });
        await db.user.delete({ where: { id: adminId } }).catch(() => undefined);
      }
    }
    if (app) await app.close();
  });

  test('a fortnightly recurrence rule generates occurrences two weeks apart', async () => {
    const created = (
      await http()
        .post('/service-schedules')
        .set(auth(token))
        .send({
          title: `Fortnightly prayer ${run}`,
          categoryName: 'Midweek Service',
          dayOfWeek: 3,
          startMinutes: 18 * 60,
          endMinutes: 19 * 60,
          enabled: true,
          eventTypeKey: 'PRAYER',
          recurrenceRule: { freq: 'WEEKLY', interval: 2, byWeekday: [3] },
          horizonDays: 60,
        })
        .expect(201)
    ).body;
    scheduleId = created.id;

    const meetings = await db.meeting.findMany({ where: { serviceScheduleId: scheduleId }, orderBy: { startTime: 'asc' } });
    expect(meetings.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < meetings.length; i++) {
      const gap = meetings[i].startTime.getTime() - meetings[i - 1].startTime.getTime();
      expect(Math.round(gap / 86400000)).toBe(14);
    }
    expect(meetings.every((m) => m.eventTypeId && m.occurrenceStart)).toBe(true);
  });

  test('cancel one occurrence — it stays cancelled through regeneration', async () => {
    const target = (await db.meeting.findFirst({ where: { serviceScheduleId: scheduleId }, orderBy: { startTime: 'asc' } }))!;
    await http().post(`/service-schedules/${scheduleId}/occurrences/${target.id}/cancel`).set(auth(token)).send({ reason: 'facilitator away' }).expect(201);

    let after = await db.meeting.findUnique({ where: { id: target.id } });
    expect(after!.status).toBe('CANCELLED');
    expect(after!.isException).toBe(true);
    expect(await db.serviceScheduleException.count({ where: { scheduleId, kind: 'SKIP' } })).toBe(1);

    await svc.generateUpcoming(new Date(), true);
    after = await db.meeting.findUnique({ where: { id: target.id } });
    expect(after!.status).toBe('CANCELLED');
    // no fresh meeting recreated for that slot
    const sameSlot = await db.meeting.count({ where: { serviceScheduleId: scheduleId, occurrenceStart: after!.occurrenceStart, status: 'SCHEDULED' } });
    expect(sameSlot).toBe(0);

    // restore
    await http().delete(`/service-schedules/${scheduleId}/occurrences/${target.id}/cancel`).set(auth(token)).expect(200);
    after = await db.meeting.findUnique({ where: { id: target.id } });
    expect(after!.status).toBe('SCHEDULED');
    expect(await db.serviceScheduleException.count({ where: { scheduleId } })).toBe(0);
  });

  test('editing one occurrence detaches it from series regeneration', async () => {
    const target = (await db.meeting.findFirst({ where: { serviceScheduleId: scheduleId, status: 'SCHEDULED' }, orderBy: { startTime: 'asc' } }))!;
    await http()
      .patch(`/meetings/${target.id}`)
      .set(auth(token))
      .send({ title: `Special one-off ${run}`, locationName: 'Overflow Hall' })
      .expect(200);

    let edited = await db.meeting.findUnique({ where: { id: target.id } });
    expect(edited!.isException).toBe(true);
    expect(edited!.title).toBe(`Special one-off ${run}`);
    expect(await db.serviceScheduleException.count({ where: { scheduleId, kind: 'MODIFIED' } })).toBe(1);

    // Series-wide edit should NOT clobber the exception occurrence.
    await http()
      .put(`/service-schedules/${scheduleId}`)
      .set(auth(token))
      .send({ title: `Fortnightly prayer renamed ${run}`, categoryName: 'Midweek Service', dayOfWeek: 3, startMinutes: 18 * 60, endMinutes: 19 * 60, enabled: true, recurrenceRule: { freq: 'WEEKLY', interval: 2, byWeekday: [3] } })
      .expect(200);

    edited = await db.meeting.findUnique({ where: { id: target.id } });
    expect(edited!.title).toBe(`Special one-off ${run}`);
    expect(edited!.locationName).toBe('Overflow Hall');

    const others = await db.meeting.findMany({ where: { serviceScheduleId: scheduleId, isException: false, status: 'SCHEDULED' } });
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((m) => m.title === `Fortnightly prayer renamed ${run}`)).toBe(true);
  });

  test('occurrence endpoints are permission-gated', async () => {
    const member = await db.user.create({
      data: { email: `series-mem-${run}@example.test`, passwordHash: await argon2.hash('x'.repeat(12)), role: 'MEMBER', member: { create: { memberCode: `SM-${run}`, firstName: 'S', lastName: 'M', phoneNumber: '08010000009' } } },
      include: { member: true },
    });
    const mtoken = app.get(AuthService).generateToken(member.id, member.email, 'MEMBER', member.member!.id);
    const any = (await db.meeting.findFirst({ where: { serviceScheduleId: scheduleId } }))!;
    await http().post(`/service-schedules/${scheduleId}/occurrences/${any.id}/cancel`).set(auth(mtoken)).send({}).expect(403);
    await http().get('/service-schedules').set(auth(mtoken)).expect(403);
    await db.user.delete({ where: { id: member.id } });
  });
});
