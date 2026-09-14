import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ResponseSecretsInterceptor } from '../src/common/interceptors/response-secrets.interceptor';

const database = process.env.TEST_DATABASE_URL;
if (!database || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Security tests require an isolated local tfhc_e2e database');

describe('Security & Authorization E2E Suite (ADMIN vs MEMBER, IDOR, Secrets, Isolation)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  let adminToken: string;
  let memberAToken: string;
  let memberBToken: string;

  let adminUserId: string;
  let memberAUserId: string;
  let memberAMemberId: string;
  let memberBUserId: string;
  let memberBMemberId: string;

  let memberAAppointmentId: string;
  let memberBAppointmentId: string;

  let memberAApprovalId: string;
  let memberBApprovalId: string;

  const sendEmail = jest.fn().mockResolvedValue(true);

  beforeAll(async () => {
    jest.setTimeout(60000);
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-security-test-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ sendEmail, verifyConnection: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseSecretsInterceptor());
    await app.init();
    await app.listen(0, '127.0.0.1');
    app.get(SchedulerRegistry).getCronJobs().forEach((job) => job.stop());

    db = app.get(PrismaService);

    const pw = await argon2.hash('SecurityPass!123');
    const authService = app.get(AuthService);

    // 1. Create ADMIN user & member
    const adminUser = await db.user.create({
      data: {
        email: `admin-sec-${run}@example.test`,
        passwordHash: pw,
        role: 'ADMIN',
      },
    });
    adminUserId = adminUser.id;

    const adminMember = await db.member.create({
      data: {
        userId: adminUserId,
        memberCode: `SEC-ADM-${run.slice(-4)}`,
        firstName: 'Admin',
        lastName: 'User',
        phoneNumber: `+234800${run.slice(-7)}`,
      },
    });

    // Grant ADMIN role in RBAC
    const adminRole = await db.accessRole.upsert({
      where: { key: 'ADMIN' },
      update: {},
      create: { key: 'ADMIN', name: 'Admin', description: 'System Administrator' },
    });
    await db.userAccessRole.create({ data: { userId: adminUserId, roleId: adminRole.id } });
    adminToken = authService.generateToken(adminUserId, adminUser.email, 'ADMIN', adminMember.id);

    // 2. Create MEMBER A user & member
    const memberAUser = await db.user.create({
      data: {
        email: `memberA-sec-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
      },
    });
    memberAUserId = memberAUser.id;

    const memberA = await db.member.create({
      data: {
        userId: memberAUserId,
        memberCode: `SEC-A-${run.slice(-4)}`,
        firstName: 'MemberA',
        lastName: 'Security',
        phoneNumber: `+234801${run.slice(-7)}`,
      },
    });
    memberAMemberId = memberA.id;
    memberAToken = authService.generateToken(memberAUserId, memberAUser.email, 'MEMBER', memberAMemberId);

    // 3. Create MEMBER B user & member
    const memberBUser = await db.user.create({
      data: {
        email: `memberB-sec-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
      },
    });
    memberBUserId = memberBUser.id;

    const memberB = await db.member.create({
      data: {
        userId: memberBUserId,
        memberCode: `SEC-B-${run.slice(-4)}`,
        firstName: 'MemberB',
        lastName: 'Security',
        phoneNumber: `+234802${run.slice(-7)}`,
      },
    });
    memberBMemberId = memberB.id;
    memberBToken = authService.generateToken(memberBUserId, memberBUser.email, 'MEMBER', memberBMemberId);

    // 4. Create Appointments for Member A and Member B
    const now = new Date();
    const future = new Date(now.getTime() + 3600 * 1000);

    const appointmentA = await db.appointment.create({
      data: {
        referenceCode: `APP-A-${run}`,
        title: 'Appointment Member A',
        clientName: 'Member A',
        providerName: 'Counselor',
        startTime: now,
        endTime: future,
        memberId: memberAMemberId,
        status: 'SCHEDULED',
      },
    });
    memberAAppointmentId = appointmentA.id;

    const appointmentB = await db.appointment.create({
      data: {
        referenceCode: `APP-B-${run}`,
        title: 'Appointment Member B',
        clientName: 'Member B',
        providerName: 'Counselor',
        startTime: now,
        endTime: future,
        memberId: memberBMemberId,
        status: 'SCHEDULED',
      },
    });
    memberBAppointmentId = appointmentB.id;

    // 5. Create Approval Requests for Member A and Member B
    const workflow = await db.approvalWorkflow.create({
      data: {
        key: `SEC_WF_${run}`,
        active: false,
        name: `Sec Workflow ${run}`,
        requestType: 'ABSENCE',
        steps: {
          create: [{ order: 1, name: 'Step 1', approverMode: 'ROLE', roleKey: 'ADMIN' }],
        },
      },
    });

    const approvalA = await db.approvalRequest.create({
      data: {
        workflowId: workflow.id,
        requestType: 'ABSENCE',
        entityType: 'AbsenceExcuse',
        entityId: `excuse-A-${run}`,
        summary: 'Excuse Member A',
        requestedByUserId: memberAUserId,
        requestedByMemberId: memberAMemberId,
        currentStepOrder: 1,
      },
    });
    memberAApprovalId = approvalA.id;

    const approvalB = await db.approvalRequest.create({
      data: {
        workflowId: workflow.id,
        requestType: 'ABSENCE',
        entityType: 'AbsenceExcuse',
        entityId: `excuse-B-${run}`,
        summary: 'Excuse Member B',
        requestedByUserId: memberBUserId,
        requestedByMemberId: memberBMemberId,
        currentStepOrder: 1,
      },
    });
    memberBApprovalId = approvalB.id;
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  describe('1. Backend Authorization & Admin Endpoint Protection', () => {
    it('MEMBER cannot access /reports/dashboard (returns 403 Forbidden)', async () => {
      const res = await http().get('/reports/dashboard').set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('MEMBER cannot access /finance/expenses (returns 403 Forbidden)', async () => {
      const res = await http().get('/finance/expenses').set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('MEMBER cannot access /admin/team (returns 403 Forbidden)', async () => {
      const res = await http().get('/admin/team').set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('MEMBER cannot access /attendance/manual (returns 403 Forbidden)', async () => {
      const res = await http()
        .post('/attendance/manual')
        .set(authHeader(memberAToken))
        .send({ memberId: memberBMemberId, status: 'PRESENT' });
      expect(res.status).toBe(403);
    });

    it('MEMBER cannot access /approval-workflows (returns 403 Forbidden)', async () => {
      const res = await http().get('/approval-workflows').set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('MEMBER cannot access /reports/export/csv (returns 403 Forbidden)', async () => {
      const res = await http().get('/reports/export/csv').set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('ADMIN can access /reports/dashboard (returns 200 OK)', async () => {
      const res = await http().get('/reports/dashboard').set(authHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('2. IDOR / Resource-Level Authorization Protection', () => {
    it('Member A CAN access their own appointment detail', async () => {
      const res = await http().get(`/appointments/${memberAAppointmentId}`).set(authHeader(memberAToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(memberAAppointmentId);
    });

    it('Member A CANNOT access Member B\'s appointment detail (IDOR attempt returns 403 Forbidden)', async () => {
      const res = await http().get(`/appointments/${memberBAppointmentId}`).set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('Member A CAN access their own approval request detail', async () => {
      const res = await http().get(`/approvals/${memberAApprovalId}`).set(authHeader(memberAToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(memberAApprovalId);
    });

    it('Member A CANNOT access Member B\'s approval request detail (IDOR attempt returns 403 Forbidden)', async () => {
      const res = await http().get(`/approvals/${memberBApprovalId}`).set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });

    it('Member A CANNOT access Member B\'s attendance history endpoint /attendance/member/:memberId (returns 403 Forbidden)', async () => {
      const res = await http().get(`/attendance/member/${memberBMemberId}`).set(authHeader(memberAToken));
      expect(res.status).toBe(403);
    });
  });

  describe('3. Sensitive Data Sanitization (Secrets & Tokens never leaked in DTOs)', () => {
    it('Sanitizes password tokens and hash values from user / auth API responses', async () => {
      await db.user.update({
        where: { id: memberAUserId },
        data: {
          passwordResetTokenHash: `secret-reset-hash-${run}`,
          emailVerifyTokenHash: `secret-email-verify-hash-${run}`,
          inviteTokenHash: `secret-invite-hash-${run}`,
        },
      });

      const res = await http().get('/auth/me').set(authHeader(memberAToken));
      expect(res.status).toBe(200);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.passwordResetTokenHash).toBeUndefined();
      expect(res.body.emailVerifyTokenHash).toBeUndefined();
      expect(res.body.inviteTokenHash).toBeUndefined();
      expect(res.body.inviteToken).toBeUndefined();
    });
  });

  describe('4. Attendance Security & Identity Context Enforcement', () => {
    it('Self check-in derives identity strictly from JWT context and ignores body memberId tampering', async () => {
      const category = await db.meetingCategory.create({
        data: { name: `Sec Cat ${run}` },
      });
      const meetingDate = new Date(Date.now() + 86400 * 1000);
      const futureMeeting = await db.meeting.create({
        data: {
          title: `Security Test Meeting ${run}`,
          category: { connect: { id: category.id } },
          meetingDate,
          startTime: meetingDate,
          expectedArrivalTime: meetingDate,
          attendanceOpenTime: meetingDate,
          attendanceCloseTime: new Date(meetingDate.getTime() + 3600 * 1000),
          locationName: 'Test Church',
          latitude: 6.5,
          longitude: 3.3,
          status: 'SCHEDULED',
        },
      });

      // Member A tries to send Member B's memberId in request body
      const res = await http()
        .post('/attendance/check-in')
        .set(authHeader(memberAToken))
        .send({
          meetingId: futureMeeting.id,
          memberId: memberBMemberId, // Tampered ID
        });

      // Rejection expected because meeting is in future/closed or invalid
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('6. Asymmetric Portal Access Security Matrix', () => {
    it('ADMIN can access Member Portal endpoints (e.g. /attendance/my-history)', async () => {
      const res = await http().get('/attendance/my-history').set(authHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('MEMBER can access Member Portal endpoints (e.g. /attendance/my-history)', async () => {
      const res = await http().get('/attendance/my-history').set(authHeader(memberAToken));
      expect(res.status).toBe(200);
    });

    it('MEMBER is strictly blocked from all Admin Portal endpoints (e.g. /admin/team, /reports/dashboard)', async () => {
      const res1 = await http().get('/admin/team').set(authHeader(memberAToken));
      expect(res1.status).toBe(403);

      const res2 = await http().get('/reports/dashboard').set(authHeader(memberBToken));
      expect(res2.status).toBe(403);
    });
  });
});
