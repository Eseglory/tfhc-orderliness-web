import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { RecurringServicesService } from '../src/modules/recurring-services/recurring-services.service';
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(url)) throw new Error('An isolated local test database is required');
describe('Recurring service lifecycle with PostgreSQL', () => {
  let app: INestApplication, db: PrismaService, token: string, adminId: string, scheduleId: string;
  let previousConfig: any;
  let recipientId: string;
  const sendEmail = jest.fn().mockResolvedValue({ messageId: 'test-only' });
  const run = Date.now().toString();
  beforeAll(async () => {
    process.env.DATABASE_URL = url; process.env.JWT_SECRET = 'e2e-local-only-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue({ sendEmail }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
    app.get(SchedulerRegistry).getCronJobs().forEach(job => job.stop());
    db = app.get(PrismaService);
    previousConfig = await db.systemSetting.findUnique({ where: { key: 'recurring_services_config' } });
    const admin = await db.user.create({ data: { email: `schedule-admin-${run}@example.test`, passwordHash: 'unused', role: 'ADMIN' } }); adminId = admin.id;
    const recipient = await db.member.create({ data: { memberCode: `REMINDER-${run}`, firstName: 'Reminder', lastName: 'Test', phoneNumber: '08012345678', approvedMember: { create: { email: `reminder-${run}@example.test`, normalizedEmail: `reminder-${run}@example.test` } } } }); recipientId = recipient.id;
    token = app.get(AuthService).generateToken(admin.id, admin.email, admin.role);
  }, 30000);
  afterAll(async () => {
    if (db) {
      if (scheduleId) { await db.meeting.deleteMany({ where: { serviceScheduleId: scheduleId } }); await db.serviceSchedule.delete({ where: { id: scheduleId } }); }
      if (previousConfig) await db.systemSetting.update({ where: { key: previousConfig.key }, data: { value: previousConfig.value } });
      else await db.systemSetting.deleteMany({ where: { key: 'recurring_services_config' } });
      await db.communicationDelivery.deleteMany({ where: { recipient: `reminder-${run}@example.test` } });
      if (recipientId) { await db.approvedMember.deleteMany({ where: { memberId: recipientId } }); await db.member.delete({ where: { id: recipientId } }); }
      if (adminId) { await db.auditLog.deleteMany({ where: { actorUserId: adminId } }); await db.user.delete({ where: { id: adminId } }); }
    }
    if (app) await app.close();
  });
  it('protects configuration and generates, reschedules and disables sessions without deleting history', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer()).get('/service-schedules').expect(401);
    await request(app.getHttpServer()).put('/service-schedules/config').set(auth).send({}).expect(400);
    await request(app.getHttpServer()).put('/service-schedules/config').set(auth).send({ venue: { name: 'Test church', latitude: 6.6697906, longitude: 3.3581822, radiusMeters: 100 }, arrivalMinutesBefore: 30, reminderMinutes: [60], recipients: 'all', remindersEnabled: true }).expect(200);
    const schedule = { title: `Children test ${run}`, dayOfWeek: 0, startMinutes: 450, endMinutes: null, categoryName: 'Sunday Service', enabled: true };
    const created = await request(app.getHttpServer()).post('/service-schedules').set(auth).send(schedule).expect(201); scheduleId = created.body.id;
    const service = app.get(RecurringServicesService);
    await service.generateUpcoming();
    const meetings = await db.meeting.findMany({ where: { serviceScheduleId: scheduleId }, orderBy: { startTime: 'asc' } });
    expect(meetings).toHaveLength(4); expect(meetings[0].endTime).toBeNull();
    expect(meetings[0].startTime.getUTCHours()).toBe(6); expect(meetings[0].startTime.getUTCMinutes()).toBe(30);
    const now = new Date(meetings[0].startTime.getTime() - 3600000);
    await service.sendDueReminders(now); const calls = sendEmail.mock.calls.length; expect(calls).toBeGreaterThan(0);
    await service.sendDueReminders(now); expect(sendEmail.mock.calls.length).toBe(calls);
    expect(await db.memberNotification.count({where:{memberId:recipientId,type:'SERVICE_REMINDER',data:{path:['meetingId'],equals:meetings[0].id}}})).toBe(1);
    const custom = await db.meeting.create({data:{title:'Custom reminder test',categoryId:meetings[0].categoryId,meetingDate:meetings[0].meetingDate,startTime:meetings[0].startTime,expectedArrivalTime:meetings[0].expectedArrivalTime,attendanceOpenTime:meetings[0].attendanceOpenTime,attendanceCloseTime:meetings[0].attendanceCloseTime,locationName:'Church',latitude:6.6697906,longitude:3.3581822}});
    sendEmail.mockRejectedValue(new Error('SMTP unavailable'));
    await service.sendDueReminders(now);
    const failed = await db.communicationDelivery.findFirst({where:{recipient:`reminder-${run}@example.test`,idempotencyKey:{contains:custom.id}}});
    expect(failed.status).toBe('FAILED'); expect(failed.notificationId).toBeTruthy();
    expect(await db.memberNotification.count({where:{memberId:recipientId,data:{path:['meetingId'],equals:custom.id}}})).toBe(1);
    const attempted = sendEmail.mock.calls.length;
    await service.sendDueReminders(now); expect(sendEmail.mock.calls.length).toBe(attempted);
    sendEmail.mockResolvedValue({messageId:'test-only'});
    await db.meeting.delete({where:{id:custom.id}});

    await request(app.getHttpServer()).put(`/service-schedules/${scheduleId}`).set(auth).send({ ...schedule, startMinutes: 480, endMinutes: 540 }).expect(200);
    expect(await db.meeting.count({ where: { serviceScheduleId: scheduleId, status: 'CANCELLED' } })).toBe(4);
    expect(await db.meeting.count({ where: { serviceScheduleId: scheduleId, status: 'SCHEDULED' } })).toBe(4);
    await request(app.getHttpServer()).put(`/service-schedules/${scheduleId}`).set(auth).send({ ...schedule, enabled: false }).expect(200);
    expect(await db.meeting.count({ where: { serviceScheduleId: scheduleId, status: 'SCHEDULED' } })).toBe(0);
    expect(await db.meeting.count({ where: { serviceScheduleId: scheduleId } })).toBe(8);
    await request(app.getHttpServer()).put(`/service-schedules/${scheduleId}`).set(auth).send(schedule).expect(200);
    expect(await db.meeting.count({ where: { serviceScheduleId: scheduleId, status: 'SCHEDULED' } })).toBe(4);
  }, 30000);
});
