import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Mirrors AvailabilityService.weekStart() in apps/api so the fixture cycle's
// weekStart matches exactly what the running API computes for "now".
function weekStart(now = new Date()) {
  const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const val = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const weekday = parts.find((x) => x.type === 'weekday')?.value;
  const date = new Date(Date.UTC(val('year'), val('month') - 1, val('day')));
  date.setUTCDate(date.getUTCDate() - ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[weekday ?? 'Mon']);
  return date;
}

export default async function setup() {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const passwordHash = await argon2.hash('E2ePassword!123');
    for (const role of ['ADMIN', 'MEMBER'] as const) {
      const email = `${role.toLowerCase()}-browser@example.test`;
      await db.user.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash, role, member: { create: { memberCode: `BROWSER-${role}`, firstName: 'Browser', lastName: role, phoneNumber: '08012345678' } } } });
    }

    // --- Administrator: engreseglory@gmail.com ---
    const adminEmail = 'engreseglory@gmail.com';
    const adminMember = await db.member.upsert({
      where: { memberCode: 'ADMIN-ESE' },
      update: { firstName: 'Glory', lastName: 'Eseosa', phoneNumber: '08034441916', profession: 'Software Engineer', address: 'TFHC HQ', gender: 'Male', status: 'ACTIVE' },
      create: { memberCode: 'ADMIN-ESE', firstName: 'Glory', lastName: 'Eseosa', phoneNumber: '08034441916', profession: 'Software Engineer', address: 'TFHC HQ', gender: 'Male', status: 'ACTIVE' },
    });
    const adminUser = await db.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash, role: 'ADMIN', passwordAuthEnabled: true, emailVerifiedAt: new Date(), isActive: true, member: { connect: { id: adminMember.id } } },
      create: { email: adminEmail, passwordHash, role: 'ADMIN', passwordAuthEnabled: true, emailVerifiedAt: new Date(), isActive: true, member: { connect: { id: adminMember.id } } },
    });
    await db.member.update({ where: { id: adminMember.id }, data: { userId: adminUser.id } });
    await db.approvedMember.upsert({
      where: { normalizedEmail: adminEmail },
      update: { status: 'ACTIVE', memberId: adminMember.id },
      create: { email: adminEmail, normalizedEmail: adminEmail, status: 'ACTIVE', memberId: adminMember.id },
    });

    const superAdminRole = await db.accessRole.upsert({
      where: { key: 'SUPER_ADMIN' },
      update: { name: 'Super Admin', isSystem: true },
      create: { key: 'SUPER_ADMIN', name: 'Super Admin', isSystem: true },
    });
    await db.accessRolePermission.upsert({
      where: { roleId_permission: { roleId: superAdminRole.id, permission: '*' } },
      update: {},
      create: { roleId: superAdminRole.id, permission: '*' },
    });
    await db.userAccessRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: superAdminRole.id },
    });

    // Chat system rooms
    for (const r of [
      { key: 'GENERAL', name: 'General', description: 'Unit-wide conversation for every member.', type: 'GENERAL' as const },
      { key: 'EXECUTIVES', name: 'Executives', description: 'Private channel for unit executives and administrators.', type: 'EXECUTIVES' as const },
    ]) {
      await db.chatRoom.upsert({ where: { key: r.key }, update: {}, create: r });
    }

    const category = await db.meetingCategory.upsert({ where: { name: 'Browser fixture category' }, update: {}, create: { name: 'Browser fixture category' } });
    const at = (minutes: number) => new Date(Date.now() + minutes * 60000);
    const fixture = { title: 'Browser fixture meeting', categoryId: category.id, meetingDate: at(0), startTime: at(30), expectedArrivalTime: at(15), attendanceOpenTime: at(0), attendanceCloseTime: at(60), locationName: 'Test Venue', latitude: 6.5, longitude: 3.3, status: 'SCHEDULED' as const, qrSecret: 'browser-fixture-secret' };
    await db.meeting.upsert({ where: { id: '00000000-0000-4000-8000-000000000001' }, update: fixture, create: { id: '00000000-0000-4000-8000-000000000001', ...fixture } });

    const cycleWeekStart = weekStart();
    await db.weeklyAvailabilityCycle.upsert({
      where: { weekStart: cycleWeekStart },
      update: { closesAt: at(60 * 24 * 7) },
      create: { weekStart: cycleWeekStart, opensAt: at(0), closesAt: at(60 * 24 * 7) },
    });

    // --- Email-auth fixtures -------------------------------------------------
    // An approved member with a directory record but no account yet: the target
    // for the self-registration browser flow.
    const registerEmail = 'register-browser@example.test';
    const regMember = await db.member.upsert({
      where: { memberCode: 'BROWSER-REGISTER' },
      update: {},
      create: { memberCode: 'BROWSER-REGISTER', firstName: 'Reggie', lastName: 'Ster', phoneNumber: '08055550000' },
    });
    await db.approvedMember.upsert({
      where: { normalizedEmail: registerEmail },
      update: { status: 'ACTIVE', memberId: regMember.id },
      create: { email: registerEmail, normalizedEmail: registerEmail, status: 'ACTIVE', memberId: regMember.id },
    });

    // A member with a run of absences, to trigger the "we've missed you" nudge.
    const nudgeUser = await db.user.upsert({
      where: { email: 'nudge-browser@example.test' },
      update: { passwordHash },
      create: { email: 'nudge-browser@example.test', passwordHash, role: 'MEMBER', member: { create: { memberCode: 'BROWSER-NUDGE', firstName: 'Missy', lastName: 'Gone', phoneNumber: '08066660000', dateOfBirth: new Date('1990-01-01'), gender: 'Female', address: '1 Test Road' } } },
      include: { member: true },
    });
    for (let i = 1; i <= 3; i++) {
      const past = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const meeting = await db.meeting.upsert({
        where: { id: `00000000-0000-4000-8000-00000000010${i}` },
        update: {},
        create: {
          id: `00000000-0000-4000-8000-00000000010${i}`,
          title: `Past fixture meeting ${i}`, categoryId: category.id,
          meetingDate: past, startTime: past, expectedArrivalTime: past,
          attendanceOpenTime: past, attendanceCloseTime: new Date(past.getTime() + 3600000),
          locationName: 'Test Venue', latitude: 6.5, longitude: 3.3, status: 'CLOSED', qrSecret: `past-fixture-${i}`,
        },
      });
      await db.attendanceRecord.upsert({
        where: { memberId_meetingId: { memberId: nudgeUser.member!.id, meetingId: meeting.id } },
        update: { status: 'ABSENT' },
        create: { memberId: nudgeUser.member!.id, meetingId: meeting.id, expectedArrivalTime: past, status: 'ABSENT', method: 'MANUAL', pointsEarned: 0 },
      });
    }
  } finally { await db.$disconnect(); }
}
