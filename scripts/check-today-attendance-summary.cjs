const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function checkTodayAttendance() {
  const startOfDay = new Date('2026-10-18T00:00:00.000Z');
  const endOfDay = new Date('2026-10-18T23:59:59.999Z');

  const meetings = await prisma.meeting.findMany({
    where: {
      startTime: { gte: startOfDay, lte: endOfDay }
    },
    include: {
      attendanceRecords: {
        include: {
          member: { select: { firstName: true, lastName: true } }
        }
      }
    }
  });

  console.log(`Found ${meetings.length} meetings today (Oct 18 2026):`);
  for (const m of meetings) {
    console.log(`- Meeting: "${m.title}" (${m.id}) | Records count: ${m.attendanceRecords.length}`);
    const statusCounts = {};
    for (const r of m.attendanceRecords) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
    console.log(`  Statuses:`, statusCounts);
  }
}

checkTodayAttendance().catch(console.error).finally(() => prisma.$disconnect());
