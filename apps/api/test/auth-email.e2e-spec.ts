import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RbacService } from '../src/common/rbac/rbac.service';
import { MailService } from '../src/modules/mail/mail.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

const PASSWORD = 'Sup3rSecret!pw';
const NEW_PASSWORD = 'Ev3nBetter!pw99';

/** Pull the `token` query parameter out of a verify/reset URL. */
const tokenOf = (url: string) => new URL(url).searchParams.get('token') as string;

describe('Email authentication & password lifecycle (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  // SMTP unavailable → services fall back to returning the link in the response.
  const sendEmail = jest.fn().mockRejectedValue(new Error('SMTP unavailable in tests'));

  const approvedEmail = `reg-${run}@tfhc.org`.toLowerCase();
  const googleOnlyEmail = `goog-${run}@tfhc.org`.toLowerCase();

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ sendEmail, verifyConnection: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    app.get(SchedulerRegistry).getCronJobs().forEach((job) => job.stop());
    db = app.get(PrismaService);
    await app.get(RbacService).syncSystemRoles();

    // An approved member, in the directory, with no account yet.
    const member = await db.member.create({
      data: {
        memberCode: `AUTH-${run}`,
        firstName: 'Ada',
        lastName: 'Approved',
        phoneNumber: '08010000001',
        approvedMember: { create: { email: approvedEmail, normalizedEmail: approvedEmail, status: 'ACTIVE' } },
      },
    });
    void member;

    // A Google-only member (has an account, no password auth).
    await db.member.create({
      data: {
        memberCode: `GOOG-${run}`,
        firstName: 'Gina',
        lastName: 'Google',
        phoneNumber: '08010000002',
        user: { create: { email: googleOnlyEmail, googleSubject: `sub-${run}`, passwordHash: await argon2.hash('irrelevant'), role: 'MEMBER' } },
        approvedMember: { create: { email: googleOnlyEmail, normalizedEmail: googleOnlyEmail, status: 'ACTIVE' } },
      },
    });
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@tfhc.org` } } });
      await db.member.deleteMany({ where: { memberCode: { in: [`AUTH-${run}`, `GOOG-${run}`] } } });
      await db.approvedMember.deleteMany({ where: { normalizedEmail: { in: [approvedEmail, googleOnlyEmail] } } });
    }
    if (app) await app.close();
  });

  it('rejects registration for an email that is not on the approved list', async () => {
    const res = await http().post('/auth/register').send({ email: `stranger-${run}@tfhc.org`, password: PASSWORD, firstName: 'No', lastName: 'One', phoneNumber: '08000000000' }).expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_IN_LOOKUP_TABLE');
  });

  it('runs the full journey: register → verify → login → change password → reset → login', async () => {
    // Register — no session returned, verification link in the dev fallback.
    const reg = await http().post('/auth/register').send({ email: approvedEmail.toUpperCase(), password: PASSWORD, firstName: 'Ada', lastName: 'Approved', phoneNumber: '08010000001' }).expect(201);
    expect(reg.body).toMatchObject({ pendingVerification: true });
    expect(reg.body.accessToken).toBeUndefined();
    expect(reg.body.verifyUrl).toContain('/verify-email?token=');

    // Cannot log in before verifying.
    await http().post('/auth/login').send({ email: approvedEmail, password: PASSWORD }).expect(403)
      .then((r) => expect(r.body.code).toBe('EMAIL_VERIFICATION_PENDING'));

    // Verify — now authenticated.
    const verify = await http().post('/auth/verify-email').send({ token: tokenOf(reg.body.verifyUrl) }).expect(200);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.user).toMatchObject({ role: 'MEMBER', email: approvedEmail });
    const firstToken = verify.body.accessToken as string;

    // The same link can't be replayed.
    await http().post('/auth/verify-email').send({ token: tokenOf(reg.body.verifyUrl) }).expect(400);

    // Password login works.
    const login = await http().post('/auth/login').send({ email: approvedEmail, password: PASSWORD }).expect(201);
    const loginToken = login.body.accessToken as string;
    await http().get('/auth/me').set(auth(loginToken)).expect(200);

    // JWT `iat` is whole seconds; a token issued in the same second as the
    // password change is intentionally kept. Cross a second boundary so the
    // pre-change tokens are unambiguously older.
    await new Promise((r) => setTimeout(r, 1100));

    // Change password — issues a fresh token, invalidates the others.
    const changed = await http().post('/auth/change-password').set(auth(loginToken)).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(200);
    expect(changed.body.accessToken).toBeTruthy();
    await http().get('/auth/me').set(auth(changed.body.accessToken)).expect(200);
    await http().get('/auth/me').set(auth(firstToken)).expect(401);
    await http().get('/auth/me').set(auth(loginToken)).expect(401);

    // Wrong current password is refused.
    await http().post('/auth/change-password').set(auth(changed.body.accessToken)).send({ currentPassword: 'not-it-at-all', newPassword: 'Whatever!pw12345' }).expect(400);

    await new Promise((r) => setTimeout(r, 1100));

    // Forgot / reset password.
    const forgot = await http().post('/auth/forgot-password').send({ email: approvedEmail }).expect(200);
    expect(forgot.body.ok).toBe(true);
    expect(forgot.body.devUrl).toContain('/reset-password?token=');
    const reset = await http().post('/auth/reset-password').send({ token: tokenOf(forgot.body.devUrl), password: PASSWORD }).expect(200);
    expect(reset.body.accessToken).toBeTruthy();

    // Old (post-change) token is dead, new password logs in.
    await http().get('/auth/me').set(auth(changed.body.accessToken)).expect(401);
    await http().post('/auth/login').send({ email: approvedEmail, password: PASSWORD }).expect(201);
  }, 60000);

  it('does not reveal whether an address has an account (forgot-password)', async () => {
    const res = await http().post('/auth/forgot-password').send({ email: `ghost-${run}@tfhc.org` }).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('keeps Google-only members on the Google path', async () => {
    const res = await http().post('/auth/login').send({ email: googleOnlyEmail, password: 'anything-goes-here' }).expect(403);
    expect(res.body.code).toBe('AUTH_METHOD_GOOGLE_ONLY');
  });

  it('prevents a second registration from changing a Google-only account authentication method', async () => {
    await http().post('/auth/register').send({ email: googleOnlyEmail, password: PASSWORD, firstName: 'Gina', lastName: 'Google', phoneNumber: '08010000002' }).expect(409);
    const user = await db.user.findUniqueOrThrow({ where: { email: googleOnlyEmail } });
    expect(user.passwordAuthEnabled).toBe(false);
    expect(user.googleSubject).toBeTruthy();
    expect(await db.user.count({ where: { email: googleOnlyEmail } })).toBe(1);
    await http().post('/auth/login').send({ email: googleOnlyEmail, password: PASSWORD }).expect(403);
  });
});
