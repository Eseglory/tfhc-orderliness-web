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
import { MailService } from '../src/modules/mail/mail.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('RBAC + Admin Team (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  let superToken: string;
  let adminRoleToken: string;
  let financeToken: string;
  let memberToken: string;
  let superUserId: string;
  // Simulate SMTP being unavailable so the invite falls back to a shareable link.
  const sendEmail = jest.fn().mockRejectedValue(new Error('SMTP unavailable in tests'));

  const grantRole = async (userId: string, key: string) => {
    const role = await db.accessRole.findUniqueOrThrow({ where: { key } });
    await db.userAccessRole.create({ data: { userId, roleId: role.id } });
  };

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

    // This suite reasons about the *global* set of Super Admins, so it must be
    // the only source of them. Clear any leftovers from earlier polluted runs.
    const superRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    await db.userAccessRole.deleteMany({ where: { roleId: superRole.id } });

    const pw = await argon2.hash('E2ePassword!123');
    const tokens = app.get(AuthService);

    const superUser = await db.user.create({ data: { email: `super-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    superUserId = superUser.id;
    await grantRole(superUser.id, 'SUPER_ADMIN');
    superToken = tokens.generateToken(superUser.id, superUser.email, 'ADMIN');

    const adminUser = await db.user.create({ data: { email: `admin-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await grantRole(adminUser.id, 'ADMINISTRATION');
    adminRoleToken = tokens.generateToken(adminUser.id, adminUser.email, 'ADMIN');

    const financeUser = await db.user.create({ data: { email: `finance-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await grantRole(financeUser.id, 'FINANCE');
    financeToken = tokens.generateToken(financeUser.id, financeUser.email, 'ADMIN');

    const memberUser = await db.user.create({
      data: {
        email: `member-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
        member: { create: { memberCode: `RBAC-${run}`, firstName: 'Reg', lastName: 'Member', phoneNumber: '08010000000' } },
      },
      include: { member: true },
    });
    memberToken = tokens.generateToken(memberUser.id, memberUser.email, 'MEMBER', memberUser.member!.id);
  }, 40000);

  afterAll(async () => {
    if (db) {
      // Audit logs intentionally restrict deletion of their actor; clear the
      // test's own entries first, then the accounts it created.
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
      await db.accessRole.deleteMany({ where: { key: { startsWith: 'EVENTS_COORDINATOR_' } } });
    }
    if (app) await app.close();
  });

  test('system roles are synced with sensible defaults', async () => {
    const roles = (await http().get('/access-roles').set(auth(superToken)).expect(200)).body;
    const byKey = Object.fromEntries(roles.map((r: any) => [r.key, r]));
    expect(byKey.SUPER_ADMIN.permissions).toEqual(['*']);
    expect(byKey.SUPER_ADMIN.editable).toBe(false);
    expect(byKey.ADMINISTRATION.permissions).toContain('members.create');
    expect(byKey.ADMINISTRATION.permissions).not.toContain('expenses.approve');
    expect(byKey.FINANCE.permissions).toContain('expenses.approve');
    expect(byKey.FINANCE.permissions).not.toContain('members.create');
  });

  test('permission catalogue lists grouped permissions', async () => {
    const groups = (await http().get('/access-roles/permissions').set(auth(superToken)).expect(200)).body;
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.flatMap((g: any) => g.permissions.map((p: any) => p.key))).toContain('roles.update');
  });

  test('roles administration is gated by roles.* permissions', async () => {
    await http().get('/access-roles').set(auth(adminRoleToken)).expect(403);
    await http().get('/access-roles').set(auth(financeToken)).expect(403);
    await http().get('/access-roles').set(auth(memberToken)).expect(403);
    await http().get('/access-roles').expect(401);
  });

  let customRoleId: string;
  test('super admin can create, edit and delete a custom role; unknown permissions rejected', async () => {
    await http()
      .post('/access-roles')
      .set(auth(superToken))
      .send({ name: `Events Coordinator ${run}`, permissions: ['events.read', 'not.a.real.permission'] })
      .expect(400);

    const created = (
      await http()
        .post('/access-roles')
        .set(auth(superToken))
        .send({ name: `Events Coordinator ${run}`, description: 'Runs the calendar', permissions: ['events.read', 'events.create', 'events.update'] })
        .expect(201)
    ).body;
    customRoleId = created.id;
    expect(created.isSystem).toBe(false);
    expect(created.permissions.sort()).toEqual(['events.create', 'events.read', 'events.update']);

    const updated = (
      await http()
        .patch(`/access-roles/${customRoleId}`)
        .set(auth(superToken))
        .send({ permissions: ['events.read'] })
        .expect(200)
    ).body;
    expect(updated.permissions).toEqual(['events.read']);

    await http().delete(`/access-roles/${customRoleId}`).set(auth(superToken)).expect(200);
    await http().delete(`/access-roles/${customRoleId}`).set(auth(superToken)).expect(404);
  });

  test('the Super Admin role itself cannot be edited', async () => {
    const roles = (await http().get('/access-roles').set(auth(superToken)).expect(200)).body;
    const superRole = roles.find((r: any) => r.key === 'SUPER_ADMIN');
    await http().patch(`/access-roles/${superRole.id}`).set(auth(superToken)).send({ permissions: ['members.read'] }).expect(403);
  });

  test('admin team lifecycle: invite → accept → permissions active → deactivate → blocked', async () => {
    const adminRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'ADMINISTRATION' } });

    await http().get('/admin/team').set(auth(financeToken)).expect(403); // FINANCE lacks users.read

    const invited = (
      await http()
        .post('/admin/team')
        .set(auth(superToken))
        .send({ email: `newadmin-${run}@example.test`, firstName: 'New', lastName: 'Admin', phoneNumber: '08022222222', roleIds: [adminRole.id] })
        .expect(201)
    ).body;
    expect(invited.emailDelivered).toBe(false);
    expect(invited.inviteUrl).toContain('/accept-invite?token=');
    const token = new URL(invited.inviteUrl).searchParams.get('token')!;

    // Cannot sign in before accepting.
    await http().post('/auth/login').send({ email: `newadmin-${run}@example.test`, password: 'whatever-not-set' }).expect(401);

    const accepted = (await http().post('/auth/accept-invite').send({ token, password: 'BrandNewPass!234' }).expect(201)).body;
    expect(accepted.user.accessRoles).toEqual(['ADMINISTRATION']);
    expect(accepted.user.permissions).toContain('members.create');
    expect(accepted.user.permissions).not.toContain('roles.create');

    // Token is single-use.
    await http().post('/auth/accept-invite').send({ token, password: 'BrandNewPass!234' }).expect(400);

    const newAdminToken = accepted.accessToken;
    await http().get('/members').set(auth(newAdminToken)).expect(200);
    await http().get('/access-roles').set(auth(newAdminToken)).expect(403);
    await http().post('/auth/login').send({ email: `newadmin-${run}@example.test`, password: 'BrandNewPass!234' }).expect(201);

    // Deactivate — the existing session must stop working immediately.
    await http().post(`/admin/team/${invited.id}/deactivate`).set(auth(superToken)).send({ reason: 'left the team' }).expect(201);
    await http().get('/members').set(auth(newAdminToken)).expect(401);
    await http().post('/auth/login').send({ email: `newadmin-${run}@example.test`, password: 'BrandNewPass!234' }).expect(403);

    await http().post(`/admin/team/${invited.id}/reactivate`).set(auth(superToken)).expect(201);
    await http().post('/auth/login').send({ email: `newadmin-${run}@example.test`, password: 'BrandNewPass!234' }).expect(201);

    const audit = await db.auditLog.findMany({ where: { entity: 'User', entityId: invited.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['ADMIN_INVITED', 'ADMIN_DEACTIVATED', 'ADMIN_REACTIVATED']),
    );
  });

  test('an admin cannot deactivate their own account', async () => {
    // Distinct guard (403) from the last-super-admin check.
    await http().post(`/admin/team/${superUserId}/deactivate`).set(auth(superToken)).expect(403);
  });

  test('the sole Super Admin cannot drop their own Super Admin role', async () => {
    const adminRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'ADMINISTRATION' } });
    await http()
      .patch(`/admin/team/${superUserId}`)
      .set(auth(superToken))
      .send({ roleIds: [adminRole.id] })
      .expect(400);

    const team = (await http().get('/admin/team').set(auth(superToken)).expect(200)).body;
    expect(team.find((t: any) => t.id === superUserId).isSuperAdmin).toBe(true);

    // With a second Super Admin present the change is allowed, then reverted.
    const second = await db.user.create({ data: { email: `super2-${run}@example.test`, passwordHash: await argon2.hash('x'.repeat(12)), role: 'ADMIN' } });
    await grantRole(second.id, 'SUPER_ADMIN');
    const superRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    await http()
      .patch(`/admin/team/${superUserId}`)
      .set(auth(superToken))
      .send({ roleIds: [superRole.id, adminRole.id] })
      .expect(200);
    await http()
      .patch(`/admin/team/${superUserId}`)
      .set(auth(superToken))
      .send({ roleIds: [superRole.id] })
      .expect(200);
    await db.userAccessRole.deleteMany({ where: { userId: second.id } });
    await db.user.delete({ where: { id: second.id } });
  });

  test('audit log endpoint requires audit.read', async () => {
    await http().get('/audit-logs').set(auth(memberToken)).expect(403);
    await http().get('/audit-logs').set(auth(adminRoleToken)).expect(403);
    const logs = (await http().get('/audit-logs?entity=User').set(auth(superToken)).expect(200)).body;
    expect(Array.isArray(logs.items)).toBe(true);
    expect(logs.items[0]).toHaveProperty('action');
  });
});
