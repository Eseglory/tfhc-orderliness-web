
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '@tfhc/shared';
import * as argon2 from 'argon2';
import { hashInviteToken } from '../src/common/invite-token';

jest.setTimeout(60000);

describe('Admin/Team Member Invitation Flow (E2E & Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdminToken: string;
  let superAdminUserId: string;
  let memberToken: string;
  let superAdminRoleId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Fetch Super Admin role
    const saRole = await prisma.accessRole.findFirst({ where: { key: 'SUPER_ADMIN' } });
    superAdminRoleId = saRole!.id;

    // Seed test Super Admin user
    const superAdminEmail = `superadmin_invite_test_${Date.now()}@tfhc.org`;
    const pwdHash = await argon2.hash('SuperAdminPass123!');
    const superAdminUser = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: pwdHash,
        passwordAuthEnabled: true,
        emailVerifiedAt: new Date(),
        role: Role.ADMIN,
        isActive: true,
        accessRoles: {
          create: [{ roleId: superAdminRoleId }],
        },
      },
    });
    superAdminUserId = superAdminUser.id;

    // Login as Super Admin
    const saLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdminEmail, password: 'SuperAdminPass123!' })
      .expect(201);
    superAdminToken = saLoginRes.body.accessToken;

    // Seed test Member user (non-admin)
    const memberEmail = `normal_member_${Date.now()}@tfhc.org`;
    const memberCode = `TFHC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await prisma.user.create({
      data: {
        email: memberEmail,
        passwordHash: pwdHash,
        passwordAuthEnabled: true,
        emailVerifiedAt: new Date(),
        role: Role.MEMBER,
        isActive: true,
        member: {
          create: {
            memberCode,
            firstName: 'Normal',
            lastName: 'Member',
            phoneNumber: '+2348033333333',
            status: 'ACTIVE',
            approvedMember: {
              create: {
                email: memberEmail,
                normalizedEmail: memberEmail,
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });

    const memberLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password: 'SuperAdminPass123!' })
      .expect(201);
    memberToken = memberLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('1. Security & RBAC Enforcement', () => {
    it('should reject unauthenticated invitation requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/admin/team/invite')
        .send({
          email: 'newadmin@tfhc.org',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+2348011111111',
          roleIds: [superAdminRoleId],
        })
        .expect(401);
    });

    it('should reject non-admin users with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/admin/team/invite')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          email: 'newadmin@tfhc.org',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+2348011111111',
          roleIds: [superAdminRoleId],
        })
        .expect(403);
    });
  });

  describe('2. Admin Invitation Lifecycle', () => {
    const inviteeEmail = `invitee_admin_${Date.now()}@tfhc.org`;
    let inviteToken: string;
    let inviteeUserId: string;

    it('should allow Super Admin to invite a new admin team member', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/team/invite')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: inviteeEmail,
          firstName: 'Test',
          lastName: 'Admin',
          phoneNumber: '+2348022222222',
          roleIds: [superAdminRoleId],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(inviteeEmail);
      expect(res.body.inviteUrl).toBeDefined();

      inviteeUserId = res.body.id;
      // Extract raw token from inviteUrl
      const url = new URL(res.body.inviteUrl);
      inviteToken = url.searchParams.get('token')!;
      expect(inviteToken).toBeDefined();

      // Verify DB record
      const dbUser = await prisma.user.findUnique({
        where: { id: inviteeUserId },
        include: { accessRoles: true, member: true },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.role).toBe(Role.ADMIN);
      expect(dbUser!.isActive).toBe(false);
      expect(dbUser!.inviteTokenHash).toBeDefined();
      expect(dbUser!.member).toBeDefined();
      expect(dbUser!.member!.firstName).toBe('Test');
      expect(dbUser!.member!.lastName).toBe('Admin');
    });

    it('should prevent logging in with pending invite prior to acceptance', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: inviteeEmail, password: 'AnyPassword123!' })
        .expect(403);

      expect(res.body.message).toContain('Finish setting up your account');
    });

    it('should reject duplicate invitation for an existing account', async () => {
      await request(app.getHttpServer())
        .post('/admin/team/invite')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: inviteeEmail,
          firstName: 'Duplicate',
          lastName: 'Admin',
          phoneNumber: '+2348022222222',
          roleIds: [superAdminRoleId],
        })
        .expect(409);
    });

    it('should reject invalid or malformed invitation tokens on accept-invite', async () => {
      await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({
          token: 'invalid_token_123456789012345678901234567890',
          password: 'NewStrongPassword123!',
        })
        .expect(400);
    });

    it('should reject expired invitation tokens', async () => {
      const expiredToken = 'expired_token_123456789012345678901234567890';
      const expiredUser = await prisma.user.create({
        data: {
          email: `expired_${Date.now()}@tfhc.org`,
          passwordHash: 'dummy',
          role: Role.ADMIN,
          isActive: false,
          inviteTokenHash: hashInviteToken(expiredToken),
          inviteExpiresAt: new Date(Date.now() - 3600000), // Expired 1h ago
        },
      });

      await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({
          token: expiredToken,
          password: 'NewStrongPassword123!',
        })
        .expect(400);

      await prisma.user.delete({ where: { id: expiredUser.id } });
    });

    it('should allow recipient to accept invitation and set password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({
          token: inviteToken,
          password: 'NewAdminPassword123!',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(inviteeEmail);
      expect(res.body.user.role).toBe(Role.ADMIN);

      const dbUser = await prisma.user.findUnique({ where: { id: inviteeUserId } });
      expect(dbUser!.isActive).toBe(true);
      expect(dbUser!.inviteTokenHash).toBeNull();
      expect(dbUser!.inviteAcceptedAt).toBeDefined();
    });

    it('should allow newly activated admin to log in with set password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: inviteeEmail, password: 'NewAdminPassword123!' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe(Role.ADMIN);
    });

    it('should reject already used invitation tokens', async () => {
      await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({
          token: inviteToken,
          password: 'AnotherPassword123!',
        })
        .expect(400);
    });
  });
});
