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

describe('Finance: expenses, dues, payments (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  let superToken: string;
  let financeToken: string;
  let memberToken: string;
  let memberId: string;
  let categoryId: string;

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

    const su = await db.user.create({ data: { email: `finsuper-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await db.userAccessRole.create({ data: { userId: su.id, roleId: (await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } })).id } });
    superToken = tokens.generateToken(su.id, su.email, 'ADMIN');

    const fin = await db.user.create({ data: { email: `finuser-${run}@example.test`, passwordHash: pw, role: 'ADMIN' } });
    await db.userAccessRole.create({ data: { userId: fin.id, roleId: (await db.accessRole.findUniqueOrThrow({ where: { key: 'FINANCE' } })).id } });
    financeToken = tokens.generateToken(fin.id, fin.email, 'ADMIN');

    const mem = await db.user.create({
      data: { email: `finmem-${run}@example.test`, passwordHash: pw, role: 'MEMBER', member: { create: { memberCode: `FIN-${run}`, firstName: 'Fin', lastName: 'Member', phoneNumber: '08010000030' } } },
      include: { member: true },
    });
    memberId = mem.member!.id;
    memberToken = tokens.generateToken(mem.id, mem.email, 'MEMBER', memberId);

    categoryId = (await http().get('/finance/expense-categories').set(auth(financeToken)).expect(200)).body[0].id;
  }, 45000);

  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.payment.deleteMany({ where: { member: { memberCode: { contains: run } } } });
      await db.duesPeriod.deleteMany({ where: { year: { gte: 2090 } } });
      await db.expense.deleteMany({ where: { createdByUser: { email: { endsWith: `-${run}@example.test` } } } });
      await db.approvalRequest.deleteMany({ where: { entityType: 'Expense', requestedByUserId: null } });
      await db.paymentAccount.deleteMany({ where: { bankName: { contains: 'QA Bank' } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
    }
    if (app) await app.close();
  });

  test('expenses run the 2-level EXPENSE workflow then can be marked paid', async () => {
    await http().get('/finance/expenses').set(auth(memberToken)).expect(403);

    const expense = (
      await http()
        .post('/finance/expenses')
        .set(auth(financeToken))
        .send({ title: `Diesel refill ${run}`, categoryId, amount: 48000, incurredOn: '2026-09-01', vendorName: 'Total' })
        .expect(201)
    ).body;
    expect(expense.status).toBe('DRAFT');
    expect(expense.reference).toMatch(/^EXP-\d{6}-/);

    const submitted = (await http().post(`/finance/expenses/${expense.id}/submit`).set(auth(financeToken)).expect(201)).body;
    expect(submitted.status).toBe('PENDING_APPROVAL');
    expect(submitted.approval.steps).toHaveLength(2);

    const approvalId = submitted.approval.id;
    // FINANCE user is step 1; super admin is step 2.
    await http().post(`/approvals/${approvalId}/act`).set(auth(financeToken)).send({ decision: 'APPROVED' }).expect(201);
    await http().post(`/approvals/${approvalId}/act`).set(auth(superToken)).send({ decision: 'APPROVED' }).expect(201);

    const approved = (await http().get(`/finance/expenses/${expense.id}`).set(auth(financeToken)).expect(200)).body;
    expect(approved.status).toBe('APPROVED');

    const paid = (await http().post(`/finance/expenses/${expense.id}/pay`).set(auth(superToken)).send({ paymentMethod: 'BANK_TRANSFER', paymentReference: 'TRX999' }).expect(201)).body;
    expect(paid.status).toBe('PAID');

    // A paid expense is locked.
    await http().patch(`/finance/expenses/${expense.id}`).set(auth(financeToken)).send({ title: 'nope' }).expect(400);
  });

  test('payment accounts: configure (staff) and members see only active ones', async () => {
    await http().post('/finance/payment-accounts').set(auth(memberToken)).send({}).expect(403);
    const acct = (
      await http()
        .post('/finance/payment-accounts')
        .set(auth(superToken))
        .send({ bankName: `QA Bank ${run}`, accountName: 'TFHC Orderliness', accountNumber: '0123456789', instructions: 'Use your member code as reference' })
        .expect(201)
    ).body;
    await http().patch(`/finance/payment-accounts/${acct.id}`).set(auth(superToken)).send({ isActive: false }).expect(200);
    const memberView = (await http().get('/me/finance/payment-accounts').set(auth(memberToken)).expect(200)).body;
    expect(memberView.find((a: any) => a.id === acct.id)).toBeUndefined();
    await http().patch(`/finance/payment-accounts/${acct.id}`).set(auth(superToken)).send({ isActive: true }).expect(200);
    const memberView2 = (await http().get('/me/finance/payment-accounts').set(auth(memberToken)).expect(200)).body;
    expect(memberView2.find((a: any) => a.id === acct.id)).toBeTruthy();
  });

  test('monthly dues: period generates assignments; member pays; finance confirms; status updates', async () => {
    const period = (
      await http()
        .post('/finance/dues/periods')
        .set(auth(financeToken))
        .send({ year: 2099, month: 3, defaultAmount: 5000, dueDate: '2099-03-10' })
        .expect(201)
    ).body;
    expect(period.period.label).toBe('March 2099');
    expect(period.assignments.length).toBeGreaterThan(0);

    const mine = (await http().get('/me/finance/dues').set(auth(memberToken)).expect(200)).body;
    const assignment = mine.find((d: any) => d.periodId === period.period.id);
    expect(assignment).toBeTruthy();
    expect(assignment.amountDue).toBe(5000);
    expect(assignment.status).toBe('OUTSTANDING');

    // Member declares a partial payment.
    const pay = (
      await http()
        .post('/me/finance/payments')
        .set(auth(memberToken))
        .send({ purpose: 'MONTHLY_DUES', amount: 2000, method: 'BANK_TRANSFER', payerReference: 'MEMBERTRX1', duesAssignmentId: assignment.id, paidOn: '2099-03-05' })
        .expect(201)
    ).body;
    expect(pay.status).toBe('PENDING');

    // Nothing applied until confirmed.
    let period2 = (await http().get(`/finance/dues/periods/${period.period.id}`).set(auth(financeToken)).expect(200)).body;
    expect(period2.summary.collected).toBe(0);

    await http().post(`/finance/payments/${pay.id}/confirm`).set(auth(financeToken)).expect(201);
    period2 = (await http().get(`/finance/dues/periods/${period.period.id}`).set(auth(financeToken)).expect(200)).body;
    expect(period2.summary.collected).toBe(2000);
    const a2 = period2.assignments.find((a: any) => a.member.id === memberId);
    expect(a2.status).toBe('PARTIALLY_PAID');
    expect(a2.balance).toBe(3000);

    // Finance records the balance directly (auto-confirmed) → PAID.
    await http()
      .post('/finance/payments/record')
      .set(auth(financeToken))
      .send({ memberId, purpose: 'MONTHLY_DUES', amount: 3000, method: 'CASH', duesAssignmentId: assignment.id, paidOn: '2099-03-08' })
      .expect(201);
    period2 = (await http().get(`/finance/dues/periods/${period.period.id}`).set(auth(financeToken)).expect(200)).body;
    expect(period2.assignments.find((a: any) => a.member.id === memberId).status).toBe('PAID');

    // Exemption path.
    const a3 = period2.assignments.find((a: any) => a.member.id === memberId);
    await http().post(`/finance/dues/assignments/${a3.id}/status`).set(auth(financeToken)).send({ status: 'EXEMPT', reason: 'on leave' }).expect(201);
  });

  test('finance dashboard aggregates', async () => {
    await http().get('/finance/dashboard').set(auth(memberToken)).expect(403);
    const d = (await http().get('/finance/dashboard').set(auth(financeToken)).expect(200)).body;
    expect(d.expenses).toBeDefined();
    expect(typeof d.payments.pending).toBe('number');
    expect(Array.isArray(d.duesTrend)).toBe(true);
  });

  test('a FINANCE user cannot touch member management (RBAC separation)', async () => {
    await http().get('/admin/team').set(auth(financeToken)).expect(403);
    await http().post('/meetings').set(auth(financeToken)).send({}).expect(403);
  });
});
