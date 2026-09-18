import { PrismaClient } from '@prisma/client';
import { SERVICE_SCHEDULES, occurrences } from '../src/modules/recurring-services/service-schedules';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding church recurring service schedules...');

  // 1. Ensure Categories exist
  const sundayCat = await prisma.meetingCategory.upsert({
    where: { name: 'Sunday Service' },
    update: {},
    create: { name: 'Sunday Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
  });
  const midweekCat = await prisma.meetingCategory.upsert({
    where: { name: 'Midweek Service' },
    update: {},
    create: { name: 'Midweek Service', basePoints: 5, pointWeight: 1.0, isSystem: true },
  });
  const unitCat = await prisma.meetingCategory.upsert({
    where: { name: 'Unit Meeting' },
    update: {},
    create: { name: 'Unit Meeting', basePoints: 10, pointWeight: 1.0, isSystem: true },
  });
  const specialCat = await prisma.meetingCategory.upsert({
    where: { name: 'Special Programme' },
    update: {},
    create: { name: 'Special Programme', basePoints: 15, pointWeight: 2.0, isSystem: true },
  });

  const catMap: Record<string, string> = {
    'Sunday Service': sundayCat.id,
    'Midweek Service': midweekCat.id,
    'Unit Meeting': unitCat.id,
    'Special Programme': specialCat.id,
  };

  // 2. Ensure EventTypes exist
  const eventTypes = await prisma.eventType.findMany({ select: { id: true, key: true } });
  const typeByKey = new Map(eventTypes.map((t) => [t.key, t.id]));

  // 3. Upsert Venue / Recurring config
  const config = {
    venue: {
      name: 'The Father’s House Church, 90 Alagbole–Akute Road, Iju, Ojodu, Ogun State',
      latitude: 6.6697906,
      longitude: 3.3581822,
      radiusMeters: 100,
    },
    arrivalMinutesBefore: 30,
    reminderMinutes: [60],
    recipients: 'all',
    remindersEnabled: false,
  };

  await prisma.systemSetting.upsert({
    where: { key: 'recurring_services_config' },
    update: { value: JSON.stringify(config) },
    create: { key: 'recurring_services_config', value: JSON.stringify(config) },
  });

  // 4. Upsert all 9 Service Schedules with Google Calendar style RFC 5545 recurrence rules
  for (const s of SERVICE_SCHEDULES) {
    await prisma.serviceSchedule.upsert({
      where: { id: s.id },
      update: {
        title: s.title,
        dayOfWeek: s.dayOfWeek,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        categoryName: s.categoryName,
        enabled: true,
        eventTypeKey: s.eventTypeKey,
        recurrenceRule: s.recurrenceRule as any,
      },
      create: {
        id: s.id,
        title: s.title,
        dayOfWeek: s.dayOfWeek,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        categoryName: s.categoryName,
        enabled: true,
        eventTypeKey: s.eventTypeKey,
        recurrenceRule: s.recurrenceRule as any,
        horizonDays: 28,
      },
    });
    console.log(`✓ Upserted schedule: ${s.title} (${s.id})`);
  }

  // 5. Generate occurrences for next 28 days without duplicates
  const now = new Date();
  let totalCreated = 0;

  for (const schedule of SERVICE_SCHEDULES) {
    const occs = occurrences(schedule, now, 28);
    const categoryId = catMap[schedule.categoryName] || sundayCat.id;
    const eventTypeId = schedule.eventTypeKey ? typeByKey.get(schedule.eventTypeKey) ?? null : null;

    const meetingsData = occs.map(({ startTime, endTime }) => {
      const expectedArrivalTime = new Date(startTime.getTime() - config.arrivalMinutesBefore * 60000);
      return {
        serviceScheduleId: schedule.id,
        occurrenceStart: startTime,
        eventTypeId,
        visibility: 'PUBLIC' as const,
        title: schedule.title,
        categoryId,
        meetingDate: startTime,
        startTime,
        endTime,
        expectedArrivalTime,
        attendanceOpenTime: new Date(expectedArrivalTime.getTime() - 30 * 60000),
        attendanceCloseTime: endTime || new Date(startTime.getTime() + 10 * 60000),
        locationName: config.venue.name,
        latitude: config.venue.latitude,
        longitude: config.venue.longitude,
        geofenceRadiusMeters: config.venue.radiusMeters,
        isCompulsory: false,
      };
    });

    const res = await prisma.meeting.createMany({
      data: meetingsData,
      skipDuplicates: true,
    });
    totalCreated += res.count;
    console.log(`✓ ${schedule.title}: created ${res.count} new occurrence(s) (window count: ${occs.length})`);
  }

  const allMeetings = await prisma.meeting.findMany({
    where: { serviceScheduleId: { in: SERVICE_SCHEDULES.map((s) => s.id) } },
    orderBy: { startTime: 'asc' },
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });

  console.log(`\n🎉 Total scheduled recurring meetings in DB: ${allMeetings.length}`);
  for (const m of allMeetings) {
    const lagosStr = new Date(m.startTime.getTime() + 60 * 60000).toISOString().replace('Z', '+01:00');
    console.log(`  - ${m.title} | Lagos Time: ${lagosStr} | Status: ${m.status}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
