import './setup-test-env';
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
  throw new Error('E2E tests strictly require a local isolated tfhc_e2e database');
}

describe('Ushering Unit Monthly Hosting Meeting & Alarm E2E Specification', () => {
  let app: INestApplication;
  let db: PrismaService;
  const run = Date.now().toString();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  let adminToken: string;
  let memberToken: string;
  let memberId: string;
  let userId: string;

  let unitMeetingCategoryId: string;
  let meetingEventTypeId: string;
  let jikoMinisterId: string;

  const agendaMemberIds: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = 'e2e-isolated-jwt-secret-key-2026';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');

    // Suspend background cron jobs so they do not interfere with tests
    app.get(SchedulerRegistry).getCronJobs().forEach((j) => j.stop());

    db = app.get(PrismaService);
    await app.get(RbacService).syncSystemRoles();
    await app.get(LookupsService).syncSystemEventTypes();

    const authService = app.get(AuthService);
    const pw = await argon2.hash('IsolatedTestPass123!');

    // 1. Seed synthetic Admin user with SUPER_ADMIN role
    const admin = await db.user.create({
      data: {
        email: `admin-e2e-${run}@example.test`,
        passwordHash: pw,
        role: 'ADMIN',
      },
    });
    const superAdminRole = await db.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    await db.userAccessRole.create({
      data: { userId: admin.id, roleId: superAdminRole.id },
    });
    adminToken = authService.generateToken(admin.id, admin.email, 'ADMIN');

    // 2. Seed Executive SubTeam
    const execSubTeam = await db.subTeam.upsert({
      where: { name: 'Executive' },
      update: {},
      create: { name: 'Executive', description: 'Executive council', isSystem: true },
    });

    // 3. Seed Category & EventType
    const cat = await db.meetingCategory.upsert({
      where: { name: 'Unit Meeting' },
      update: {},
      create: { name: 'Unit Meeting', basePoints: 10, pointWeight: 1.0, isSystem: true },
    });
    unitMeetingCategoryId = cat.id;

    const evt = await db.eventType.findUniqueOrThrow({ where: { key: 'MEETING' } });
    meetingEventTypeId = evt.id;

    // 4. Seed Supervising Minister Jiko
    const jiko = await db.member.upsert({
      where: { memberCode: 'TFHC-MIN-JIKO-TEST' },
      update: { subTeamId: execSubTeam.id, roleInUnit: 'Executive', status: 'ACTIVE' },
      create: {
        memberCode: 'TFHC-MIN-JIKO-TEST',
        firstName: 'Minister',
        lastName: 'Jiko',
        preferredName: 'Jiko',
        roleInUnit: 'Executive',
        phoneNumber: '08000000000',
        status: 'ACTIVE',
        subTeamId: execSubTeam.id,
      },
    });
    jikoMinisterId = jiko.id;

    // 5. Seed Synthetic Agenda Members
    const agendaMembersData = [
      { key: 'loveth', first: 'Loveth', last: 'Ukabuike', email: `loveth-${run}@example.test` },
      { key: 'somto', first: 'Somto', last: 'Otega', email: `somto-${run}@example.test` },
      { key: 'jacob', first: 'Jacob', last: 'Onoja', email: `jacob-${run}@example.test` },
      { key: 'vivian', first: 'Vivian', last: 'Amadi', email: `vivian-${run}@example.test` },
      { key: 'femi', first: 'Oluwafemi', last: 'Paseda', email: `femi-${run}@example.test` },
      { key: 'ese', first: 'Eseosa', last: 'Glory', email: `ese-${run}@example.test` },
      { key: 'nicole', first: 'Nicole', last: 'Okafor', email: `nicole-${run}@example.test` },
    ];

    for (const m of agendaMembersData) {
      const u = await db.user.create({
        data: {
          email: m.email,
          passwordHash: pw,
          role: 'MEMBER',
          member: {
            create: {
              memberCode: `TFHC-E2E-${m.key.toUpperCase()}-${run.slice(-4)}`,
              firstName: m.first,
              lastName: m.last,
              phoneNumber: '08020000000',
              status: 'ACTIVE',
              subTeamId: execSubTeam.id,
              roleInUnit: 'Member',
            },
          },
        },
        include: { member: true },
      });
      agendaMemberIds[m.key] = u.member!.id;

      if (m.key === 'ese') {
        memberId = u.member!.id;
        userId = u.id;
        memberToken = authService.generateToken(u.id, u.email, 'MEMBER', u.member!.id);
      }
    }
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('1. Meeting Creation & Persistence in Isolated Database', () => {
    let createdMeetingId: string;

    it('creates the Ushering Unit Monthly Hosting meeting with exact specifications', async () => {
      const payload = {
        title: 'Ushering Unit Monthly Hosting and General Meeting',
        description:
          'HOSTING! HOSTING! HOSTING!\n\nGood day, Family!\n\nOur monthly hosting is today, Sunday, 18 October 2026. Please plan to attend immediately after the third service.\n\n**Venue:** Sis Comfort\'s Residence\n\n**Address:** No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.\n\nPlease inform every member of the Ushering Unit to attend, as we will also be holding our General Meeting.\n\nPlease note that failure to attend the Monthly Hosting without obtaining permission will attract a fine.\n\nThank you for your selfless service.',
        categoryId: unitMeetingCategoryId,
        eventTypeId: meetingEventTypeId,
        supervisingMinisterId: jikoMinisterId,
        meetingDate: '2026-10-18T00:00:00.000Z',
        startTime: '2026-10-18T12:00:00.000Z', // 1:00 PM WAT
        endTime: '2026-10-18T15:00:00.000Z',   // 4:00 PM WAT
        expectedArrivalTime: '2026-10-18T11:45:00.000Z',
        attendanceOpenTime: '2026-10-18T11:45:00.000Z',
        attendanceCloseTime: '2026-10-18T15:00:00.000Z',
        gracePeriodMinutes: 10,
        locationName: "Sis Comfort's Residence",
        address: 'No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.',
        latitude: 6.6854,
        longitude: 3.3421,
        geofenceRadiusMeters: 150.0,
        isCompulsory: true,
        pointWeight: 1.0,
        visibility: 'PUBLIC',
      };

      const res = await http()
        .post('/meetings')
        .set(auth(adminToken))
        .send(payload)
        .expect(201);

      createdMeetingId = res.body.id;
      expect(createdMeetingId).toBeDefined();
      expect(res.body.title).toBe('Ushering Unit Monthly Hosting and General Meeting');
      expect(res.body.supervisingMinisterId).toBe(jikoMinisterId);
      expect(res.body.supervisingMinister.lastName).toBe('Jiko');
      expect(res.body.locationName).toBe("Sis Comfort's Residence");
      expect(res.body.address).toBe('No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.');
      expect(new Date(res.body.startTime).toISOString()).toBe('2026-10-18T12:00:00.000Z');
      expect(new Date(res.body.endTime).toISOString()).toBe('2026-10-18T15:00:00.000Z');
    });

    it('creates all 7 agenda items in correct order with assigned members', async () => {
      const agendaDefinitions = [
        { order: 1, title: 'Opening Prayer', memberKey: 'loveth', duration: 10 },
        { order: 2, title: 'Praise and Worship', memberKey: 'somto', duration: 20 },
        { order: 3, title: 'Short Exhortation', memberKey: 'jacob', duration: 25 },
        { order: 4, title: 'Testimony', memberKey: 'vivian', duration: 15 },
        { order: 5, title: 'Any Other Business (AOB)', memberKey: 'femi', duration: 20 },
        { order: 6, title: 'Financial Report', memberKey: 'ese', duration: 20 },
        { order: 7, title: 'Closing Prayer', memberKey: 'nicole', duration: 10 },
      ];

      for (const item of agendaDefinitions) {
        const res = await http()
          .post(`/meetings/${createdMeetingId}/agenda`)
          .set(auth(adminToken))
          .send({
            title: item.title,
            description: `${item.title} session`,
            order: item.order,
            durationMinutes: item.duration,
            assignedMemberId: agendaMemberIds[item.memberKey],
          })
          .expect(201);

        expect(res.body.order).toBe(item.order);
        expect(res.body.title).toBe(item.title);
        expect(res.body.assignedMemberId).toBe(agendaMemberIds[item.memberKey]);
      }

      // Verify agenda list endpoint
      const listRes = await http()
        .get(`/meetings/${createdMeetingId}/agenda`)
        .set(auth(memberToken))
        .expect(200);

      expect(listRes.body).toHaveLength(7);
      expect(listRes.body[0].title).toBe('Opening Prayer');
      expect(listRes.body[0].assignedMember.firstName).toBe('Loveth');
      expect(listRes.body[5].title).toBe('Financial Report');
      expect(listRes.body[5].assignedMember.firstName).toBe('Eseosa');
      expect(listRes.body[6].title).toBe('Closing Prayer');
      expect(listRes.body[6].assignedMember.firstName).toBe('Nicole');
    }, 30000);

    it('verifies round-trip database query for meeting details, minister, and agenda', async () => {
      const saved = await db.meeting.findUniqueOrThrow({
        where: { id: createdMeetingId },
        include: {
          supervisingMinister: true,
          agendaItems: {
            orderBy: { order: 'asc' },
            include: { assignedMember: true },
          },
        },
      });

      expect(saved.title).toBe('Ushering Unit Monthly Hosting and General Meeting');
      expect(saved.supervisingMinister?.lastName).toBe('Jiko');
      expect(saved.supervisingMinister?.roleInUnit).toBe('Executive');
      expect(saved.locationName).toBe("Sis Comfort's Residence");
      expect(saved.agendaItems).toHaveLength(7);
      expect(saved.agendaItems.map((a) => a.title)).toEqual([
        'Opening Prayer',
        'Praise and Worship',
        'Short Exhortation',
        'Testimony',
        'Any Other Business (AOB)',
        'Financial Report',
        'Closing Prayer',
      ]);
    }, 30000);
  });

  describe('2. Validation & Security Boundaries', () => {
    it('rejects meeting creation with end time before start time (400)', async () => {
      await http()
        .post('/meetings')
        .set(auth(adminToken))
        .send({
          title: 'Invalid Time Meeting',
          categoryId: unitMeetingCategoryId,
          startTime: '2026-10-18T16:00:00.000Z',
          endTime: '2026-10-18T13:00:00.000Z', // before start
          meetingDate: '2026-10-18T00:00:00.000Z',
          expectedArrivalTime: '2026-10-18T15:00:00.000Z',
          attendanceOpenTime: '2026-10-18T15:00:00.000Z',
          attendanceCloseTime: '2026-10-18T16:00:00.000Z',
          locationName: 'Test Hall',
          latitude: 6.5,
          longitude: 3.3,
        })
        .expect(400);
    });

    it('rejects non-executive / non-disciplinary member as supervising minister (400)', async () => {
      // Seed a regular member not in executive subteam
      const regularMember = await db.member.create({
        data: {
          memberCode: `REGULAR-MEMBER-${Date.now()}`,
          firstName: 'Plain',
          lastName: 'Member',
          phoneNumber: '08099999999',
          status: 'ACTIVE',
          roleInUnit: 'Member',
        },
      });

      await http()
        .post('/meetings')
        .set(auth(adminToken))
        .send({
          title: 'Invalid Minister Meeting',
          categoryId: unitMeetingCategoryId,
          supervisingMinisterId: regularMember.id,
          startTime: '2026-10-18T18:00:00.000Z',
          endTime: '2026-10-18T20:00:00.000Z',
          meetingDate: '2026-10-18T00:00:00.000Z',
          expectedArrivalTime: '2026-10-18T17:30:00.000Z',
          attendanceOpenTime: '2026-10-18T17:30:00.000Z',
          attendanceCloseTime: '2026-10-18T20:00:00.000Z',
          locationName: 'Church Hall',
          latitude: 6.5,
          longitude: 3.3,
        })
        .expect(400);
    });

    it('prevents unauthorized members from creating meetings (403)', async () => {
      await http()
        .post('/meetings')
        .set(auth(memberToken))
        .send({
          title: 'Unauthorized Meeting',
          categoryId: unitMeetingCategoryId,
          startTime: '2026-10-18T18:00:00.000Z',
          endTime: '2026-10-18T20:00:00.000Z',
          meetingDate: '2026-10-18T00:00:00.000Z',
          expectedArrivalTime: '2026-10-18T17:30:00.000Z',
          attendanceOpenTime: '2026-10-18T17:30:00.000Z',
          attendanceCloseTime: '2026-10-18T20:00:00.000Z',
          locationName: 'Church Hall',
          latitude: 6.5,
          longitude: 3.3,
        })
        .expect(403);
    });
  });

  describe('3. Notification & Device Alarm Integration Workflows', () => {
    it('member-reminders endpoint recognizes the scheduled meeting for alarm trigger', async () => {
      const res = await http()
        .get('/meetings/member-reminders')
        .set(auth(memberToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const hostingMeeting = res.body.find(
        (m: any) => m.title === 'Ushering Unit Monthly Hosting and General Meeting'
      );
      expect(hostingMeeting).toBeDefined();
      expect(new Date(hostingMeeting.startTime).toISOString()).toBe('2026-10-18T12:00:00.000Z');
      expect(hostingMeeting.locationName).toBe("Sis Comfort's Residence");
      expect(hostingMeeting.address).toContain('No. 2, Ogo-Oluwa Close');
    });

    it('saves and retrieves customized alarm sound and snooze settings', async () => {
      // Save preferences
      const putRes = await http()
        .put('/meetings/reminder-preferences')
        .set(auth(memberToken))
        .send({
          meetingRemindersEnabled: true,
          alarmSoundEnabled: true,
          alarmSoundName: 'marimba',
          snoozeDurationMinutes: 10,
        })
        .expect(200);

      expect(putRes.body.alarmSoundName).toBe('marimba');
      expect(putRes.body.snoozeDurationMinutes).toBe(10);

      // Retrieve preferences
      const getRes = await http()
        .get('/meetings/reminder-preferences')
        .set(auth(memberToken))
        .expect(200);

      expect(getRes.body.meetingRemindersEnabled).toBe(true);
      expect(getRes.body.alarmSoundEnabled).toBe(true);
      expect(getRes.body.alarmSoundName).toBe('marimba');
      expect(getRes.body.snoozeDurationMinutes).toBe(10);
    });

    it('allows independent toggling of alarm sound while keeping visual reminders active', async () => {
      const res = await http()
        .put('/meetings/reminder-preferences')
        .set(auth(memberToken))
        .send({
          meetingRemindersEnabled: true,
          alarmSoundEnabled: false, // muted alarm
          alarmSoundName: 'chime',
          snoozeDurationMinutes: 5,
        })
        .expect(200);

      expect(res.body.meetingRemindersEnabled).toBe(true);
      expect(res.body.alarmSoundEnabled).toBe(false);
    });

    it('suppresses alarms and reminders for cancelled meetings', async () => {
      // Create a cancelled meeting
      const cancelledMeeting = await db.meeting.create({
        data: {
          title: 'Cancelled Test Fellowship',
          categoryId: unitMeetingCategoryId,
          meetingDate: '2026-10-18T00:00:00.000Z',
          startTime: '2026-10-18T13:00:00.000Z',
          endTime: '2026-10-18T14:00:00.000Z',
          expectedArrivalTime: '2026-10-18T12:45:00.000Z',
          attendanceOpenTime: '2026-10-18T12:45:00.000Z',
          attendanceCloseTime: '2026-10-18T14:00:00.000Z',
          locationName: 'Annex Hall',
          latitude: 6.5,
          longitude: 3.3,
          status: 'CANCELLED',
          scheduleCancelled: true,
          cancelReason: 'Test cancellation',
        },
      });

      const res = await http()
        .get('/meetings/member-reminders')
        .set(auth(memberToken))
        .expect(200);

      const found = res.body.find((m: any) => m.id === cancelledMeeting.id);
      expect(found).toBeUndefined();
    });

    it('suppresses alarms for meetings the member has already checked into', async () => {
      // Create meeting and record member attendance
      const attendedMeeting = await db.meeting.create({
        data: {
          title: 'Already Attended Service',
          categoryId: unitMeetingCategoryId,
          meetingDate: '2026-10-18T00:00:00.000Z',
          startTime: '2026-10-18T12:30:00.000Z',
          endTime: '2026-10-18T14:00:00.000Z',
          expectedArrivalTime: '2026-10-18T12:00:00.000Z',
          attendanceOpenTime: '2026-10-18T12:00:00.000Z',
          attendanceCloseTime: '2026-10-18T14:00:00.000Z',
          locationName: 'Sanctuary',
          latitude: 6.5,
          longitude: 3.3,
          status: 'SCHEDULED',
        },
      });

      // Record attendance
      await db.attendanceRecord.create({
        data: {
          meetingId: attendedMeeting.id,
          memberId,
          expectedArrivalTime: new Date('2026-10-18T12:00:00.000Z'),
          actualArrivalTime: new Date(),
          status: 'ON_TIME',
          attendanceType: 'PHYSICAL',
          method: 'SYSTEM_GEO',
        },
      });

      const res = await http()
        .get('/meetings/member-reminders')
        .set(auth(memberToken))
        .expect(200);

      const found = res.body.find((m: any) => m.id === attendedMeeting.id);
      expect(found).toBeUndefined();
    });
  });
});
