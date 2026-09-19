
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '@tfhc/shared';
import * as argon2 from 'argon2';

jest.setTimeout(60000);

describe('Member Lookup Table Invitation Flow (E2E & Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const saRole = await prisma.accessRole.findFirst({ where: { key: 'SUPER_ADMIN' } });
    const adminEmail = `admin_lookup_test_${Date.now()}@tfhc.org`;
    const pwdHash = await argon2.hash('AdminPassword123!');

    await prisma.user.create({
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

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'AdminPassword123!' })
      .expect(200);
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('1. Member Lookup Listing & Status Calculation', () => {
    it('should list approved members with calculated invitation statuses', async () => {
      // Seed an approved member
      const testEmail = `lookup_list_${Date.now()}@tfhc.org`;
      const record = await prisma.approvedMember.create({
        data: {
          email: testEmail,
          normalizedEmail: testEmail,
          status: 'ACTIVE',
          source: 'MANUAL',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/lookups/approved-members')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.stats).toBeDefined();

      const item = res.body.items.find((i: any) => i.id === record.id);
      expect(item).toBeDefined();
      expect(item.inviteStatus).toBe('NOT_INVITED');

      await prisma.approvedMember.delete({ where: { id: record.id } });
    });
  });

  describe('2. Option A: Single User Invitation', () => {
    let approvedRecordId: string;
    let approvedEmail: string;
    let inviteToken: string;

    beforeEach(async () => {
      approvedEmail = `single_invite_${Date.now()}@tfhc.org`;
      const record = await prisma.approvedMember.create({
        data: {
          email: approvedEmail,
          normalizedEmail: approvedEmail,
          status: 'ACTIVE',
          source: 'MANUAL',
        },
      });
      approvedRecordId = record.id;
    });

    it('should invite a single person from the lookup table and return status INVITED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/lookups/approved-members/${approvedRecordId}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.id).toBe(approvedRecordId);
      expect(res.body.email).toBe(approvedEmail);
      expect(res.body.status).toBe('INVITED');
      expect(res.body.inviteUrl).toBeDefined();

      const url = new URL(res.body.inviteUrl);
      inviteToken = url.searchParams.get('token')!;

      // Verify DB record status is PENDING
      const dbApproved = await prisma.approvedMember.findUnique({
        where: { id: approvedRecordId },
        include: { member: { include: { user: true } } },
      });
      expect(dbApproved!.inviteStatus).toBe('PENDING');
      expect(dbApproved!.member).toBeDefined();
      expect(dbApproved!.member!.user).toBeDefined();
      expect(dbApproved!.member!.user!.isActive).toBe(false);
    });

    it('should return ALREADY_PENDING if invitation is already active', async () => {
      // First invite
      await request(app.getHttpServer())
        .post(`/lookups/approved-members/${approvedRecordId}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // Second invite
      const res = await request(app.getHttpServer())
        .post(`/lookups/approved-members/${approvedRecordId}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.status).toBe('ALREADY_PENDING');
    });

    it('should allow recipient to accept invitation and link member account', async () => {
      const inviteRes = await request(app.getHttpServer())
        .post(`/lookups/approved-members/${approvedRecordId}/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const token = new URL(inviteRes.body.inviteUrl).searchParams.get('token')!;

      const acceptRes = await request(app.getHttpServer())
        .post('/auth/accept-invite')
        .send({
          token,
          password: 'MemberPassword123!',
        })
        .expect(201);

      expect(acceptRes.body.accessToken).toBeDefined();
      expect(acceptRes.body.user.email).toBe(approvedEmail);
      expect(acceptRes.body.user.role).toBe(Role.MEMBER);

      // Check DB state transition to ACCEPTED
      const dbApproved = await prisma.approvedMember.findUnique({ where: { id: approvedRecordId } });
      expect(dbApproved!.inviteStatus).toBe('ACCEPTED');
    });
  });

  describe('3. Option B: Selected Users Bulk Invitation', () => {
    it('should process selected users and return detailed result summary breakdown', async () => {
      const email1 = `bulk_sel_1_${Date.now()}@tfhc.org`;
      const email2 = `bulk_sel_2_${Date.now()}@tfhc.org`;

      const r1 = await prisma.approvedMember.create({
        data: { email: email1, normalizedEmail: email1, status: 'ACTIVE' },
      });
      const r2 = await prisma.approvedMember.create({
        data: { email: email2, normalizedEmail: email2, status: 'ACTIVE' },
      });

      const res = await request(app.getHttpServer())
        .post('/lookups/approved-members/invite-selected')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [r1.id, r2.id] })
        .expect(201);

      expect(res.body.total).toBe(2);
      expect(res.body.invitedCount).toBe(2);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].status).toBe('INVITED');
      expect(res.body.results[1].status).toBe('INVITED');
    });
  });

  describe('4. Option C: Invite All Eligible Users', () => {
    it('should process all eligible users in lookup table safely without duplicates', async () => {
      const emailEligible = `all_eligible_${Date.now()}@tfhc.org`;
      await prisma.approvedMember.create({
        data: { email: emailEligible, normalizedEmail: emailEligible, status: 'ACTIVE' },
      });

      const res = await request(app.getHttpServer())
        .post('/lookups/approved-members/invite-all-eligible')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.totalInLookupTable).toBeGreaterThanOrEqual(1);
      expect(res.body.eligibleCount).toBeGreaterThanOrEqual(1);
      expect(res.body.invitedCount).toBeGreaterThanOrEqual(1);

      // Re-invoking when everyone has pending/accepted should skip them safely
      const secondRes = await request(app.getHttpServer())
        .post('/lookups/approved-members/invite-all-eligible')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(secondRes.body.eligibleCount).toBe(0);
      expect(secondRes.body.invitedCount).toBe(0);
    });
  });
});
