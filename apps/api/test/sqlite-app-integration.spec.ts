import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { ServicesService } from '../src/modules/services/services.service';
import { RbacService } from '../src/common/rbac/rbac.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { ScoringService } from '../src/modules/scoring/scoring.service';

jest.setTimeout(30000);

describe('complete Nest application using operational SQLite', () => {
  let directory: string;
  let app: INestApplication;
  let prisma: PrismaService;
  let saved: Record<string, string | undefined>;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tfhc-sqlite-app-'));
    const file = join(directory, 'app.db');
    await bootstrapSqlite(file);
    const updates = { OPERATIONAL_DATABASE: 'sqlite', SQLITE_DATABASE_PATH: file,
      CHAT_SHARED_DB_PATH: join(directory, 'chat.db'), SQLITE_DURABILITY: 'local', DISABLE_SCHEDULED_JOBS: 'true' };
    saved = Object.fromEntries(Object.keys(updates).map(key => [key, process.env[key]]));
    Object.assign(process.env, updates);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  }, 120000);
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(saved || {})) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (directory) rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('boots every module with SQLite and preserves default reference records', async () => {
    expect(prisma.operationalAdapter).toBeDefined();
    expect(await prisma.accessRole.count()).toBeGreaterThan(0);
    expect(await prisma.organizationService.count()).toBeGreaterThan(0);
    const health = await request(app.getHttpServer()).get('/health/database-sync').expect(200);
    expect(health.body.operationalDatabase).toBe('sqlite');
  });

  it('preserves scalar-list service data through the actual business service', async () => {
    const services = app.get(ServicesService);
    const result = await services.create({ name: 'SQLite service fixture', assignedStaffIds: ['staff-one', 'staff-two'] });
    expect(result.assignedStaffIds).toEqual(['staff-one', 'staff-two']);
    expect((await prisma.organizationService.findUnique({ where: { id: result.id } })).assignedStaffIds).toEqual(['staff-one', 'staff-two']);
  });

  it('authenticates staff and enforces protected endpoint access against SQLite', async () => {
    const password = 'Synthetic-test-password-123!';
    const user = await prisma.user.create({ data: { email: 'sqlite-admin@example.test', passwordHash: await argon2.hash(password), role: 'ADMIN', passwordAuthEnabled: true,
      emailVerifiedAt: new Date(), isActive: true } });
    await app.get(RbacService).syncSystemRoles();
    const role = await prisma.accessRole.findUnique({ where: { key: 'SUPER_ADMIN' } });
    if (role) await prisma.userAccessRole.create({ data: { userId: user.id, roleId: role.id } });
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: user.email, password }).expect(200);
    const token = login.body.accessToken || login.body.access_token || login.body.token;
    expect(typeof token).toBe('string');
    await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('replays a mutation response with the same operation key without repeating side effects', async () => {
    const adapter = prisma.operationalAdapter;
    let executions = 0;
    const mutate = () => { executions++; return prisma.subTeam.create({ data: { name: 'Replay fixture' } }); };
    const first = await adapter.request(mutate, 'request-fixture-key', 'same-request-hash');
    const duplicate = await adapter.request(mutate, 'request-fixture-key', 'same-request-hash');
    expect(duplicate).toEqual(first);
    expect(executions).toBe(1);
    await expect(adapter.request(mutate, 'request-fixture-key', 'different-request-hash')).rejects.toThrow('different request');
  });

  it('keeps physical attendance unique under concurrent requests and runs real leaderboard SQL', async () => {
    const user = await prisma.user.create({ data: { email: 'sqlite-attendance@example.test', passwordHash: 'synthetic-only', role: 'MEMBER',
      member: { create: { memberCode: 'SQL-ATTENDANCE', firstName: 'Test', lastName: 'Attendance', phoneNumber: '0000000000' } } }, include: { member: true } });
    const category = await prisma.meetingCategory.upsert({ where: { name: 'SQLite fixture service' }, update: {}, create: { name: 'SQLite fixture service' } });
    const now = Date.now();
    const meeting = await prisma.meeting.create({ data: { categoryId: category.id, title: 'Attendance fixture', status: 'ACTIVE',
      meetingDate: new Date(now), startTime: new Date(now + 600000), expectedArrivalTime: new Date(now + 300000),
      attendanceOpenTime: new Date(now - 600000), attendanceCloseTime: new Date(now + 1800000), locationName: 'Church',
      latitude: 6.6, longitude: 3.3, geofenceRadiusMeters: 100 } });
    const attendance = app.get(AttendanceService);
    const input = { memberId: user.member.id, meetingId: meeting.id, latitude: 6.6, longitude: 3.3, gpsAccuracy: 5 };
    await expect(attendance.checkInMember({ ...input, latitude: 0, longitude: 0 })).rejects.toMatchObject({ status: 400 });
    const results = await Promise.allSettled([attendance.checkInMember(input), attendance.checkInMember(input)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await prisma.attendanceRecord.count({ where: { memberId: user.member.id, meetingId: meeting.id } })).toBe(1);
    const leaderboard = await app.get(ScoringService).getLeaderboard();
    expect(JSON.stringify(leaderboard)).toContain('SQL-ATTENDANCE');
  });
});
