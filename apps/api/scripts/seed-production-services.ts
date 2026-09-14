import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAGOS_OFFSET_MIN = 60;

const SERVICE_SCHEDULES = [
  { id: 'sunday-first', title: 'First Service', dayOfWeek: 0, startMinutes: 420, endMinutes: 480, categoryName: 'Sunday Service' },
  { id: 'sunday-second', title: 'Second Service', dayOfWeek: 0, startMinutes: 510, endMinutes: 600, categoryName: 'Sunday Service' },
  { id: 'sunday-third', title: 'Third Service', dayOfWeek: 0, startMinutes: 630, endMinutes: 720, categoryName: 'Sunday Service' },
  { id: 'tuesday-midweek', title: 'Mid-Week Service', dayOfWeek: 2, startMinutes: 1125, endMinutes: 1215, categoryName: 'Midweek Service' },
  { id: 'thursday-divine', title: 'Divine Intervention Service', dayOfWeek: 4, startMinutes: 480, endMinutes: 600, categoryName: 'Midweek Service' },
];

function occurrences(schedule: typeof SERVICE_SCHEDULES[number], now: Date, days = 28) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MIN * 60000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const results: { startTime: Date; endTime: Date | null }[] = [];
  for (let day = 0; day < days; day++) {
    const date = new Date(midnight + day * 86400000);
    if (date.getUTCDay() !== schedule.dayOfWeek) continue;
    const startTime = new Date(date.getTime() + (schedule.startMinutes - 60) * 60000);
    if (startTime <= now) continue;
    results.push({
      startTime,
      endTime: schedule.endMinutes === null ? null : new Date(date.getTime() + (schedule.endMinutes - 60) * 60000),
    });
  }
  return results;
}

async function main() {
  console.log('Seeding production recurring service schedules...');

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

  const catMap: Record<string, string> = {
    'Sunday Service': sundayCat.id,
    'Midweek Service': midweekCat.id,
  };

  // 2. Ensure EventType SERVICE exists
  const eventType = await prisma.eventType.findUnique({ where: { key: 'SERVICE' } });
  const eventTypeId = eventType?.id ?? null;

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
    remindersEnabled: true,
  };

  await prisma.systemSetting.upsert({
    where: { key: 'recurring_services_config' },
    update: { value: JSON.stringify(config) },
    create: { key: 'recurring_services_config', value: JSON.stringify(config) },
  });

  // 4. Upsert the 5 Service Schedules
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
        eventTypeKey: 'SERVICE',
      },
      create: {
        id: s.id,
        title: s.title,
        dayOfWeek: s.dayOfWeek,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        categoryName: s.categoryName,
        enabled: true,
        eventTypeKey: 'SERVICE',
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
    const categoryId = catMap[schedule.categoryName];

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
    console.log(`✓ ${schedule.title}: generated ${res.count} occurrence(s) (window total: ${occs.length})`);
  }

  const allMeetings = await prisma.meeting.findMany({
    where: { serviceScheduleId: { in: SERVICE_SCHEDULES.map(s => s.id) } },
    orderBy: { startTime: 'asc' },
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });

  console.log(`\n🎉 Total scheduled recurring meetings in DB: ${allMeetings.length}`);
  for (const m of allMeetings) {
    console.log(`  - ${m.title} | ${m.startTime.toISOString()} -> ${m.endTime?.toISOString()} | Status: ${m.status}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
