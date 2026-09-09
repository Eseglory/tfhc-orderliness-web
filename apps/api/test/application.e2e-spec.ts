import * as crypto from 'crypto';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AbsenceProcessingJob } from '../src/jobs/absence-processing.job';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { AuthService } from '../src/modules/auth/auth.service';

// sharp 0.35 is a CommonJS module whose export is the callable factory.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import('sharp').default = require('sharp');

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');
const suite = describe;
suite('Application HTTP integration (real PostgreSQL)', () => {
  let app: INestApplication, db: PrismaService, admin: string, member: string, memberId: string, meeting: any, category: any;
  const run = Date.now().toString();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const time = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    app.get(SchedulerRegistry).getCronJobs().forEach(job => job.stop());
    db = app.get(PrismaService);
    await app.get(AvailabilityService).openCurrentWeek();
    const passwordHash = await argon2.hash('E2ePassword!123');
    const a = await db.user.create({ data: { email: `admin-${run}@example.test`, passwordHash, role: 'ADMIN' } });
    const m = await db.user.create({ data: { email: `member-${run}@example.test`, passwordHash, role: 'MEMBER', member: { create: { memberCode: `E2E-${run}`, firstName: 'Test', lastName: 'Member', phoneNumber: '08012345678' } } }, include: { member: true } });
    memberId = m.member.id;
    admin = app.get(AuthService).generateToken(a.id, a.email, a.role);
    member = app.get(AuthService).generateToken(m.id, m.email, m.role, memberId);
    category = await db.meetingCategory.create({ data: { name: `E2E-${run}` } });
    meeting = await db.meeting.create({ data: { title: 'E2E Meeting', categoryId: category.id, meetingDate: time(0), startTime: time(5), expectedArrivalTime: time(0), attendanceOpenTime: time(-30), attendanceCloseTime: time(60), locationName: 'Test Venue', latitude: 6.5, longitude: 3.3, status: 'ACTIVE', qrSecret: 'test-only-secret' } });
  }, 30000);
  afterAll(async () => { if (app) await app.close(); });
  test('custom event creation and member responses persist with privacy and deadline enforcement', async () => {
    const payload = { title: 'Custom outreach', categoryId: category.id, meetingDate: time(120), startTime: time(120), expectedArrivalTime: time(90), attendanceOpenTime: time(90), attendanceCloseTime: time(180), locationName: 'Church', latitude: 6.6697906, longitude: 3.3581822, isCompulsory: false };
    await request(app.getHttpServer()).post('/meetings').set(auth(member)).send(payload).expect(403);
    const event = (await request(app.getHttpServer()).post('/meetings').set(auth(admin)).send(payload).expect(201)).body;
    const endpoint = `/meetings/${event.id}/response`;
    await request(app.getHttpServer()).put(endpoint).send({ attending: true }).expect(401);
    await request(app.getHttpServer()).put(endpoint).set(auth(member)).send({ attending: 'yes' }).expect(400);
    await request(app.getHttpServer()).put(endpoint).set(auth(member)).send({ attending: true }).expect(200);
    await request(app.getHttpServer()).put(endpoint).set(auth(member)).send({ attending: false }).expect(200);
    const own = (await request(app.getHttpServer()).get(`/meetings/${event.id}`).set(auth(member)).expect(200)).body;
    expect(own.eventResponses).toHaveLength(1);
    expect(own.eventResponses[0].attending).toBe(false);
    expect(own.eventResponses[0].member).toBeUndefined();
    const view = (await request(app.getHttpServer()).get(`/meetings/${event.id}`).set(auth(admin)).expect(200)).body;
    expect(view.eventResponses[0].member.firstName).toBe('Test');
    expect(await db.attendanceRecord.count({ where: { meetingId: event.id } })).toBe(0);
    await db.meeting.update({ where: { id: event.id }, data: { startTime: time(-1) } });
    await request(app.getHttpServer()).put(endpoint).set(auth(member)).send({ attending: true }).expect(400);
  });
  test('analytics aggregates completed services and enforces reporting access', async () => {
    await request(app.getHttpServer()).get('/reports/analytics').set(auth(member)).expect(403);
    await request(app.getHttpServer()).get('/reports/analytics?days=2').set(auth(admin)).expect(400);
    const fixture = await db.meeting.create({data:{title:'Analytics fixture',categoryId:category.id,meetingDate:time(-90),startTime:time(-60),expectedArrivalTime:time(-70),attendanceOpenTime:time(-80),attendanceCloseTime:time(-10),locationName:'Church',latitude:6.5,longitude:3.3,status:'CLOSED'}});
    await db.attendanceRecord.create({data:{meetingId:fixture.id,memberId,expectedArrivalTime:time(-70),status:'GRACE_PERIOD',pointsEarned:0}});
    const data = (await request(app.getHttpServer()).get('/reports/analytics?days=7').set(auth(admin)).expect(200)).body;
    expect(data.services.find((r:any)=>r.id===fixture.id)).toMatchObject({attended:1,punctual:0,absent:0});
    expect(data.services.some((r:any)=>r.id===meeting.id)).toBe(false);
    expect(data.totals.attended).toBe(data.services.reduce((n:number,r:any)=>n+r.attended,0));
    await db.attendanceRecord.deleteMany({where:{meetingId:fixture.id}});
    await db.meeting.delete({where:{id:fixture.id}});
  });
  test('admin policy persists and validates configurable weights', async () => {
    const previous = await db.systemSetting.findUnique({where:{key:'unit_policy'}});
    try {
      await request(app.getHttpServer()).put('/reports/settings').set(auth(member)).send({}).expect(403);
      await request(app.getHttpServer()).put('/reports/settings').set(auth(admin)).send({attendanceWeight:0.8,punctualityWeight:0.8}).expect(400);
      await request(app.getHttpServer()).put('/reports/settings').set(auth(admin)).send({attendanceWeight:0.7,punctualityWeight:0.3,latePoints:4}).expect(200);
      const saved = (await request(app.getHttpServer()).get('/reports/settings').set(auth(admin)).expect(200)).body;
      expect(saved.attendanceWeight).toBe(0.7); expect(saved.latePoints).toBe(4);
      const performance = (await request(app.getHttpServer()).get('/scoring/my-performance').set(auth(member)).expect(200)).body;
      expect(performance.scoringWeights.attendance).toBe(0.7);
    } finally {
      if(previous) await db.systemSetting.update({where:{key:'unit_policy'},data:{value:previous.value}});
      else await db.systemSetting.deleteMany({where:{key:'unit_policy'}});
    }
  });
  test('profile picture upload enforces content, size, ownership, persistence and removal', async () => {
    const image = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#2563eb' } }).png().toBuffer();
    await request(app.getHttpServer()).post('/members/me/photo').attach('photo', image, 'avatar.png').expect(401);
    await request(app.getHttpServer()).post(`/members/${memberId}/photo`).set(auth(member)).attach('photo', image, 'avatar.png').expect(403);
    await request(app.getHttpServer()).post('/members/me/photo').set(auth(member)).attach('photo', Buffer.from('<svg></svg>'), { filename: 'avatar.png', contentType: 'image/png' }).expect(400);
    await request(app.getHttpServer()).post('/members/me/photo').set(auth(member)).attach('photo', Buffer.alloc(2 * 1024 * 1024 + 1), 'large.png').expect(413);
    await request(app.getHttpServer()).post('/members/me/photo').set(auth(member)).expect(400);
    // Exact limit is accepted, while the stored image is decoded and normalized.
    const exactLimit = Buffer.concat([image, Buffer.alloc(2 * 1024 * 1024 - image.length)]);
    const saved = await request(app.getHttpServer()).post('/members/me/photo').set(auth(member)).attach('photo', exactLimit, 'avatar.png').expect(201);
    expect(saved.body.profilePhotoUrl).toMatch(/^data:image\/webp;base64,/);
    const profile = await request(app.getHttpServer()).get('/members/me/profile').set(auth(member)).expect(200);
    expect(profile.body.profilePhotoUrl).toBe(saved.body.profilePhotoUrl);
    await request(app.getHttpServer()).post(`/members/${memberId}/photo`).set(auth(admin)).attach('photo', image, 'replacement.png').expect(201);
    await request(app.getHttpServer()).delete('/members/me/photo').set(auth(member)).expect(200);
    expect((await db.member.findUniqueOrThrow({ where: { id: memberId } })).profilePhotoUrl).toBeNull();
  });
  test('admin edits personal details and deactivates/reactivates without losing history', async () => {
    await request(app.getHttpServer()).put(`/members/${memberId}`).set(auth(admin)).send({ profession: 'Engineer', birthday: '03-14', address: 'Test address', status: 'INACTIVE' }).expect(200);
    await request(app.getHttpServer()).get('/members/me/profile').set(auth(member)).expect(401);
    expect((await db.member.findUniqueOrThrow({ where: { id: memberId } })).profession).toBe('Engineer');
    await request(app.getHttpServer()).put(`/members/${memberId}`).set(auth(admin)).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).put('/members/me/profile').set(auth(member)).send({ email: 'changed@example.test' }).expect(400);
    const profile = await request(app.getHttpServer()).get('/members/me/profile').set(auth(member)).expect(200);
    expect(profile.body.birthday).toBe('03-14');
  });
  test('admin login and bad credentials', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ email: `admin-${run}@example.test`, password: 'E2ePassword!123' }).expect(201);
    await request(app.getHttpServer()).post('/auth/login').send({ email: `admin-${run}@example.test`, password: 'wrong' }).expect(401);
  });
  test('malformed login is a client error', async () => { await request(app.getHttpServer()).post('/auth/login').send({}).expect(400); });
  test('members must use Google login', async () => { await request(app.getHttpServer()).post('/auth/login').send({ email: `member-${run}@example.test`, password: 'E2ePassword!123' }).expect(403); });
  test.each(['/members','/reports/dashboard','/reports/export/excel','/alerts','/excuses/pending','/excuses/corrections/pending'])('protects %s', async path => {
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(path).set(auth(member)).expect(403);
    await request(app.getHttpServer()).get(path).set(auth(admin)).expect(200);
  });
  test.each(['/auth/me','/members/me/profile','/meetings','/meetings/active','/meetings/categories','/attendance/my-history','/scoring/my-performance','/scoring/leaderboard','/availability/current'])('member reads %s', async path => { await request(app.getHttpServer()).get(path).set(auth(member)).expect(200); });
  test('meeting responses never disclose QR signing secrets', async () => {
    for (const path of ['/meetings', '/meetings/active', `/meetings/${meeting.id}`]) {
      const response = await request(app.getHttpServer()).get(path).set(auth(member)).expect(200);
      expect(JSON.stringify(response.body)).not.toContain('qrSecret');
    }
  });
  test('members cannot read another member performance profile', async () => {
    await request(app.getHttpServer()).get('/scoring/member/another-member').set(auth(member)).expect(403);
    await request(app.getHttpServer()).get(`/scoring/member/${memberId}`).set(auth(member)).expect(200);
    await request(app.getHttpServer()).get(`/scoring/member/${memberId}`).set(auth(admin)).expect(200);
  });
  test('member meeting details do not disclose other members attendance or contact details', async () => {
    const result = await request(app.getHttpServer()).get(`/meetings/${meeting.id}`).set(auth(member)).expect(200);
    expect(result.body).not.toHaveProperty('attendanceRecords');
    const privileged = await request(app.getHttpServer()).get(`/meetings/${meeting.id}`).set(auth(admin)).expect(200);
    expect(privileged.body).toHaveProperty('attendanceRecords');
  });
  test('member cannot generate QR or activate a meeting', async () => {
    await request(app.getHttpServer()).get(`/meetings/${meeting.id}/qr-code`).set(auth(member)).expect(404);
    await request(app.getHttpServer()).put(`/meetings/${meeting.id}/status`).set(auth(member)).send({status:'ACTIVE'}).expect(403);
  });
  test('profile update without celebrations works', async () => { await request(app.getHttpServer()).put('/members/me/profile').set(auth(member)).send({preferredName:'Tester'}).expect(200); });
  test('members response excludes password hashes', async () => { const r = await request(app.getHttpServer()).get('/members').set(auth(admin)).expect(200); expect(JSON.stringify(r.body)).not.toContain('passwordHash'); });
  test('invalid meeting dates are rejected', async () => { await request(app.getHttpServer()).post('/meetings').set(auth(admin)).send({ ...meeting, startTime: 'invalid' }).expect(400); });
  test('admin without member cannot read all member history', async () => { await request(app.getHttpServer()).get('/attendance/my-history').set(auth(admin)).expect(403); });
  test('location-only check-in rejects outside/inaccurate GPS and duplicate attendance', async () => {
    const body = { meetingId: meeting.id, latitude: 6.5, longitude: 3.3, gpsAccuracy: 5 };
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ ...body, latitude: 0 }).expect(400);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ ...body, gpsAccuracy: -1 }).expect(400);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ ...body, gpsAccuracy: 150 }).expect(400);
    const checked = await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ ...body, memberId: 'impersonated' }).expect(201);
    expect(checked.body.memberId).toBe(memberId);
    expect(checked.body.method).toBe('SYSTEM_GEO');
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send(body).expect(409);
  });
  test('outside attendance window returns 400', async () => {
    await db.attendanceRecord.deleteMany({where:{memberId,meetingId:meeting.id}});
    await db.meeting.update({where:{id:meeting.id},data:{attendanceOpenTime:time(20),qrSecret:null}});
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:meeting.id,latitude:6.5,longitude:3.3}).expect(400);
    await db.meeting.update({where:{id:meeting.id},data:{attendanceOpenTime:time(-30)}});
  });
  test('absence requests validate input, remain private and reject without excusing attendance', async () => {
    await request(app.getHttpServer()).post('/excuses').set(auth(member)).send({meetingId:meeting.id,reason:' ',category:'work'}).expect(400);
    const event = await db.meeting.create({data:{title:'Absence rejection',categoryId:category.id,meetingDate:time(0),startTime:time(30),expectedArrivalTime:time(0),attendanceOpenTime:time(0),attendanceCloseTime:time(60),locationName:'Church',latitude:6.5,longitude:3.3}});
    const sent = await request(app.getHttpServer()).post('/excuses').set(auth(member)).send({meetingId:event.id,reason:'Work conflict',category:'work'}).expect(201);
    const endpoint = `/excuses/${sent.body.id}/review`;
    await request(app.getHttpServer()).put(endpoint).set(auth(member)).send({status:'APPROVED'}).expect(403);
    await request(app.getHttpServer()).put(endpoint).set(auth(admin)).send({status:'PENDING'}).expect(400);
    await request(app.getHttpServer()).put(endpoint).set(auth(admin)).send({status:'REJECTED',reviewNote:'Please contact your leader'}).expect(200);
    await request(app.getHttpServer()).put(endpoint).set(auth(admin)).send({status:'APPROVED'}).expect(400);
    const mine = await request(app.getHttpServer()).get('/excuses/mine').set(auth(member)).expect(200);
    expect(mine.body.every((r:any)=>r.memberId===memberId)).toBe(true);
    expect(mine.body.find((r:any)=>r.id===sent.body.id).reviewNote).toBe('Please contact your leader');
    expect(await db.memberNotification.count({where:{memberId,type:'ABSENCE_DECISION',data:{path:['excuseId'],equals:sent.body.id}}})).toBe(1);
    expect(await db.attendanceRecord.count({where:{meetingId:event.id}})).toBe(0);
  });
  test('excuse approval and duplicate attendance with null arrival', async () => {
    const r = await request(app.getHttpServer()).post('/excuses').set(auth(member)).send({meetingId:meeting.id,reason:'Test absence',category:'PERSONAL'}).expect(201);
    await request(app.getHttpServer()).put(`/excuses/${r.body.id}/review`).set(auth(admin)).send({status:'APPROVED'}).expect(200);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:meeting.id,latitude:6.5,longitude:3.3}).expect(409);
  });
  test('correction approval recalculates points and writes audit', async () => {
    const r = await request(app.getHttpServer()).post('/excuses/corrections').set(auth(member)).send({meetingId:meeting.id,reason:'Actually attended',requestedStatus:'EARLY'}).expect(201);
    await request(app.getHttpServer()).put(`/excuses/corrections/${r.body.id}/review`).set(auth(admin)).send({status:'APPROVED'}).expect(200);
    const record = await db.attendanceRecord.findUnique({where:{memberId_meetingId:{memberId,meetingId:meeting.id}}});
    expect(record.pointsEarned).toBeGreaterThan(0);
    expect(await db.auditLog.count({where:{entityId:record.id}})).toBeGreaterThan(0);
  });
  test('member creation, search and update', async () => {
    const team = await request(app.getHttpServer()).post('/members/sub-teams').set(auth(admin)).send({name:`Team-${run}`}).expect(201);
    const created = await request(app.getHttpServer()).post('/members').set(auth(admin)).send({firstName:'Created',lastName:run,phoneNumber:'08012345678',subTeamId:team.body.id}).expect(201);
    const found = await request(app.getHttpServer()).get(`/members?search=${run}`).set(auth(admin)).expect(200);
    expect(found.body.some((m:any)=>m.id===created.body.id)).toBe(true);
    await request(app.getHttpServer()).put(`/members/${created.body.id}`).set(auth(admin)).send({status:'INACTIVE'}).expect(200);
  });
  test('member updates cannot change account roles or ownership through nested writes', async () => {
    await request(app.getHttpServer()).put(`/members/${memberId}`).set(auth(admin)).send({
      preferredName: 'Unapproved field', userId: null, user: { update: { role: 'ADMIN' } },
    }).expect(200);
    const saved = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { user: true } });
    expect(saved.user.role).toBe('MEMBER');
    expect(saved.userId).toBeTruthy();
    expect(saved.preferredName).toBe('Unapproved field'); // Personal details are now editable; account ownership remains protected.
  });
  test('invalid member data returns client errors', async () => {
    await request(app.getHttpServer()).post('/members').set(auth(admin)).send({}).expect(400);
    await request(app.getHttpServer()).put(`/members/${memberId}`).set(auth(admin)).send({status:'INVALID'}).expect(400);
    await request(app.getHttpServer()).get('/members?status=INVALID').set(auth(admin)).expect(400);
  });
  test('manual attendance persists status, points and audit reason', async () => {
    const r = await request(app.getHttpServer()).post('/attendance/manual').set(auth(admin)).send({memberId,meetingId:meeting.id,status:'LATE',reason:'Recorded by test administrator'}).expect(201);
    expect(r.body.status).toBe('LATE');
    expect(await db.auditLog.count({where:{entityId:r.body.id,reason:'Recorded by test administrator'}})).toBe(1);
  });
  test('bulk leaderboard preserves member performance calculations', async () => {
    const performance = await request(app.getHttpServer()).get('/scoring/my-performance').set(auth(member)).expect(200);
    const leaderboard = await request(app.getHttpServer()).get('/scoring/leaderboard?limit=1000').set(auth(member)).expect(200);
    const row = leaderboard.body.find((item: any) => item.memberId === memberId);
    expect(row).toBeDefined();
    for (const key of ['attendanceRate','punctualityRate','totalPoints','compositeScore','currentAttendanceStreak','currentOnTimeStreak','attendedCount','expectedCount']) {
      expect(row[key]).toBe(performance.body[key]);
    }
  });
  test.each([
    ['ON_TIME', 'EXCUSED', 'EARLY', 'EXEMPT', 'LATE', 'ABSENT'],
    ['EXEMPT', 'EXCUSED'],
    ['ABSENT', 'ON_TIME'],
    ['EARLY', 'ON_TIME', 'GRACE_PERIOD'],
  ])('database leaderboard matches full performance for streak sequence %j', async (...statuses: string[]) => {
    const team = await db.subTeam.create({ data: { name: `Streak ${crypto.randomUUID()}` } });
    const person = await db.member.create({ data: { memberCode: crypto.randomUUID(), firstName: 'Streak', lastName: 'Test', phoneNumber: '08012345678', subTeamId: team.id } });
    for (const [index, status] of statuses.entries()) {
      const date = new Date(Date.UTC(2024, 0, 20 - index));
      const fixture = await db.meeting.create({ data: { title: 'Streak fixture', categoryId: category.id, meetingDate: date, startTime: date, expectedArrivalTime: date, attendanceOpenTime: date, attendanceCloseTime: date, locationName: 'Test', latitude: 6.5, longitude: 3.3, status: 'CLOSED' } });
      await db.attendanceRecord.create({ data: { memberId: person.id, meetingId: fixture.id, expectedArrivalTime: date, status: status as any, pointsEarned: status === 'EARLY' ? 12 : 0 } });
    }
    const performance = await request(app.getHttpServer()).get(`/scoring/member/${person.id}`).set(auth(admin)).expect(200);
    const leaderboard = await request(app.getHttpServer()).get(`/scoring/leaderboard?subTeamId=${team.id}`).set(auth(member)).expect(200);
    expect(leaderboard.body).toHaveLength(1);
    for (const key of ['attendanceRate','punctualityRate','totalPoints','compositeScore','currentAttendanceStreak','currentOnTimeStreak','attendedCount','expectedCount']) expect(leaderboard.body[0][key]).toBe(performance.body[key]);
    const row = await db.attendanceRecord.findFirstOrThrow({ where: { memberId: person.id } });
    await db.attendanceRecord.update({ where: { id: row.id }, data: { pointsEarned: { increment: 1 } } });
    const refreshed = await request(app.getHttpServer()).get(`/scoring/leaderboard?subTeamId=${team.id}`).set(auth(member)).expect(200);
    expect(refreshed.body[0].totalPoints).toBe(leaderboard.body[0].totalPoints + 1);

  });
  test('only admins manage Google approval, with audit and duplicate protection', async () => {
    const created = await request(app.getHttpServer()).post('/members').set(auth(admin)).send({firstName:'Approved',lastName:'Member',phoneNumber:'08012345678',email:`approved-${run}@example.test`}).expect(201);
    const id = created.body.id;
    expect(await db.approvedMember.count({where:{memberId:id,status:'ACTIVE'}})).toBe(1);
    await request(app.getHttpServer()).put(`/members/${id}/google-access`).set(auth(member)).send({email:`approved-${run}@example.test`,status:'REVOKED'}).expect(403);
    await request(app.getHttpServer()).put(`/members/${id}/google-access`).set(auth(admin)).send({email:`approved-${run}@example.test`,status:'REVOKED'}).expect(200);
    expect(await db.approvedMember.count({where:{memberId:id,status:'REVOKED'}})).toBe(1);
    expect(await db.auditLog.count({where:{action:'GOOGLE_ACCESS_UPDATED'}})).toBeGreaterThan(0);
    await request(app.getHttpServer()).post('/members').set(auth(admin)).send({firstName:'Duplicate',lastName:'Email',phoneNumber:'08012345678',email:`approved-${run}@example.test`}).expect(409);
    await request(app.getHttpServer()).put(`/members/${memberId}/google-access`).set(auth(admin)).send({email:'other@example.test',status:'ACTIVE'}).expect(400);
    const leader = await db.user.create({data:{email:`leader-${run}@example.test`,passwordHash:'not-used',role:'LEADER'}});
    const leaderToken = app.get(AuthService).generateToken(leader.id,leader.email,leader.role);
    await request(app.getHttpServer()).put(`/members/${id}/google-access`).set(auth(leaderToken)).send({email:`approved-${run}@example.test`,status:'ACTIVE'}).expect(403);
    await request(app.getHttpServer()).post('/members').set(auth(leaderToken)).send({firstName:'Leader',lastName:'Approval',phoneNumber:'08012345678',email:`leader-approved-${run}@example.test`}).expect(403);
  });
  test('retired native push endpoints are unavailable', async () => {
    await request(app.getHttpServer()).post('/devices/push-token').set(auth(member)).send({}).expect(404);
  });
  test('availability saves an empty response and rejects invalid selections', async () => {
    await request(app.getHttpServer()).put('/availability/current').set(auth(member)).send({meetingIds:[]}).expect(200);
    const r = await request(app.getHttpServer()).get('/availability/current').set(auth(member)).expect(200);
    expect(r.body.submitted).toBe(true);
    await request(app.getHttpServer()).put('/availability/current').set(auth(member)).send({meetingIds:['missing']}).expect(400);
  });
  test('invalid status and missing manual reason return 400', async () => {
    await request(app.getHttpServer()).put(`/meetings/${meeting.id}/status`).set(auth(admin)).send({status:'BOGUS'}).expect(400);
    await request(app.getHttpServer()).post('/attendance/manual').set(auth(admin)).send({memberId,meetingId:meeting.id,status:'EARLY'}).expect(400);
  });
  test('leaderboard date filters exclude records outside the interval', async () => {
    const r = await request(app.getHttpServer()).get('/scoring/leaderboard?startDate=2000-01-01&endDate=2000-01-31').set(auth(member)).expect(200);
    expect(r.body.find((m:any)=>m.memberId===memberId).expectedCount).toBe(0);
  });
  test('close-out is idempotent and creates absence records and summary', async () => {
    await app.get(AbsenceProcessingJob).closeMeetingAndProcessAbsences(meeting.id);
    const before = await db.attendanceRecord.count({where:{meetingId:meeting.id}});
    await app.get(AbsenceProcessingJob).closeMeetingAndProcessAbsences(meeting.id);
    expect(await db.attendanceRecord.count({where:{meetingId:meeting.id}})).toBe(before);
    expect(await db.meetingSummary.count({where:{meetingId:meeting.id}})).toBe(1);
  });

  test('notification reads and updates cannot affect another member', async () => {
    const notification = await db.memberNotification.create({data:{memberId,type:'TEST',title:'Test notification',body:'Only for this member'}});
    const r = await request(app.getHttpServer()).get('/members/me/notifications').set(auth(member)).expect(200);
    expect(r.body.some((n:any)=>n.id===notification.id)).toBe(true);
    await request(app.getHttpServer()).put('/members/me/notifications/read').set(auth(admin)).expect(403);
    expect((await db.memberNotification.findUnique({where:{id:notification.id}})).status).toBe('UNREAD');
    await request(app.getHttpServer()).put('/members/me/notifications/read').set(auth(member)).expect(200);
    expect((await db.memberNotification.findUnique({where:{id:notification.id}})).status).toBe('READ');
  });
  test('manual closure creates summary and prevents reopening', async () => {
    const created = await db.meeting.create({data:{title:'Manual close',categoryId:category.id,meetingDate:time(0),startTime:time(5),expectedArrivalTime:time(0),attendanceOpenTime:time(-10),attendanceCloseTime:time(60),latitude:6.5,longitude:3.3,locationName:'Test Venue',status:'ACTIVE'}});
    await request(app.getHttpServer()).put(`/meetings/${created.id}/status`).set(auth(admin)).send({status:'CLOSED'}).expect(200);
    expect(await db.meetingSummary.count({where:{meetingId:created.id}})).toBe(1);
    await request(app.getHttpServer()).put(`/meetings/${created.id}/status`).set(auth(admin)).send({status:'ACTIVE'}).expect(400);
  });

  test('simultaneous check-ins create one record and return conflicts, never 500', async () => {
    const target = await db.meeting.create({data:{title:'Concurrent check-in',categoryId:category.id,meetingDate:time(0),startTime:time(5),expectedArrivalTime:time(0),attendanceOpenTime:time(-10),attendanceCloseTime:time(60),latitude:6.5,longitude:3.3,locationName:'Test Venue',status:'ACTIVE'}});
    const responses = await Promise.all(Array.from({length:12},()=>request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:target.id,latitude:6.5,longitude:3.3,gpsAccuracy:5})));
    expect(responses.filter(r=>r.status===201)).toHaveLength(1);
    expect(responses.filter(r=>r.status===409)).toHaveLength(11);
    expect(await db.attendanceRecord.count({where:{meetingId:target.id,memberId}})).toBe(1);
  });
  test('inactive members lose access using an already-issued token', async () => {
    await db.member.update({where:{id:memberId},data:{status:'SUSPENDED'}});
    try { await request(app.getHttpServer()).get('/auth/me').set(auth(member)).expect(401); }
    finally { await db.member.update({where:{id:memberId},data:{status:'ACTIVE'}}); }
  });


  test('legacy QR secrets do not block location-only attendance at the church', async () => {
    const target = await db.meeting.create({ data: { title: 'Church location check', categoryId: category.id, meetingDate: time(0), startTime: time(5), expectedArrivalTime: time(0), attendanceOpenTime: time(-10), attendanceCloseTime: time(60), latitude: 6.6697906, longitude: 3.3581822, locationName: 'Church', status: 'ACTIVE', qrSecret: 'legacy-secret' } });
    const open = await request(app.getHttpServer()).get('/meetings/attendance-open').set(auth(member)).expect(200);
    expect(open.body.some((m: any) => m.id === target.id)).toBe(true);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ meetingId: target.id, latitude: 6.6646952, longitude: 3.3272455, gpsAccuracy: 5 }).expect(400);
    const record = await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({ meetingId: target.id, latitude: 6.6697906, longitude: 3.3581822, gpsAccuracy: 5 }).expect(201);
    expect(record.body.method).toBe('SYSTEM_GEO');
  });

  test('optional services do not mark all uncommitted members absent', async () => {
    const target = await db.meeting.create({ data: { title: 'Optional service', categoryId: category.id, meetingDate: time(0), startTime: time(0), expectedArrivalTime: time(-10), attendanceOpenTime: time(-30), attendanceCloseTime: time(60), latitude: 6.6697906, longitude: 3.3581822, locationName: 'Church', status: 'ACTIVE', isCompulsory: false } });
    await app.get(AbsenceProcessingJob).closeMeetingAndProcessAbsences(target.id);
    expect(await db.attendanceRecord.count({ where: { meetingId: target.id } })).toBe(0);
  });

  describe('Google identity verification (provider responses simulated)', () => {
    let claims: any, user: any, provider: jest.SpyInstance, previousAudience: string | undefined;
    beforeEach(async () => {
      previousAudience = process.env.GOOGLE_OAUTH_CLIENT_IDS;
      process.env.GOOGLE_OAUTH_CLIENT_IDS = 'e2e-google-client';
      user = await db.user.findFirstOrThrow({where:{member:{id:memberId}}});
      await db.approvedMember.upsert({where:{normalizedEmail:user.email},update:{status:'ACTIVE'},create:{email:user.email,normalizedEmail:user.email,memberId}});
      claims = {aud:'e2e-google-client',iss:'https://accounts.google.com',sub:`google-${run}`,email:user.email,email_verified:'true',exp:String(Math.floor(Date.now()/1000)+3600)};
      provider = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(claims),{status:200,headers:{'Content-Type':'application/json'}}));
    });
    afterEach(async () => {
      provider.mockRestore();
      if (previousAudience === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
      else process.env.GOOGLE_OAUTH_CLIENT_IDS = previousAudience;
      await db.user.update({where:{id:user.id},data:{googleSubject:null,role:'MEMBER'}});
      await db.approvedMember.update({where:{normalizedEmail:user.email},data:{status:'ACTIVE'}});
    });
    test.each([
      ['audience', {aud:'another-client'}],
      ['issuer', {iss:'https://attacker.example'}],
      ['email verification', {email_verified:'false'}],
      ['expiration', {exp:'1'}],
      ['non-numeric expiration', {exp:'not-a-number'}],
      ['infinite expiration', {exp:'Infinity'}],
      ['missing subject', {sub:''}],
      ['invalid email type', {email:{value:'not-a-string'}}],
    ])('rejects invalid %s', async (_label, invalid) => {
      Object.assign(claims, invalid);
      await request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'}).expect(401);
    });
    test('simultaneous first Google logins link one usable account', async () => {
      const email = `concurrent-google-${run}@example.test`;
      const created = await request(app.getHttpServer()).post('/members').set(auth(admin)).send({email,firstName:'Concurrent',lastName:'Google',phoneNumber:'08012345678'}).expect(201);
      claims.email = email; claims.sub = `concurrent-google-${run}`;
      const responses = await Promise.all(Array.from({length:5},()=>request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'})));
      expect(responses.every(response=>response.status===201)).toBe(true);
      expect(await db.user.count({where:{email}})).toBe(1);
      const linked = await db.member.findUniqueOrThrow({where:{id:created.body.id}});
      expect(linked.userId).toBeTruthy();
      for (const response of responses) await request(app.getHttpServer()).get('/auth/me').set(auth(response.body.accessToken)).expect(200);
    });
    test('newly provisioned member can sign in and admin revocation invalidates the session', async () => {
      const email = `onboard-${run}@example.test`;
      const created = await request(app.getHttpServer()).post('/members').set(auth(admin)).send({email,firstName:'New',lastName:'Google',phoneNumber:'08012345678'}).expect(201);
      claims.email = email; claims.sub = `new-google-${run}`;
      const signed = await request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'}).expect(201);
      await request(app.getHttpServer()).get('/auth/me').set(auth(signed.body.accessToken)).expect(200);
      await request(app.getHttpServer()).put(`/members/${created.body.id}/google-access`).set(auth(admin)).send({email,status:'REVOKED'}).expect(200);
      await request(app.getHttpServer()).get('/auth/me').set(auth(signed.body.accessToken)).expect(401);
    });
    test('approved Google login issues a usable token and revocation invalidates it', async () => {
      const r = await request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'}).expect(201);
      await request(app.getHttpServer()).get('/auth/me').set(auth(r.body.accessToken)).expect(200);
      await db.approvedMember.update({where:{normalizedEmail:user.email},data:{status:'REVOKED'}});
      await request(app.getHttpServer()).get('/auth/me').set(auth(r.body.accessToken)).expect(401);
      await request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'}).expect(403);
    });
    test('member Google login cannot authenticate an administrator account', async () => {
      await db.user.update({where:{id:user.id},data:{role:'ADMIN'}});
      await request(app.getHttpServer()).post('/auth/google/member').send({idToken:'provider-test-token'}).expect(403);
    });
    test('rejects non-string identity tokens before contacting the provider', async () => {
      await request(app.getHttpServer()).post('/auth/google/member').send({idToken:{token:'bad'}}).expect(401);
      expect(provider).not.toHaveBeenCalled();
    });
  });

});
