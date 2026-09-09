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
import { LookupsService } from '../src/modules/lookups/lookups.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('Event system (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());
  const time = (min: number) => new Date(Date.now() + min * 60000).toISOString();

  let adminToken: string;
  let insiderToken: string; // member in the restricted audience (via sub-team)
  let outsiderToken: string; // member not in the audience
  let categoryId: string;
  let subTeamId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());
    db = app.get(PrismaService);
    await app.get(RbacService).syncSystemRoles();
    await app.get(LookupsService).syncSystemEventTypes();

    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2ePassword!123');

    const admin = await db.user.create({ data: { email: `evadmin-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await db.userAccessRole.create({
      data: { userId: admin.id, roleId: (await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } })).id },
    });
    adminToken = tokens.generateToken(admin.id, admin.email, 'ADMIN');

    const team = await db.subTeam.create({ data: { name: `EvTeam-${run}` } });
    subTeamId = team.id;

    const insider = await db.user.create({
      data: {
        email: `insider-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
        member: { create: { memberCode: `EVI-${run}`, firstName: 'In', lastName: 'Sider', phoneNumber: '08010000001', subTeamId: team.id } },
      },
      include: { member: true },
    });
    insiderToken = tokens.generateToken(insider.id, insider.email, 'MEMBER', insider.member!.id);

    const outsider = await db.user.create({
      data: {
        email: `outsider-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
        member: { create: { memberCode: `EVO-${run}`, firstName: 'Out', lastName: 'Sider', phoneNumber: '08010000002' } },
      },
      include: { member: true },
    });
    outsiderToken = tokens.generateToken(outsider.id, outsider.email, 'MEMBER', outsider.member!.id);

    categoryId = (await db.meetingCategory.create({ data: { name: `EvCat-${run}` } })).id;
  }, 45000);

  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.meeting.deleteMany({ where: { title: { contains: run } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
      await db.subTeam.deleteMany({ where: { name: `EvTeam-${run}` } });
      await db.meetingCategory.deleteMany({ where: { name: `EvCat-${run}` } });
      await db.eventType.deleteMany({ where: { key: { startsWith: `GALA_${run}` } } });
    }
    if (app) await app.close();
  });

  test('default event types are available', async () => {
    const types = (await http().get('/meetings/event-types').set(auth(insiderToken)).expect(200)).body;
    const keys = types.map((t: any) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['SERVICE', 'MEETING', 'WEDDING', 'PRAYER', 'OTHER']));
  });

  test('lookup management is permission-gated and protects system + in-use rows', async () => {
    await http().get('/lookups/event-types').set(auth(insiderToken)).expect(403);

    const list = (await http().get('/lookups/event-types').set(auth(adminToken)).expect(200)).body;
    const service = list.find((r: any) => r.extra.key === 'SERVICE');
    expect(service.isSystem).toBe(true);
    expect(service.deletable).toBe(false);
    await http().delete(`/lookups/event-types/${service.id}`).set(auth(adminToken)).expect(403);

    const created = (
      await http()
        .post('/lookups/event-types')
        .set(auth(adminToken))
        .send({ name: `Gala ${run}`, color: '#123456', defaultCompulsory: false })
        .expect(201)
    ).body;
    expect(created.extra.key).toMatch(new RegExp(`^GALA_${run}`));
    await http().patch(`/lookups/event-types/${created.id}`).set(auth(adminToken)).send({ name: `Gala Night ${run}` }).expect(200);
    await http().delete(`/lookups/event-types/${created.id}`).set(auth(adminToken)).expect(200);
  });

  let publicId: string;
  let restrictedId: string;

  test('create public + restricted events; restricted needs an audience', async () => {
    await http().post('/meetings').set(auth(insiderToken)).send({}).expect(403); // members cannot create

    const base = {
      categoryId,
      meetingDate: time(60),
      startTime: time(60),
      expectedArrivalTime: time(45),
      attendanceOpenTime: time(30),
      attendanceCloseTime: time(120),
      locationName: 'Auditorium',
      latitude: 6.52,
      longitude: 3.37,
    };

    publicId = (await http().post('/meetings').set(auth(adminToken)).send({ ...base, title: `Public svc ${run}` }).expect(201)).body.id;

    await http()
      .post('/meetings')
      .set(auth(adminToken))
      .send({ ...base, title: `Broken restricted ${run}`, visibility: 'RESTRICTED' })
      .expect(400);

    restrictedId = (
      await http()
        .post('/meetings')
        .set(auth(adminToken))
        .send({ ...base, title: `Exec only ${run}`, visibility: 'RESTRICTED', audiences: [{ subTeamId }] })
        .expect(201)
    ).body.id;
  });

  test('restricted events are hidden from members outside the audience', async () => {
    // list
    const insiderList = (await http().get('/meetings').set(auth(insiderToken)).expect(200)).body.map((m: any) => m.id);
    const outsiderList = (await http().get('/meetings').set(auth(outsiderToken)).expect(200)).body.map((m: any) => m.id);
    expect(insiderList).toEqual(expect.arrayContaining([publicId, restrictedId]));
    expect(outsiderList).toContain(publicId);
    expect(outsiderList).not.toContain(restrictedId);

    // detail
    await http().get(`/meetings/${restrictedId}`).set(auth(insiderToken)).expect(200);
    await http().get(`/meetings/${restrictedId}`).set(auth(outsiderToken)).expect(404);

    // calendar
    const cal = (
      await http()
        .get(`/meetings/calendar?from=${encodeURIComponent(time(-10))}&to=${encodeURIComponent(time(1000))}`)
        .set(auth(outsiderToken))
        .expect(200)
    ).body.map((m: any) => m.id);
    expect(cal).toContain(publicId);
    expect(cal).not.toContain(restrictedId);

    // RSVP
    await http().put(`/meetings/${restrictedId}/response`).set(auth(outsiderToken)).send({ attending: true }).expect(403);
    await http().put(`/meetings/${restrictedId}/response`).set(auth(insiderToken)).send({ attending: true }).expect(200);
  });

  test('a member outside the audience cannot check in to a restricted event', async () => {
    await db.meeting.update({ where: { id: restrictedId }, data: { status: 'ACTIVE', attendanceOpenTime: new Date(Date.now() - 60000) } });
    const body = { meetingId: restrictedId, latitude: 6.52, longitude: 3.37, gpsAccuracy: 5 };
    await http().post('/attendance/check-in').set(auth(outsiderToken)).send(body).expect(400);
    await db.meeting.update({ where: { id: restrictedId }, data: { status: 'SCHEDULED' } });
  });

  test('update, duplicate, cancel and archive', async () => {
    await http()
      .patch(`/meetings/${publicId}`)
      .set(auth(adminToken))
      .send({ title: `Public svc renamed ${run}`, notes: 'bring extra chairs' })
      .expect(200);
    await http().patch(`/meetings/${publicId}`).set(auth(insiderToken)).send({ title: 'nope' }).expect(403);

    const dup = (await http().post(`/meetings/${publicId}/duplicate`).set(auth(adminToken)).send({}).expect(201)).body;
    expect(dup.title).toContain('copy');
    expect(new Date(dup.startTime).getTime()).toBeGreaterThan(Date.now());

    await http().post(`/meetings/${dup.id}/cancel`).set(auth(adminToken)).send({ reason: 'venue clash' }).expect(201);
    expect((await http().get(`/meetings/${dup.id}`).set(auth(adminToken)).expect(200)).body.status).toBe('CANCELLED');

    await http().post(`/meetings/${dup.id}/archive`).set(auth(adminToken)).expect(201);
    const listed = (await http().get('/meetings').set(auth(adminToken)).expect(200)).body.map((m: any) => m.id);
    expect(listed).not.toContain(dup.id);
    const withArchived = (await http().get('/meetings?includeArchived=true').set(auth(adminToken)).expect(200)).body.map((m: any) => m.id);
    expect(withArchived).toContain(dup.id);
  });

  test('closed events cannot be edited', async () => {
    await db.meeting.update({ where: { id: publicId }, data: { status: 'CLOSED' } });
    await http().patch(`/meetings/${publicId}`).set(auth(adminToken)).send({ title: 'too late' }).expect(400);
  });

  test('event dashboard aggregates KPIs and breakdowns', async () => {
    await http().get('/meetings/dashboard').set(auth(insiderToken)).expect(403);
    const d = (await http().get('/meetings/dashboard').set(auth(adminToken)).expect(200)).body;
    expect(typeof d.kpis.total).toBe('number');
    expect(d.kpis.total).toBeGreaterThan(0);
    expect(Array.isArray(d.eventsByType)).toBe(true);
    expect(Array.isArray(d.eventsByMonth)).toBe(true);
  });
});
