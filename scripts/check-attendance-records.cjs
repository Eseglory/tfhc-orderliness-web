const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3'
    }
  }
});

async function main() {
  console.log('=== INVESTIGATING ATTENDANCE AND MEMBER RECORDS ===\n');

  // 1. Total counts
  const memberCount = await prisma.member.count();
  const userCount = await prisma.user.count();
  const meetingCount = await prisma.meeting.count();
  const totalAttendanceCount = await prisma.attendanceRecord.count();

  console.log(`Members: ${memberCount}`);
  console.log(`Users: ${userCount}`);
  console.log(`Meetings: ${meetingCount}`);
  console.log(`Total Attendance Records: ${totalAttendanceCount}`);

  // 2. Attendance records for today (2026-10-18)
  const todayStart = new Date('2026-10-18T00:00:00.000Z');
  const todayEnd = new Date('2026-10-18T23:59:59.999Z');

  const todayMeetings = await prisma.meeting.findMany({
    where: {
      meetingDate: { gte: todayStart, lte: todayEnd }
    },
    include: {
      _count: { select: { attendanceRecords: true } }
    }
  });

  console.log('\n--- Meetings on 2026-10-18 ---');
  todayMeetings.forEach(m => {
    console.log(`[${m.id}] "${m.title}" -> Status: ${m.status}, Date: ${m.meetingDate.toISOString()}, Records: ${m._count.attendanceRecords}`);
  });

  // 3. Today's attendance records
  const todayRecords = await prisma.attendanceRecord.findMany({
    where: {
      OR: [
        { meeting: { meetingDate: { gte: todayStart, lte: todayEnd } } },
        { createdAt: { gte: todayStart, lte: todayEnd } }
      ]
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, memberCode: true, userId: true } },
      meeting: { select: { id: true, title: true, meetingDate: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n--- Today's Attendance Records (${todayRecords.length}) ---`);
  todayRecords.forEach(r => {
    console.log(`  - Record ${r.id}: Member: ${r.member?.firstName} ${r.member?.lastName} (${r.member?.memberCode}) | Meeting: "${r.meeting?.title}" | Status: ${r.status} | Method: ${r.method} | Type: ${r.attendanceType} | Time: ${r.actualArrivalTime?.toISOString() || r.createdAt.toISOString()}`);
  });

  // 4. Any records where member or meeting is missing/broken?
  const orphanedRecords = await prisma.attendanceRecord.findMany({
    where: {
      OR: [
        { memberId: null },
        { meetingId: null }
      ]
    }
  });
  console.log(`\nOrphaned records count: ${orphanedRecords.length}`);

  // 5. Let's inspect recent users and their linked members
  const usersWithoutMember = await prisma.user.findMany({
    where: { member: null },
    select: { id: true, email: true, role: true }
  });
  console.log(`Users without member profile: ${usersWithoutMember.length}`);
  if (usersWithoutMember.length > 0) {
    console.log('Sample users without member:', usersWithoutMember.slice(0, 5));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
