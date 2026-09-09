/**
 * Rich demo data for local walkthroughs. LOCAL DATABASES ONLY.
 * Run: DATABASE_URL=postgres://...localhost.../tfhc_orderliness_db npx ts-node prisma/demo-seed.ts
 * Wipes all meetings/attendance/notifications/flags/excuses, then recreates a full scenario.
 */
import { PrismaClient, MeetingStatus, AttendanceStatus, MemberStatus } from '@prisma/client';

const prisma = new PrismaClient();

function assertLocal() {
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('demo-seed is restricted to local development databases.');
  }
}

// Mirror AvailabilityService.weekStart (Africa/Lagos, Monday-based) closely enough for local demo.
function weekStartUTC(now = new Date()) {
  const tz = process.env.TFHC_TIMEZONE || 'Africa/Lagos';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const val = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const weekday = p.find((x) => x.type === 'weekday')?.value ?? 'Mon';
  const date = new Date(Date.UTC(val('year'), val('month') - 1, val('day')));
  const offset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  date.setUTCDate(date.getUTCDate() - offset[weekday]);
  return date;
}

const POINTS: Partial<Record<AttendanceStatus, number>> = {
  EARLY: 12, ON_TIME: 10, GRACE_PERIOD: 7, LATE: 4, EXCUSED: 0, ABSENT: 0, EXEMPT: 0,
};

async function main() {
  assertLocal();
  console.log('🎬 Seeding demo data…');

  const now = new Date();
  const minutes = (n: number) => new Date(now.getTime() + n * 60000);
  const days = (n: number) => new Date(now.getTime() + n * 86400000);

  const categories = await prisma.meetingCategory.findMany();
  const cat = (name: string) => categories.find((c) => c.name === name) ?? categories[0];

  const members = await prisma.member.findMany({ where: { status: MemberStatus.ACTIVE }, orderBy: { memberCode: 'asc' } });
  if (!members.length) throw new Error('Run the base seed first (yarn prisma:seed).');
  const demoMember = members.find((m) => m.memberCode === 'TFHC-2001') ?? members[0];

  const VENUE = { locationName: 'TFHC Main Auditorium', latitude: 6.5244, longitude: 3.3792, geofenceRadiusMeters: 150 };

  // ---- full reset of transactional data (local demo DB only) ----
  await prisma.attendanceRecord.deleteMany({});
  await prisma.absenceExcuse.deleteMany({});
  await prisma.correctionRequest.deleteMany({});
  await prisma.meetingSummary.deleteMany({});
  await prisma.memberServiceCommitment.deleteMany({});
  await prisma.weeklyAvailabilityResponse.deleteMany({});
  await prisma.meeting.deleteMany({});
  await prisma.memberNotification.deleteMany({});
  await prisma.followUpFlag.deleteMany({});

  // ---- 6 past CLOSED meetings with attendance across all members ----
  const pastPlan = [
    { name: 'Unit Meeting', title: 'Saturday Unit Meeting', ago: 42 },
    { name: 'Sunday Service', title: 'Sunday Grand Service', ago: 36 },
    { name: 'Midweek Service', title: 'Midweek Communion Service', ago: 33 },
    { name: 'Unit Meeting', title: 'Saturday Unit Meeting', ago: 28 },
    { name: 'Training', title: 'Protocol & Orderliness Training', ago: 21 },
    { name: 'Sunday Service', title: 'Sunday Grand Service', ago: 8 },
  ];

  // per-member status pattern (index into pastPlan) — gives the leaderboard a spread
  const patterns: AttendanceStatus[][] = [
    ['EARLY', 'EARLY', 'ON_TIME', 'EARLY', 'ON_TIME', 'EARLY'],       // star
    ['ON_TIME', 'ON_TIME', 'LATE', 'ON_TIME', 'ON_TIME', 'GRACE_PERIOD'],
    ['EARLY', 'LATE', 'ON_TIME', 'ABSENT', 'ON_TIME', 'ON_TIME'],
    ['LATE', 'ABSENT', 'EXCUSED', 'ON_TIME', 'LATE', 'ON_TIME'],
    ['ON_TIME', 'EARLY', 'EARLY', 'ON_TIME', 'ABSENT', 'EARLY'],
    ['GRACE_PERIOD', 'ON_TIME', 'ABSENT', 'LATE', 'ON_TIME', 'ON_TIME'],
    ['ABSENT', 'EXCUSED', 'LATE', 'ABSENT', 'ON_TIME', 'LATE'],
  ];

  for (let i = 0; i < pastPlan.length; i++) {
    const plan = pastPlan[i];
    const start = days(-plan.ago);
    const meeting = await prisma.meeting.create({
      data: {
        title: `${plan.title}`,
        categoryId: cat(plan.name).id,
        meetingDate: start, startTime: start,
        expectedArrivalTime: start,
        attendanceOpenTime: new Date(start.getTime() - 45 * 60000),
        attendanceCloseTime: new Date(start.getTime() + 90 * 60000),
        endTime: new Date(start.getTime() + 120 * 60000),
        status: MeetingStatus.CLOSED,
        pointWeight: cat(plan.name).pointWeight,
        ...VENUE,
      },
    });

    let present = 0, early = 0, onTime = 0, late = 0, grace = 0, absent = 0, excused = 0;
    for (let m = 0; m < members.length; m++) {
      const status = (patterns[m] ?? patterns[0])[i] ?? 'ON_TIME';
      const attended = ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(status);
      await prisma.attendanceRecord.create({
        data: {
          memberId: members[m].id, meetingId: meeting.id,
          expectedArrivalTime: start,
          actualArrivalTime: attended ? new Date(start.getTime() + (status === 'EARLY' ? -8 : status === 'ON_TIME' ? 2 : status === 'GRACE_PERIOD' ? 8 : 25) * 60000) : null,
          status: status as AttendanceStatus,
          pointsEarned: (POINTS[status as AttendanceStatus] ?? 0) * cat(plan.name).pointWeight,
          gpsLat: attended ? VENUE.latitude : null,
          gpsLong: attended ? VENUE.longitude : null,
          distanceFromVenue: attended ? Math.round(Math.random() * 60) : null,
          method: 'SYSTEM_GEO_QR',
        },
      });
      if (attended) present++;
      if (status === 'EARLY') early++;
      if (status === 'ON_TIME') onTime++;
      if (status === 'LATE') late++;
      if (status === 'GRACE_PERIOD') grace++;
      if (status === 'ABSENT') absent++;
      if (status === 'EXCUSED') excused++;
    }
    await prisma.meetingSummary.create({
      data: {
        meetingId: meeting.id,
        expectedCount: members.length, presentCount: present, absentCount: absent,
        earlyCount: early, onTimeCount: onTime, gracePeriodCount: grace, lateCount: late, excusedCount: excused,
        attendanceRate: Math.round((present / members.length) * 1000) / 10,
        punctualityRate: present ? Math.round(((early + onTime) / present) * 1000) / 10 : 0,
      },
    });
  }

  // ---- 1 ACTIVE meeting (check-in demo) — expected arrival ~10 min out so a
  // live check-in lands as EARLY/ON_TIME rather than LATE ----
  const activeStart = minutes(10);
  const active = await prisma.meeting.create({
    data: {
      title: 'Live Saturday Unit Meeting',
      categoryId: cat('Unit Meeting').id,
      meetingDate: activeStart, startTime: activeStart,
      expectedArrivalTime: activeStart,
      attendanceOpenTime: minutes(-30),
      attendanceCloseTime: minutes(120),
      status: MeetingStatus.ACTIVE,
      isCompulsory: true,
      pointWeight: cat('Unit Meeting').pointWeight,
      qrSecret: 'demo-live-meeting-secret',
      ...VENUE,
    },
  });

  // ---- 3 SCHEDULED meetings this week (upcoming + availability) ----
  const wkStart = weekStartUTC(now);
  for (const [idx, spec] of [
    { name: 'Midweek Service', title: 'Midweek Communion Service', dow: 3, hour: 18 },
    { name: 'Unit Meeting', title: 'Saturday Unit Meeting', dow: 6, hour: 9 },
    { name: 'Sunday Service', title: 'Sunday Grand Service', dow: 7, hour: 8 },
  ].entries()) {
    const s = new Date(wkStart);
    s.setUTCDate(s.getUTCDate() + spec.dow - 1);
    s.setUTCHours(spec.hour, 0, 0, 0);
    if (s <= now) s.setUTCDate(s.getUTCDate() + 7); // keep it in the future
    await prisma.meeting.create({
      data: {
        title: `${spec.title}`,
        categoryId: cat(spec.name).id,
        meetingDate: s, startTime: s,
        expectedArrivalTime: s,
        attendanceOpenTime: new Date(s.getTime() - 45 * 60000),
        attendanceCloseTime: new Date(s.getTime() + 90 * 60000),
        status: MeetingStatus.SCHEDULED,
        pointWeight: cat(spec.name).pointWeight,
        ...VENUE,
      },
    });
  }

  // ---- weekly availability cycle OPEN ----
  await prisma.weeklyAvailabilityCycle.upsert({
    where: { weekStart: wkStart },
    update: { state: 'OPEN', opensAt: days(-1), closesAt: days(2) },
    create: { weekStart: wkStart, state: 'OPEN', opensAt: days(-1), closesAt: days(2) },
  });

  // ---- notifications for the demo member ----
  await prisma.memberNotification.createMany({
    data: [
      { memberId: demoMember.id, type: 'MEETING_REMINDER', title: 'Live meeting is open', body: 'Saturday Unit Meeting attendance is open now. Check in before it closes.', status: 'UNREAD' },
      { memberId: demoMember.id, type: 'POINTS', title: 'You earned 12 points', body: 'Great punctuality at Sunday Grand Service — +12 points and a 4-week streak.', status: 'UNREAD' },
      { memberId: demoMember.id, type: 'LEADERBOARD', title: 'Leaderboard update', body: 'You moved up to #2 in the Media & IT sub-team this month.', status: 'READ', readAt: days(-2) },
      { memberId: demoMember.id, type: 'ANNOUNCEMENT', title: 'Protocol training this Saturday', body: 'All members should arrive 15 minutes early for the orderliness drill.', status: 'READ', readAt: days(-5) },
    ],
  });

  // ---- 1 pending excuse + 1 pending correction (admin review demo) ----
  const pastForReview = await prisma.meeting.findFirst({ where: { status: MeetingStatus.CLOSED }, orderBy: { startTime: 'desc' } });
  if (pastForReview) {
    const reviewer = members[3];
    await prisma.absenceExcuse.upsert({
      where: { memberId_meetingId: { memberId: reviewer.id, meetingId: pastForReview.id } },
      update: { status: 'PENDING' },
      create: { memberId: reviewer.id, meetingId: pastForReview.id, reason: 'Travelled for a family engagement', category: 'FAMILY', status: 'PENDING' },
    });
    const corrector = members[2];
    await prisma.correctionRequest.create({
      data: { memberId: corrector.id, meetingId: pastForReview.id, requestedStatus: 'ON_TIME', reason: 'I checked in but the QR scan failed; ushers can confirm.', status: 'PENDING' },
    });
  }

  // ---- 1 follow-up flag (admin follow-up demo) ----
  await prisma.followUpFlag.create({
    data: { memberId: members[6].id, flagLevel: 2, flagReason: 'Missed 3 of the last 4 compulsory meetings', isResolved: false, notes: 'Assign a mentor and check in this week.' },
  });

  const counts = {
    meetings: await prisma.meeting.count(),
    attendance: await prisma.attendanceRecord.count(),
    notifications: await prisma.memberNotification.count({ where: { memberId: demoMember.id } }),
  };
  console.log('✅ Demo data ready:', counts);
  console.log(`   Demo member: ${demoMember.firstName} ${demoMember.lastName} (${demoMember.memberCode})`);
  console.log('   Active meeting QR secret: demo-live-meeting-secret');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
