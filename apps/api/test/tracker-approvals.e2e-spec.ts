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

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) {
  throw new Error('Tests require a local tfhc_e2e database');
}
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('Full E2E: Tracking, Approvals, Excuses & Follow-Up (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  let superToken: string;
  let leaderToken: string;
  let memberToken: string;
  let memberId: string;

  let leaderRoleId: string;

  let testMeetingId: string;
  let testCategoryId: string;

  const grant = async (userId: string, roleId: string) => db.userAccessRole.create({ data: { userId, roleId } });

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
    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2eTrackerPass!123');

    const superRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    leaderRoleId = (
      await db.accessRole.create({
        data: {
          key: `TRACKER_LEADER_${run}`,
          name: `Tracker Leader ${run}`,
          permissions: {
            create: [
              { permission: 'approvals.act' },
              { permission: 'approvals.read' },
              { permission: 'excuses.review' },
              { permission: 'corrections.review' },
              { permission: 'welfare.read' },
            ],
          },
        },
      })
    ).id;

    // 1. Super Admin User
    const su = await db.user.create({
      data: { email: `trackersuper-${run}@example.test`, passwordHash: pw, role: 'ADMIN' },
    });
    await grant(su.id, superRole.id);
    superToken = tokens.generateToken(su.id, su.email, 'ADMIN');

    // 2. Leader User
    const lu = await db.user.create({
      data: { email: `trackerleader-${run}@example.test`, passwordHash: pw, role: 'LEADER' },
    });
    await grant(lu.id, leaderRoleId);
    leaderToken = tokens.generateToken(lu.id, lu.email, 'LEADER');

    // 3. Member User
    const mem = await db.user.create({
      data: {
        email: `trackermem-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
        member: {
          create: {
            memberCode: `TRK-${run}`,
            firstName: 'Regular',
            lastName: 'Member',
            phoneNumber: '08099887766',
          },
        },
      },
      include: { member: true },
    });
    memberId = mem.member!.id;
    memberToken = tokens.generateToken(mem.id, mem.email, 'MEMBER', memberId);

    // 4. Test Meeting & Category
    const cat = await db.meetingCategory.create({ data: { name: `Tracker Cat ${run}` } });
    testCategoryId = cat.id;

    const meeting = await db.meeting.create({
      data: {
        title: `Tracker Gathering ${run}`,
        categoryId: cat.id,
        meetingDate: new Date(Date.now() + 7200000),
        startTime: new Date(Date.now() + 7200000),
        expectedArrivalTime: new Date(Date.now() + 3600000),
        attendanceOpenTime: new Date(Date.now() + 3600000),
        attendanceCloseTime: new Date(Date.now() + 10800000),
        locationName: 'Faith Sanctuary',
        latitude: 6.5244,
        longitude: 3.3792,
      },
    });
    testMeetingId = meeting.id;
  }, 45000);

  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
      await db.approvalRequest.deleteMany({ where: { workflow: { key: { contains: run } } } });
      await db.approvalWorkflow.deleteMany({ where: { key: { contains: run } } });
      await db.approvalWorkflow.updateMany({ where: { key: 'WELFARE_FUND_DEFAULT' }, data: { active: true } });
      await db.approvalWorkflow.updateMany({ where: { key: 'EXPENSE_DEFAULT' }, data: { active: true } });
      await db.approvalWorkflow.updateMany({ where: { key: 'ABSENCE_DEFAULT' }, data: { active: true } });
      await db.accessRole.deleteMany({ where: { key: { endsWith: `_${run}` } } });
      if (testMeetingId) await db.meeting.deleteMany({ where: { id: testMeetingId } });
      if (testCategoryId) await db.meetingCategory.deleteMany({ where: { id: testCategoryId } });
    }
    if (app) await app.close();
  });

  describe('1. Workflow Designer & Configuration', () => {
    let workflowId: string;

    test('super admin creates a multi-step custom approval workflow', async () => {
      const res = await http()
        .post('/approval-workflows')
        .set(auth(superToken))
        .send({
          name: `Custom Expense Chain ${run}`,
          requestType: 'EXPENSE',
          description: 'Departmental expense sign-off chain',
          steps: [
            { name: 'Leader Sign-Off', approverMode: 'ROLE', roleKey: `TRACKER_LEADER_${run}` },
            { name: 'Super Admin Release', approverMode: 'ROLE', roleKey: 'SUPER_ADMIN' },
          ],
        })
        .expect(201);

      workflowId = res.body.id;
      expect(res.body.name).toBe(`Custom Expense Chain ${run}`);
      expect(res.body.steps).toHaveLength(2);
      expect(res.body.active).toBe(false);
    });

    test('members cannot create or modify workflows (RBAC 403)', async () => {
      await http().post('/approval-workflows').set(auth(memberToken)).send({ name: 'Hack' }).expect(403);
      await http().patch(`/approval-workflows/${workflowId}`).set(auth(memberToken)).send({ active: true }).expect(403);
      await http().delete(`/approval-workflows/${workflowId}`).set(auth(memberToken)).expect(403);
    });

    test('super admin activates and then deletes workflow', async () => {
      await http().patch(`/approval-workflows/${workflowId}`).set(auth(superToken)).send({ active: true }).expect(200);
      const list = (await http().get('/approval-workflows').set(auth(superToken)).expect(200)).body;
      const found = list.find((w: any) => w.id === workflowId);
      expect(found.active).toBe(true);

      await http().delete(`/approval-workflows/${workflowId}`).set(auth(superToken)).expect(200);
      const afterList = (await http().get('/approval-workflows').set(auth(superToken)).expect(200)).body;
      expect(afterList.find((w: any) => w.id === workflowId)).toBeUndefined();
      // Restore default expense workflow
      await db.approvalWorkflow.updateMany({ where: { key: 'EXPENSE_DEFAULT' }, data: { active: true } });
    });
  });

  describe('2. Multi-Level Approvals & Rejection Validation', () => {
    let welfareApprovalId: string;

    beforeAll(async () => {
      // Deactivate seeded welfare workflow for our test isolation
      await db.approvalWorkflow.updateMany({ where: { requestType: 'WELFARE_FUND' }, data: { active: false } });
      await db.approvalWorkflow.create({
        data: {
          key: `WF_WELFARE_${run}`,
          name: `Welfare Multi-Level ${run}`,
          requestType: 'WELFARE_FUND',
          active: true,
          steps: {
            create: [
              { order: 1, name: 'Leader Review', approverMode: 'ROLE', roleKey: `TRACKER_LEADER_${run}` },
              { order: 2, name: 'Executive Sign-off', approverMode: 'ROLE', roleKey: 'SUPER_ADMIN' },
            ],
          },
        },
      });
    });

    test('welfare request attaches to workflow and enforces rejection reason', async () => {
      const wr = (
        await http()
          .post('/welfare-requests')
          .set(auth(memberToken))
          .send({ amount: 30000, purpose: 'Family benevolence support', description: 'Urgent medical assistance' })
          .expect(201)
      ).body;

      welfareApprovalId = wr.approval.id;
      expect(wr.status).toBe('PENDING');

      // Rejection without comment throws 400
      await http()
        .post(`/approvals/${welfareApprovalId}/act`)
        .set(auth(leaderToken))
        .send({ decision: 'REJECTED' })
        .expect(400);

      // Rejection with comment succeeds
      await http()
        .post(`/approvals/${welfareApprovalId}/act`)
        .set(auth(leaderToken))
        .send({ decision: 'REJECTED', comment: 'Documentation incomplete for this cycle' })
        .expect(201);

      const updatedReq = (await http().get(`/approvals/${welfareApprovalId}`).set(auth(superToken)).expect(200)).body;
      expect(updatedReq.status).toBe('REJECTED');
      expect(updatedReq.steps[0].state).toBe('rejected');
    });

    test('sequential approval advances through steps to final approval', async () => {
      const wr = (
        await http()
          .post('/welfare-requests')
          .set(auth(memberToken))
          .send({ amount: 15000, purpose: 'Transport stipend' })
          .expect(201)
      ).body;
      const reqId = wr.approval.id;

      // Step 1: Leader approves
      await http()
        .post(`/approvals/${reqId}/act`)
        .set(auth(leaderToken))
        .send({ decision: 'APPROVED', comment: 'Verified needs' })
        .expect(201);

      let current = (await http().get(`/approvals/${reqId}`).set(auth(superToken)).expect(200)).body;
      expect(current.status).toBe('PENDING');
      expect(current.currentStepOrder).toBe(2);

      // Step 2: Super Admin approves -> terminal APPROVED
      await http()
        .post(`/approvals/${reqId}/act`)
        .set(auth(superToken))
        .send({ decision: 'APPROVED', comment: 'Funds cleared' })
        .expect(201);

      current = (await http().get(`/approvals/${reqId}`).set(auth(superToken)).expect(200)).body;
      expect(current.status).toBe('APPROVED');
    });
  });

  describe('3. Absence Excuses & Attendance Corrections', () => {
    let excuseId: string;

    test('member submits absence excuse and admin reviews it', async () => {
      const excuse = (
        await http()
          .post('/excuses')
          .set(auth(memberToken))
          .send({
            meetingId: testMeetingId,
            reason: 'Attending family wedding out of town',
            category: 'FAMILY',
          })
          .expect(201)
      ).body;

      excuseId = excuse.id;
      expect(excuse.status).toBe('PENDING');

      // Admin reviews excuse with note
      await http()
        .put(`/excuses/${excuseId}/review`)
        .set(auth(superToken))
        .send({ status: 'APPROVED', reviewNote: 'Granted for family engagement' })
        .expect(200);

      const row = await db.absenceExcuse.findUniqueOrThrow({ where: { id: excuseId } });
      expect(row.status).toBe('APPROVED');

      // Check that attendance record was created as EXCUSED with 0 points
      const record = await db.attendanceRecord.findUnique({
        where: { memberId_meetingId: { memberId, meetingId: testMeetingId } },
      });
      expect(record).not.toBeNull();
      expect(record!.status).toBe('EXCUSED');
      expect(record!.pointsEarned).toBe(0);
    });

    test('member submits correction request and admin approves it', async () => {
      const corr = (
        await http()
          .post('/excuses/corrections')
          .set(auth(memberToken))
          .send({
            meetingId: testMeetingId,
            reason: 'Device battery died, arrived on time with unit leader',
            requestedStatus: 'ON_TIME',
          })
          .expect(201)
      ).body;

      expect(corr.status).toBe('PENDING');

      // Admin reviews and approves correction
      await http()
        .put(`/excuses/corrections/${corr.id}/review`)
        .set(auth(leaderToken))
        .send({ status: 'APPROVED' })
        .expect(200);

      const record = await db.attendanceRecord.findUnique({
        where: { memberId_meetingId: { memberId, meetingId: testMeetingId } },
      });
      expect(record!.status).toBe('ON_TIME');
      expect(record!.method).toBe('CORRECTION_APPROVED');
    });
  });

  describe('4. Follow-Up Flags & Scanner', () => {
    let flagId: string;

    test('evaluates follow-up flags via scanner', async () => {
      const evaluated = (await http().post('/alerts/evaluate').set(auth(superToken)).expect(201)).body;
      expect(Array.isArray(evaluated)).toBe(true);

      const flags = (await http().get('/alerts').set(auth(leaderToken)).expect(200)).body;
      expect(Array.isArray(flags)).toBe(true);

      // Create a test flag if none active
      let flag = flags[0];
      if (!flag) {
        flag = await db.followUpFlag.create({
          data: {
            memberId,
            flagLevel: 3,
            flagReason: 'E2E Test: 3 consecutive absences detected',
            isResolved: false,
          },
        });
      }
      flagId = flag.id;
      expect(flag.isResolved).toBe(false);
    });

    test('resolves follow-up flag with notes', async () => {
      const resolved = (
        await http()
          .put(`/alerts/${flagId}/resolve`)
          .set(auth(leaderToken))
          .send({ notes: 'Follow-up phone call completed. Member will attend next service.' })
          .expect(200)
      ).body;

      expect(resolved.isResolved).toBe(true);
      expect(resolved.notes).toContain('Follow-up phone call completed');

      const check = await db.followUpFlag.findUniqueOrThrow({ where: { id: flagId } });
      expect(check.isResolved).toBe(true);
    });
  });
});
