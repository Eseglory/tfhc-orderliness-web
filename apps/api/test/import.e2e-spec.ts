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

describe('Directory + dues import (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());
  let adminToken: string;
  let memberToken: string;

  const dom = (n: string) => `${n}-${run}@import.test`;

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());
    db = app.get(PrismaService);
    await app.get(RbacService).syncSystemRoles();
    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2ePassword!123');

    await db.payment.deleteMany({ where: { member: { OR: [{ approvedMember: { normalizedEmail: { contains: '@import.test' } } }, { memberCode: { contains: 'IMP-' } }] } } });
    await db.memberDuesAssignment.deleteMany({ where: { period: { year: 2091 } } });
    await db.duesPeriod.deleteMany({ where: { year: 2091 } });
    await db.approvedMember.deleteMany({ where: { normalizedEmail: { contains: '@import.test' } } });
    await db.user.deleteMany({ where: { email: { endsWith: '@import.test' } } });
    await db.member.deleteMany({ where: { OR: [{ memberCode: { contains: 'IMP-' } }, { firstName: { in: ['Grace', 'Chinedu', 'Titi', 'Imp'] } }] } });

    const admin = await db.user.create({ data: { email: dom('impadmin'), passwordHash: pw, role: 'ADMIN' } });
    await db.userAccessRole.create({ data: { userId: admin.id, roleId: (await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } })).id } });
    adminToken = tokens.generateToken(admin.id, admin.email, 'ADMIN');

    const m = await db.user.create({
      data: { email: dom('impmem'), passwordHash: pw, role: 'MEMBER', member: { create: { memberCode: `IMP-${run}`, firstName: 'Imp', lastName: 'Member', phoneNumber: '08010000040' } } },
      include: { member: true },
    });
    memberToken = tokens.generateToken(m.id, m.email, 'MEMBER', m.member!.id);
  }, 45000);

  afterAll(async () => {
    if (db) {
      await db.payment.deleteMany({ where: { member: { OR: [{ approvedMember: { normalizedEmail: { contains: run } } }, { memberCode: { contains: run } }] } } });
      await db.duesPeriod.deleteMany({ where: { year: 2091 } });
      await db.auditLog.deleteMany({ where: { actorUser: { email: { endsWith: `-${run}@import.test` } } } });
      await db.approvedMember.deleteMany({ where: { normalizedEmail: { contains: run } } });
      await db.user.deleteMany({ where: { email: { endsWith: `-${run}@import.test` } } });
      await db.member.deleteMany({ where: { OR: [{ memberCode: { contains: run } }, { firstName: { in: ['Titi', 'Grace'] }, phoneNumber: 'UNVERIFIED' }] } });
    }
    if (app) await app.close();
  });

  const directory = () => ({
    rows: [
      { firstName: 'Grace', lastName: 'Adeyemi', email: dom('grace'), phoneNumber: '0803 000 1111', birthday: '3rd October', profession: 'Nurse' },
      { firstName: 'Chinedu', lastName: 'Okoro', email: dom('chinedu'), phoneNumber: '08030002222', birthday: '15 June', profession: '' },
      { firstName: 'bad', lastName: '', email: 'not-an-email', phoneNumber: '123' },
    ],
  });

  test('directory import: dry run then apply, linking by email', async () => {
    await http().post('/members/import').set(auth(memberToken)).send(directory()).expect(403);

    const dry = (await http().post('/members/import').set(auth(adminToken)).send({ ...directory(), apply: false }).expect(201)).body;
    expect(dry.dryRun).toBe(true);
    expect(dry.created).toHaveLength(2);
    expect(dry.errors).toHaveLength(1);
    expect(await db.member.count({ where: { firstName: 'Grace', lastName: 'Adeyemi' } })).toBe(0);

    const applied = (await http().post('/members/import').set(auth(adminToken)).send({ ...directory(), apply: true }).expect(201)).body;
    expect(applied.created).toHaveLength(2);
    const grace = await db.approvedMember.findUniqueOrThrow({ where: { normalizedEmail: dom('grace') }, include: { member: true } });
    expect(grace.member?.profession).toBe('Nurse');
    expect(grace.member?.birthday).toBe('10-03');

    // Re-running is a no-op for unchanged rows.
    const again = (await http().post('/members/import').set(auth(adminToken)).send({ ...directory(), apply: true }).expect(201)).body;
    expect(again.created).toHaveLength(0);
    expect(again.unchanged).toHaveLength(2);
  });

  test('dues matrix import: name → member, historical payments, idempotency', async () => {
    const matrix = {
      year: 2091,
      defaultAmount: 2000,
      dueDayOfMonth: 5,
      aliasEmailMap: {
        'grace adeyemi': dom('grace'),
        'adeyemi grace': dom('grace'),
      },
      createUnmatchedMembers: true,
      apply: true,
      rows: [
        // Matches "Grace Adeyemi" by reversed-name alias.
        { name: 'ADEYEMI GRACE', amount: 2500, paidMonths: [1, 2, 3, 4, 5, 6] },
        // Fuzzy match to "Chinedu Okoro".
        { name: 'Chinedu Okoro', amount: 2000, paidMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
        // Not in the directory → created.
        { name: 'Titi Balogun', amount: 2000, paidMonths: [1, 2], newMember: false },
      ],
    };

    const dry = (await http().post('/finance/dues/import').set(auth(adminToken)).send({ ...matrix, apply: false }).expect(201)).body;
    expect(dry.dryRun).toBe(true);
    expect(await db.duesPeriod.count({ where: { year: 2091 } })).toBe(0);

    const applied = (await http().post('/finance/dues/import').set(auth(adminToken)).send(matrix).expect(201)).body;
    expect(applied.periodsEnsured).toBe(12);
    expect(applied.matched.length).toBe(2);
    expect(applied.createdMembers.length).toBe(1);
    expect(applied.assignmentsWritten).toBe(36);
    expect(applied.paymentsWritten).toBe(6 + 12 + 2);

    const graceMember = (await db.approvedMember.findUniqueOrThrow({ where: { normalizedEmail: dom('grace') } })).memberId!;
    const janAssignment = await db.memberDuesAssignment.findFirstOrThrow({
      where: { memberId: graceMember, period: { year: 2091, month: 1 } },
    });
    expect(janAssignment.status).toBe('PAID');
    expect(janAssignment.amountDue).toBe(2500);
    const julAssignment = await db.memberDuesAssignment.findFirstOrThrow({
      where: { memberId: graceMember, period: { year: 2091, month: 7 } },
    });
    expect(julAssignment.status).toBe('OUTSTANDING');

    // Idempotent — payments not doubled.
    const before = await db.payment.count({ where: { memberId: graceMember, metadata: { path: ['imported'], equals: true } } });
    await http().post('/finance/dues/import').set(auth(adminToken)).send(matrix).expect(201);
    const after = await db.payment.count({ where: { memberId: graceMember, metadata: { path: ['imported'], equals: true } } });
    expect(after).toBe(before);

    // The period summary reflects the import.
    const period = await db.duesPeriod.findFirstOrThrow({ where: { year: 2091, month: 1 } });
    const summary = (await http().get(`/finance/dues/periods/${period.id}`).set(auth(adminToken)).expect(200)).body;
    expect(summary.summary.collected).toBe(2500 + 2000 + 2000);
  });
});
