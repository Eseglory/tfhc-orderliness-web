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
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) throw new Error('Tests require a local tfhc_e2e database');
if (!database) throw new Error('Set TEST_DATABASE_URL to run API integration tests');

describe('Approval engine + welfare + absence (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  let superToken: string;
  let l1Token: string;
  let l2Token: string;
  let memberToken: string;
  let memberId: string;
  let l1RoleId: string;
  let l2RoleId: string;

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
    const pw = await argon2.hash('E2ePassword!123');

    const superRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    l1RoleId = (await db.accessRole.create({ data: { key: `L1_${run}`, name: `L1 ${run}`, permissions: { create: [{ permission: 'approvals.act' }, { permission: 'approvals.read' }, { permission: 'approvals.configure' }, { permission: 'welfare.read' }] } } })).id;
    l2RoleId = (await db.accessRole.create({ data: { key: `L2_${run}`, name: `L2 ${run}`, permissions: { create: [{ permission: 'approvals.act' }] } } })).id;

    const su = await db.user.create({ data: { email: `apsuper-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await grant(su.id, superRole.id);
    superToken = tokens.generateToken(su.id, su.email, 'ADMIN');

    const u1 = await db.user.create({ data: { email: `apl1-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await grant(u1.id, l1RoleId);
    l1Token = tokens.generateToken(u1.id, u1.email, 'ADMIN');

    const u2 = await db.user.create({ data: { email: `apl2-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await grant(u2.id, l2RoleId);
    l2Token = tokens.generateToken(u2.id, u2.email, 'ADMIN');

    const mem = await db.user.create({
      data: { email: `apmem-${run}@example.test`, passwordHash: pw, role: 'MEMBER', member: { create: { memberCode: `AP-${run}`, firstName: 'App', lastName: 'Member', phoneNumber: '08010000020' } } },
      include: { member: true },
    });
    memberId = mem.member!.id;
    memberToken = tokens.generateToken(mem.id, mem.email, 'MEMBER', memberId);
  }, 45000);

  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
      await db.approvalRequest.deleteMany({ where: { workflow: { key: { contains: run } } } });
      await db.approvalWorkflow.deleteMany({ where: { key: { contains: run } } });
      // Re-activate the seeded default welfare workflow that our test deactivated.
      await db.approvalWorkflow.updateMany({ where: { key: 'WELFARE_FUND_DEFAULT' }, data: { active: true } });
      await db.accessRole.deleteMany({ where: { key: { endsWith: `_${run}` } } });
    }
    if (app) await app.close();
  });

  let workflowId: string;
  test('super admin can define a 2-step workflow; members cannot', async () => {
    await http().get('/approval-workflows').set(auth(memberToken)).expect(403);
    await http().post('/approval-workflows').set(auth(l2Token)).send({}).expect(403); // l2 lacks approvals.configure

    const wf = (
      await http()
        .post('/approval-workflows')
        .set(auth(superToken))
        .send({
          name: `Welfare QA ${run}`,
          requestType: 'WELFARE_FUND',
          steps: [
            { name: 'Level 1', approverMode: 'ROLE', roleKey: `L1_${run}` },
            { name: 'Level 2', approverMode: 'ROLE', roleKey: `L2_${run}` },
          ],
        })
        .expect(201)
    ).body;
    workflowId = wf.id;
    expect(wf.steps).toHaveLength(2);
    expect(wf.active).toBe(false);

    // Activate — deactivates the seeded default for this type.
    await http().patch(`/approval-workflows/${workflowId}`).set(auth(superToken)).send({ active: true }).expect(200);
    const list = (await http().get('/approval-workflows').set(auth(l1Token)).expect(200)).body;
    const active = list.filter((w: any) => w.requestType === 'WELFARE_FUND' && w.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(workflowId);
  });

  let welfareApprovalId: string;
  test('welfare request runs the workflow sequentially (L2 cannot pre-empt L1)', async () => {
    const wr = (
      await http()
        .post('/welfare-requests')
        .set(auth(memberToken))
        .send({ amount: 25000, purpose: 'Medical support for a member', description: 'Hospital bill assistance' })
        .expect(201)
    ).body;
    expect(wr.status).toBe('PENDING');
    welfareApprovalId = wr.approval.id;
    expect(wr.approval.currentStepOrder).toBe(1);

    // L2 tries to act on step 1 → not an approver yet.
    await http().post(`/approvals/${welfareApprovalId}/act`).set(auth(l2Token)).send({ decision: 'APPROVED' }).expect(403);

    // L1 approves step 1 → advances to step 2.
    await http().post(`/approvals/${welfareApprovalId}/act`).set(auth(l1Token)).send({ decision: 'APPROVED', comment: 'verified need' }).expect(201);
    let state = (await http().get(`/approvals/${welfareApprovalId}`).set(auth(superToken)).expect(200)).body;
    expect(state.status).toBe('PENDING');
    expect(state.currentStepOrder).toBe(2);
    expect(state.steps[0].state).toBe('approved');

    // L1 cannot also do step 2.
    await http().post(`/approvals/${welfareApprovalId}/act`).set(auth(l1Token)).send({ decision: 'APPROVED' }).expect(403);

    // L2 approves step 2 → terminal, welfare request approved.
    await http().post(`/approvals/${welfareApprovalId}/act`).set(auth(l2Token)).send({ decision: 'APPROVED' }).expect(201);
    state = (await http().get(`/approvals/${welfareApprovalId}`).set(auth(superToken)).expect(200)).body;
    expect(state.status).toBe('APPROVED');

    const wr2 = (await http().get('/welfare-requests').set(auth(l1Token)).expect(200)).body.find((w: any) => w.id === wr.id);
    expect(wr2.status).toBe('APPROVED');
  });

  test('rejection at level 1 is terminal; double-acting is refused', async () => {
    const wr = (await http().post('/welfare-requests').set(auth(memberToken)).send({ amount: 5000, purpose: 'Transport reimbursement' }).expect(201)).body;
    const id = wr.approval.id;
    await http().post(`/approvals/${id}/act`).set(auth(l1Token)).send({ decision: 'REJECTED' }).expect(400); // reason required
    await http().post(`/approvals/${id}/act`).set(auth(l1Token)).send({ decision: 'REJECTED', comment: 'insufficient documentation' }).expect(201);
    const state = (await http().get(`/approvals/${id}`).set(auth(superToken)).expect(200)).body;
    expect(state.status).toBe('REJECTED');
    // L2 never gets a turn.
    await http().post(`/approvals/${id}/act`).set(auth(l2Token)).send({ decision: 'APPROVED' }).expect(409);
    // requester sees it in "mine"
    const mine = (await http().get('/approvals/mine').set(auth(memberToken)).expect(200)).body;
    expect(mine.find((r: any) => r.id === id).status).toBe('REJECTED');
  });

  test('pending queue only shows requests the caller can currently act on', async () => {
    const wr = (await http().post('/welfare-requests').set(auth(memberToken)).send({ amount: 12000, purpose: 'Feeding programme top-up' }).expect(201)).body;
    const id = wr.approval.id;
    const l1Pending = (await http().get('/approvals/pending?type=WELFARE_FUND').set(auth(l1Token)).expect(200)).body;
    const l2Pending = (await http().get('/approvals/pending?type=WELFARE_FUND').set(auth(l2Token)).expect(200)).body;
    expect(l1Pending.map((r: any) => r.id)).toContain(id);
    expect(l2Pending.map((r: any) => r.id)).not.toContain(id);
    await http().get('/approvals/pending').set(auth(memberToken)).expect(403);
  });

  test('absence excuses now run through the 2-level default workflow', async () => {
    const cat = await db.meetingCategory.create({ data: { name: `AP-cat-${run}` } });
    const meeting = await db.meeting.create({
      data: {
        title: `AP meeting ${run}`,
        categoryId: cat.id,
        meetingDate: new Date(Date.now() + 3600000),
        startTime: new Date(Date.now() + 3600000),
        expectedArrivalTime: new Date(Date.now() + 1800000),
        attendanceOpenTime: new Date(Date.now() + 1800000),
        attendanceCloseTime: new Date(Date.now() + 7200000),
        locationName: 'Church',
        latitude: 6.5,
        longitude: 3.3,
      },
    });
    const excuse = (await http().post('/excuses').set(auth(memberToken)).send({ meetingId: meeting.id, reason: 'Travelling for work', category: 'WORK' }).expect(201)).body;
    const row = await db.absenceExcuse.findUniqueOrThrow({ where: { id: excuse.id } });
    expect(row.approvalRequestId).toBeTruthy();
    const approval = (await http().get(`/approvals/${row.approvalRequestId}`).set(auth(superToken)).expect(200)).body;
    expect(approval.requestType).toBe('ABSENCE');
    expect(approval.steps).toHaveLength(2);

    // Super admin fast-tracks both steps via the legacy review endpoint.
    await http().put(`/excuses/${excuse.id}/review`).set(auth(superToken)).send({ status: 'APPROVED' }).expect(200);
    expect((await db.absenceExcuse.findUniqueOrThrow({ where: { id: excuse.id } })).status).toBe('APPROVED');
    expect(await db.attendanceRecord.count({ where: { meetingId: meeting.id, status: 'EXCUSED' } })).toBe(1);

    await db.meeting.delete({ where: { id: meeting.id } });
    await db.meetingCategory.delete({ where: { id: cat.id } });
  });
});
