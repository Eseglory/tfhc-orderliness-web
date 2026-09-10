import { PrismaClient, Role, MemberStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { syncSystemRoles } from '../common/rbac/sync-system-roles';
import { DEFAULT_EVENT_TYPES } from '@tfhc/shared';
import { SERVICE_SCHEDULES } from '../modules/recurring-services/service-schedules';

config();
const prisma = new PrismaClient();

/**
 * Seeds real definitions and lookups only — RBAC roles, event types, meeting
 * categories, the recurring service schedules + venue config, and a single
 * bootstrap Super Admin. It does NOT create sample members or attendance;
 * the real membership comes from `yarn workspace @tfhc/api import:data`.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Seeding is restricted to local databases. Use scripts/bootstrap-admin.cjs for production.');
  }

  await syncSystemRoles(prisma);

  for (const [i, t] of DEFAULT_EVENT_TYPES.entries()) {
    await prisma.eventType.upsert({
      where: { key: t.key },
      update: { isSystem: true },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        icon: t.icon,
        color: t.color,
        defaultCompulsory: t.defaultCompulsory,
        isSystem: true,
        sortOrder: (i + 1) * 10,
      },
    });
  }

  const categories = [
    { name: 'Unit Meeting', basePoints: 10, pointWeight: 1.0, isSystem: true },
    { name: 'Sunday Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
    { name: 'Midweek Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
    { name: 'Training', basePoints: 10, pointWeight: 1.5, isSystem: true },
    { name: 'Special Programme', basePoints: 15, pointWeight: 2.0, isSystem: true },
  ];
  for (const c of categories) {
    await prisma.meetingCategory.upsert({ where: { name: c.name }, update: { isSystem: true }, create: c });
  }

  for (const name of ['Protocol', 'Media & IT', 'Choir', 'Ushering', 'Security']) {
    await prisma.subTeam.upsert({ where: { name }, update: {}, create: { name, isSystem: true } });
  }

  // System chat rooms. Membership is resolved dynamically by the chat service
  // (every active member is in General; executives + staff are in Executives).
  const chatRooms = [
    { key: 'GENERAL', name: 'General', description: 'Unit-wide conversation for every member.', type: 'GENERAL' as const },
    { key: 'EXECUTIVES', name: 'Executives', description: 'Private channel for unit executives and administrators.', type: 'EXECUTIVES' as const },
  ];
  for (const r of chatRooms) {
    await prisma.chatRoom.upsert({ where: { key: r.key }, update: {}, create: r });
  }

  // Recurring service schedules + the shared venue/reminder config the generator
  // needs to produce upcoming events on boot.
  await prisma.systemSetting.upsert({
    where: { key: 'recurring_services_config' },
    update: {},
    create: {
      key: 'recurring_services_config',
      value: JSON.stringify({
        venue: {
          name: 'The Father’s House Church, 90 Alagbole–Akute Road, Iju, Ojodu',
          latitude: 6.6697906,
          longitude: 3.3581822,
          radiusMeters: 120,
        },
        arrivalMinutesBefore: 30,
        reminderMinutes: [60],
        recipients: 'all',
        remindersEnabled: false,
      }),
    },
  });
  for (const s of SERVICE_SCHEDULES) {
    await prisma.serviceSchedule.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        title: s.title,
        dayOfWeek: s.dayOfWeek,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        categoryName: s.categoryName,
        enabled: true,
        eventTypeKey: s.categoryName === 'Special Programme' ? 'SPECIAL_SERVICE' : 'SERVICE',
      },
    });
  }

  // Bootstrap Super Admin (needed for sign-in and to attribute imports).
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@tfhc.org' },
    update: {},
    create: {
      email: 'admin@tfhc.org',
      passwordHash: await argon2.hash('Admin@123456'),
      role: Role.ADMIN,
      passwordAuthEnabled: true,
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
      member: {
        create: {
          memberCode: 'TFHC-0001',
          firstName: 'Unit',
          lastName: 'Leader',
          phoneNumber: '+2348000000000',
          roleInUnit: 'Head of Unit',
          status: MemberStatus.ACTIVE,
        },
      },
    },
  });
  const superRole = await prisma.accessRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  await prisma.userAccessRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superRole.id },
  });

  console.log('Seeded RBAC roles, event types, categories, service schedules and a bootstrap Super Admin.');
  console.log('Run `yarn workspace @tfhc/api import:data --apply` to load the real membership + dues.');
}

main()
  .catch((e) => {
    console.error(e.code || e.message || 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
