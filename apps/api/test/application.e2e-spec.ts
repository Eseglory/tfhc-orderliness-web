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
  test('member cannot generate QR or activate a meeting', async () => {
    await request(app.getHttpServer()).get(`/meetings/${meeting.id}/qr-code`).set(auth(member)).expect(403);
    await request(app.getHttpServer()).put(`/meetings/${meeting.id}/status`).set(auth(member)).send({status:'ACTIVE'}).expect(403);
  });
  test('profile update without celebrations works', async () => { await request(app.getHttpServer()).put('/members/me/profile').set(auth(member)).send({preferredName:'Tester'}).expect(200); });
  test('members response excludes password hashes', async () => { const r = await request(app.getHttpServer()).get('/members').set(auth(admin)).expect(200); expect(JSON.stringify(r.body)).not.toContain('passwordHash'); });
  test('invalid meeting dates are rejected', async () => { await request(app.getHttpServer()).post('/meetings').set(auth(admin)).send({ ...meeting, startTime: 'invalid' }).expect(400); });
  test('admin without member cannot read all member history', async () => { await request(app.getHttpServer()).get('/attendance/my-history').set(auth(admin)).expect(403); });
  test('geofence, QR and duplicate check-in', async () => {
    const body = {meetingId:meeting.id, latitude:6.5, longitude:3.3, gpsAccuracy:5};
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send(body).expect(400);
    const qr = await request(app.getHttpServer()).get(`/meetings/${meeting.id}/qr-code`).set(auth(admin)).expect(200);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({...body, qrPayload:qr.body.qrPayload, latitude:0}).expect(400);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({...body, qrPayload:qr.body.qrPayload, gpsAccuracy:-1}).expect(400);
    const checked = await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({...body, qrPayload:qr.body.qrPayload, memberId:'impersonated'}).expect(201);
    expect(checked.body.memberId).toBe(memberId);
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({...body, qrPayload:qr.body.qrPayload}).expect(409);
  });
  test('outside attendance window returns 400', async () => {
    await db.attendanceRecord.deleteMany({where:{memberId,meetingId:meeting.id}});
    await db.meeting.update({where:{id:meeting.id},data:{attendanceOpenTime:time(20),qrSecret:null}});
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:meeting.id,latitude:6.5,longitude:3.3}).expect(400);
    await db.meeting.update({where:{id:meeting.id},data:{attendanceOpenTime:time(-30)}});
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
  test('manual attendance persists status, points and audit reason', async () => {
    const r = await request(app.getHttpServer()).post('/attendance/manual').set(auth(admin)).send({memberId,meetingId:meeting.id,status:'LATE',reason:'Recorded by test administrator'}).expect(201);
    expect(r.body.status).toBe('LATE');
    expect(await db.auditLog.count({where:{entityId:r.body.id,reason:'Recorded by test administrator'}})).toBe(1);
  });
  test('push registration and removal are scoped to the account', async () => {
    const token = `ExpoPushToken[${run}]`;
    await request(app.getHttpServer()).post('/devices/push-token').set(auth(member)).send({token,platform:'ios'}).expect(201);
    await request(app.getHttpServer()).delete('/devices/push-token').set(auth(admin)).send({token}).expect(200);
    expect((await db.pushDevice.findUnique({where:{token}})).isActive).toBe(true);
    await request(app.getHttpServer()).delete('/devices/push-token').set(auth(member)).send({token}).expect(200);
    expect((await db.pushDevice.findUnique({where:{token}})).isActive).toBe(false);
    await request(app.getHttpServer()).post('/devices/push-token').set(auth(member)).send({token:'bad',platform:'ios'}).expect(400);
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


  test('expired, forged and future QR codes cannot create attendance', async () => {
    const target = await db.meeting.create({data:{title:'QR boundaries',categoryId:category.id,meetingDate:time(0),startTime:time(5),expectedArrivalTime:time(0),attendanceOpenTime:time(-10),attendanceCloseTime:time(60),latitude:6.5,longitude:3.3,locationName:'Test Venue',status:'ACTIVE',qrSecret:'qr-test-secret'}});
    for (const offset of [-120000,120000]) {
      const timestamp=Date.now()+offset;
      const signature=crypto.createHmac('sha256',target.qrSecret).update(`${target.id}:${timestamp}`).digest('hex');
      await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:target.id,latitude:6.5,longitude:3.3,qrPayload:JSON.stringify({meetingId:target.id,timestamp,signature})}).expect(400);
    }
    await request(app.getHttpServer()).post('/attendance/check-in').set(auth(member)).send({meetingId:target.id,latitude:6.5,longitude:3.3,qrPayload:JSON.stringify({meetingId:target.id,timestamp:Date.now(),signature:'forged'})}).expect(400);
    expect(await db.attendanceRecord.count({where:{meetingId:target.id,memberId}})).toBe(0);
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
