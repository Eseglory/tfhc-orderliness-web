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
import { LookupsService } from '../src/modules/lookups/lookups.service';

const database = process.env.TEST_DATABASE_URL;
if (database && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database)) {
  throw new Error('Tests require a local tfhc_e2e database');
}

describe('Official Service Headcount E2E (Real PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  let adminToken: string;
  let adminUserId: string;
  let usherToken: string;
  let usherUserId: string;
  let memberToken: string;
  let memberUserId: string;

  let meetingId: string;
  let futureMeetingId: string;
  let cancelledMeetingId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-local-only-secret-headcount';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');

    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());
    db = app.get(PrismaService);
    await db.serviceHeadcount.deleteMany({});
    await app.get(RbacService).syncSystemRoles();
    await app.get(LookupsService).syncSystemEventTypes();

    const tokens = app.get(AuthService);
    const pw = await argon2.hash('E2ePassword!123');

    // 1. Super Admin User
    const admin = await db.user.create({
      data: {
        email: `headcount-admin-${run}@example.test`,
        passwordHash: pw,
        role: 'ADMIN',
        member: {
          create: {
            memberCode: `ADM-${run}`,
            firstName: 'Super',
            lastName: 'Admin',
            phoneNumber: '08010000010',
          },
        },
      },
      include: { member: true },
    });
    adminUserId = admin.id;
    const superAdminRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    await db.userAccessRole.create({
      data: { userId: admin.id, roleId: superAdminRole.id },
    });
    adminToken = tokens.generateToken(admin.id, admin.email, 'ADMIN', admin.member?.id);

    // 2. Custom Role: Supervising Usher (holds headcount.record & headcount.read)
    const usherRole = await db.accessRole.create({
      data: {
        key: `SUPERVISING_USHER_${run}`,
        name: 'Supervising Usher',
        description: 'Usher authorized to record service attendance',
        permissions: {
          create: [
            { permission: 'headcount.record' },
            { permission: 'headcount.read' },
            { permission: 'attendance.read' },
            { permission: 'events.read' },
          ],
        },
      },
    });

    const usher = await db.user.create({
      data: {
        email: `usher-${run}@example.test`,
        passwordHash: pw,
        role: 'LEADER',
        member: {
          create: {
            memberCode: `USH-${run}`,
            firstName: 'Supervising',
            lastName: 'Usher',
            phoneNumber: '08010000020',
          },
        },
      },
      include: { member: true },
    });
    usherUserId = usher.id;
    await db.userAccessRole.create({
      data: { userId: usher.id, roleId: usherRole.id },
    });
    usherToken = tokens.generateToken(usher.id, usher.email, 'LEADER', usher.member?.id);

    // 3. Regular Member (strictly no headcount permissions)
    const member = await db.user.create({
      data: {
        email: `member-${run}@example.test`,
        passwordHash: pw,
        role: 'MEMBER',
        member: {
          create: {
            memberCode: `MEM-${run}`,
            firstName: 'John',
            lastName: 'Doe',
            phoneNumber: '08010000030',
          },
        },
      },
      include: { member: true },
    });
    memberUserId = member.id;
    memberToken = tokens.generateToken(member.id, member.email, 'MEMBER', member.member?.id);

    // Category
    const category = await db.meetingCategory.create({
      data: { name: `Headcount Category ${run}`, description: 'Test', pointWeight: 1.0 },
    });

    // Create a past/active meeting
    const pastMeeting = await db.meeting.create({
      data: {
        title: `Sunday Service ${run}`,
        categoryId: category.id,
        status: 'CLOSED',
        meetingDate: new Date(Date.now() - 3 * 3600000),
        startTime: new Date(Date.now() - 3 * 3600000),
        expectedArrivalTime: new Date(Date.now() - 3.5 * 3600000),
        attendanceOpenTime: new Date(Date.now() - 4 * 3600000),
        attendanceCloseTime: new Date(Date.now() - 1 * 3600000),
        locationName: "The Father's House Church",
        latitude: 6.6697,
        longitude: 3.3581,
      },
    });
    meetingId = pastMeeting.id;

    // Create a future meeting
    const futureMtg = await db.meeting.create({
      data: {
        title: `Future Service ${run}`,
        categoryId: category.id,
        status: 'SCHEDULED',
        meetingDate: new Date(Date.now() + 48 * 3600000),
        startTime: new Date(Date.now() + 48 * 3600000),
        expectedArrivalTime: new Date(Date.now() + 47.5 * 3600000),
        attendanceOpenTime: new Date(Date.now() + 47 * 3600000),
        attendanceCloseTime: new Date(Date.now() + 50 * 3600000),
        locationName: "The Father's House Church",
        latitude: 6.6697,
        longitude: 3.3581,
      },
    });
    futureMeetingId = futureMtg.id;

    // Create a cancelled meeting
    const cancelledMtg = await db.meeting.create({
      data: {
        title: `Cancelled Service ${run}`,
        categoryId: category.id,
        status: 'CANCELLED',
        cancelReason: 'Inclement weather',
        meetingDate: new Date(Date.now() - 5 * 3600000),
        startTime: new Date(Date.now() - 5 * 3600000),
        expectedArrivalTime: new Date(Date.now() - 5.5 * 3600000),
        attendanceOpenTime: new Date(Date.now() - 6 * 3600000),
        attendanceCloseTime: new Date(Date.now() - 3 * 3600000),
        locationName: "The Father's House Church",
        latitude: 6.6697,
        longitude: 3.3581,
      },
    });
    cancelledMeetingId = cancelledMtg.id;

    // Add 1 digital member attendance record for comparison
    await db.attendanceRecord.create({
      data: {
        memberId: member.member!.id,
        meetingId: pastMeeting.id,
        expectedArrivalTime: pastMeeting.expectedArrivalTime,
        actualArrivalTime: pastMeeting.startTime,
        status: 'ON_TIME',
        pointsEarned: 10,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. should allow authorized usher to record official physical headcount', async () => {
    const res = await http()
      .post('/attendance/headcount')
      .set(auth(usherToken))
      .send({
        meetingId,
        totalHeadcount: 347,
        maleCount: 120,
        femaleCount: 150,
        childrenCount: 77,
        notes: 'Recorded by ushering unit at 10:30 AM',
      })
      .expect(201);

    expect(res.body.totalHeadcount).toBe(347);
    expect(res.body.maleCount).toBe(120);
    expect(res.body.femaleCount).toBe(150);
    expect(res.body.childrenCount).toBe(77);
    expect(res.body.notes).toBe('Recorded by ushering unit at 10:30 AM');
    expect(res.body.recordedById).toBe(usherUserId);

    // Verify DB record
    const inDb = await db.serviceHeadcount.findUnique({ where: { meetingId } });
    expect(inDb).toBeDefined();
    expect(inDb!.totalHeadcount).toBe(347);

    // Verify Audit Trail Log
    const auditLog = await db.auditLog.findFirst({
      where: {
        entity: 'ServiceHeadcount',
        entityId: inDb!.id,
        action: 'SERVICE_HEADCOUNT_RECORDED',
      },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog!.actorUserId).toBe(usherUserId);
  });

  it('2. should allow admin to update headcount and track audit history', async () => {
    const res = await http()
      .post('/attendance/headcount')
      .set(auth(adminToken))
      .send({
        meetingId,
        totalHeadcount: 350,
        maleCount: 121,
        femaleCount: 152,
        childrenCount: 77,
        notes: 'Corrected 3 adults in media room',
      })
      .expect(201);

    expect(res.body.totalHeadcount).toBe(350);
    expect(res.body.lastUpdatedById).toBe(adminUserId);

    // Verify DB
    const inDb = await db.serviceHeadcount.findUnique({ where: { meetingId } });
    expect(inDb!.totalHeadcount).toBe(350);
    expect(inDb!.lastUpdatedById).toBe(adminUserId);

    // Verify UPDATE Audit Log
    const updateAudit = await db.auditLog.findFirst({
      where: {
        entity: 'ServiceHeadcount',
        entityId: inDb!.id,
        action: 'SERVICE_HEADCOUNT_UPDATED',
      },
    });
    expect(updateAudit).toBeDefined();
    expect(updateAudit!.actorUserId).toBe(adminUserId);
    expect((updateAudit!.previousData as any).totalHeadcount).toBe(347);
    expect((updateAudit!.newData as any).totalHeadcount).toBe(350);
  });

  it('3. should retrieve service headcount with comparison to digital attendance', async () => {
    const res = await http()
      .get(`/attendance/headcount/${meetingId}`)
      .set(auth(usherToken))
      .expect(200);

    expect(res.body.headcount).toBeDefined();
    expect(res.body.headcount.totalHeadcount).toBe(350);
    expect(res.body.individualAttendance.attendedCount).toBe(1);
    expect(res.body.variance).toBe(349); // 350 physical - 1 app checkin
  });

  it('4. should reject unauthorized regular members attempting to record headcount (403)', async () => {
    await http()
      .post('/attendance/headcount')
      .set(auth(memberToken))
      .send({
        meetingId,
        totalHeadcount: 500,
      })
      .expect(403);
  });

  it('5. should reject negative counts and impossible demographic breakdown sums (400)', async () => {
    // Negative total
    await http()
      .post('/attendance/headcount')
      .set(auth(adminToken))
      .send({
        meetingId,
        totalHeadcount: -5,
      })
      .expect(400);

    // Demographic sum exceeding total
    await http()
      .post('/attendance/headcount')
      .set(auth(adminToken))
      .send({
        meetingId,
        totalHeadcount: 100,
        maleCount: 60,
        femaleCount: 50,
        childrenCount: 20, // Sum = 130 > 100
      })
      .expect(400);
  });

  it('6. should reject headcount for a future service (400)', async () => {
    await http()
      .post('/attendance/headcount')
      .set(auth(adminToken))
      .send({
        meetingId: futureMeetingId,
        totalHeadcount: 200,
      })
      .expect(400);
  });

  it('7. should reject headcount for a cancelled service (400)', async () => {
    await http()
      .post('/attendance/headcount')
      .set(auth(adminToken))
      .send({
        meetingId: cancelledMeetingId,
        totalHeadcount: 200,
      })
      .expect(400);
  });

  it('8. should return headcount analytics with summary & demographic totals', async () => {
    const res = await http()
      .get('/attendance/headcount/stats?days=30')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalHeadcount).toBe(350);
    expect(res.body.summary.demographics.male).toBe(121);
    expect(res.body.summary.demographics.female).toBe(152);
    expect(res.body.summary.demographics.children).toBe(77);
  });
});
