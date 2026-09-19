import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '@tfhc/shared';
import * as argon2 from 'argon2';

jest.setTimeout(60000);

describe('Member Lookup Security & Non-Lookup Protection (E2E & Security Tests)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const saRole = await prisma.accessRole.findFirst({ where: { key: 'SUPER_ADMIN' } });
    const adminEmail = `admin_sec_test_${Date.now()}@tfhc.org`;
    const pwdHash = await argon2.hash('AdminPassword123!');

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: pwdHash,
        passwordAuthEnabled: true,
        emailVerifiedAt: new Date(),
        role: Role.ADMIN,
        isActive: true,
        accessRoles: {
          create: [{ roleId: saRole!.id }],
        },
      },
    });
    adminUserId = adminUser.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'AdminPassword123!' })
      .expect(200);
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('1. Non-Negotiable Outsider Invitation Prevention', () => {
    it('MUST strictly reject arbitrary outsider email invitation with ForbiddenException', async () => {
      const outsiderEmail = `arbitrary_outsider_${Date.now()}@externaldomain.com`;

      const res = await request(app.getHttpServer())
        .post('/members/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: outsiderEmail,
          firstName: 'External',
          lastName: 'Outsider',
        });

      // Must reject with 403 Forbidden
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/lookup table/i);

      // Verify no ApprovedMember or User was created for this outsider
      const outsiderApproved = await prisma.approvedMember.findUnique({
        where: { normalizedEmail: outsiderEmail.toLowerCase() },
      });
      expect(outsiderApproved).toBeNull();

      const outsiderUser = await prisma.user.findUnique({
        where: { email: outsiderEmail.toLowerCase() },
      });
      expect(outsiderUser).toBeNull();
    });
  });

  describe('2. Lookup Invite Candidates Retrieval (/members/invite-candidates)', () => {
    it('should list only lookup candidates and compute correct eligibility', async () => {
      const eligibleEmail = `candidate_eligible_${Date.now()}@tfhc.org`;
      const registeredEmail = `candidate_registered_${Date.now()}@tfhc.org`;

      // Seed candidate 1: eligible (in lookup, active, no user)
      const ap1 = await prisma.approvedMember.create({
        data: {
          email: eligibleEmail,
          normalizedEmail: eligibleEmail.toLowerCase(),
          status: 'ACTIVE',
          source: 'MANUAL',
        },
      });

      // Seed candidate 2: registered user (in lookup, but already registered)
      const ap2 = await prisma.approvedMember.create({
        data: {
          email: registeredEmail,
          normalizedEmail: registeredEmail.toLowerCase(),
          status: 'ACTIVE',
          source: 'MANUAL',
        },
      });
      const user2 = await prisma.user.create({
        data: {
          email: registeredEmail.toLowerCase(),
          passwordHash: await argon2.hash('Test1234!'),
          passwordAuthEnabled: true,
          emailVerifiedAt: new Date(),
          role: Role.MEMBER,
          isActive: true,
        },
      });
      const member2 = await prisma.member.create({
        data: {
          firstName: 'Registered',
          lastName: 'User',
          phoneNumber: '+2348011112222',
          memberCode: `TFHC-REG-${Date.now().toString().slice(-4)}`,
          status: 'ACTIVE',
          user: { connect: { id: user2.id } },
        },
      });
      await prisma.approvedMember.update({
        where: { id: ap2.id },
        data: { memberId: member2.id, inviteStatus: 'ACCEPTED' },
      });

      const res = await request(app.getHttpServer())
        .get('/members/invite-candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.stats).toBeDefined();

      const item1 = res.body.items.find((i: any) => i.id === ap1.id);
      expect(item1).toBeDefined();
      expect(item1.isEligible).toBe(true);
      expect(item1.accountStatus).toBe('NOT_REGISTERED');
      expect(item1.inviteStatus).toBe('NOT_INVITED');

      const item2 = res.body.items.find((i: any) => i.id === ap2.id);
      expect(item2).toBeDefined();
      expect(item2.isEligible).toBe(false);
      expect(item2.accountStatus).toBe('REGISTERED_PASSWORD');
      expect(item2.inviteStatus).toBe('ACCEPTED');

      // Cleanup
      await prisma.approvedMember.delete({ where: { id: ap1.id } });
      await prisma.approvedMember.delete({ where: { id: ap2.id } });
      await prisma.member.delete({ where: { id: member2.id } });
      await prisma.user.delete({ where: { id: user2.id } });
    });
  });

  describe('3. Bulk Candidate Invitation (/members/invite with approvedMemberIds)', () => {
    it('should bulk invite selected approved member IDs and reject outsiders/already registered', async () => {
      const emailA = `bulk_candidate_a_${Date.now()}@tfhc.org`;
      const emailB = `bulk_candidate_b_${Date.now()}@tfhc.org`;

      const apA = await prisma.approvedMember.create({
        data: { email: emailA, normalizedEmail: emailA.toLowerCase(), status: 'ACTIVE' },
      });
      const apB = await prisma.approvedMember.create({
        data: { email: emailB, normalizedEmail: emailB.toLowerCase(), status: 'ACTIVE' },
      });

      const res = await request(app.getHttpServer())
        .post('/members/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          approvedMemberIds: [apA.id, apB.id, '00000000-0000-0000-0000-000000000000'],
        })
        .expect(201);

      expect(res.body.total).toBe(3);
      expect(res.body.invitedCount).toBe(2);
      expect(res.body.invalidCount).toBe(1);

      // Verify DB records have PENDING inviteStatus
      const updatedA = await prisma.approvedMember.findUnique({ where: { id: apA.id } });
      expect(updatedA!.inviteStatus).toBe('PENDING');

      // Cleanup
      await prisma.approvedMember.delete({ where: { id: apA.id } });
      await prisma.approvedMember.delete({ where: { id: apB.id } });
    });
  });

  describe('4. Revoked Lookup Record Protection', () => {
    it('should reject invitation for revoked / inactive lookup records', async () => {
      const revokedEmail = `revoked_lookup_${Date.now()}@tfhc.org`;
      const apRevoked = await prisma.approvedMember.create({
        data: {
          email: revokedEmail,
          normalizedEmail: revokedEmail.toLowerCase(),
          status: 'REVOKED',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/lookups/approved-members/${apRevoked.id}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/deactivated or revoked/i);

      // Cleanup
      await prisma.approvedMember.delete({ where: { id: apRevoked.id } });
    });
  });

  describe('5. Google OAuth Account Registration Protection', () => {
    it('Google registered users are detected as ALREADY_MEMBER and protected from re-invite', async () => {
      const googleEmail = `google_member_${Date.now()}@tfhc.org`;

      const apGoogle = await prisma.approvedMember.create({
        data: {
          email: googleEmail,
          normalizedEmail: googleEmail.toLowerCase(),
          status: 'ACTIVE',
        },
      });

      const userGoogle = await prisma.user.create({
        data: {
          email: googleEmail.toLowerCase(),
          passwordHash: '',
          googleSubject: `g-sub-${Date.now()}`,
          passwordAuthEnabled: false,
          emailVerifiedAt: new Date(),
          role: Role.MEMBER,
          isActive: true,
        },
      });

      const memberGoogle = await prisma.member.create({
        data: {
          firstName: 'Google',
          lastName: 'User',
          phoneNumber: '+2348033334444',
          memberCode: `TFHC-G-${Date.now().toString().slice(-4)}`,
          status: 'ACTIVE',
          user: { connect: { id: userGoogle.id } },
        },
      });

      await prisma.approvedMember.update({
        where: { id: apGoogle.id },
        data: { memberId: memberGoogle.id, inviteStatus: 'ACCEPTED' },
      });

      // Attempt to invite
      const res = await request(app.getHttpServer())
        .post(`/lookups/approved-members/${apGoogle.id}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.status).toBe('ALREADY_MEMBER');

      // Cleanup
      await prisma.approvedMember.delete({ where: { id: apGoogle.id } });
      await prisma.member.delete({ where: { id: memberGoogle.id } });
      await prisma.user.delete({ where: { id: userGoogle.id } });
    });
  });
});
