const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function checkMercyAttendanceHistory() {
  const memberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  const records = await prisma.attendanceRecord.findMany({
    where: { memberId },
    include: {
      meeting: {
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          locationName: true,
          category: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log(`Mercy has ${records.length} attendance records:`);
  for (const r of records) {
    console.log(`- [${r.status}] ${r.meeting?.title} | Start: ${r.meeting?.startTime.toISOString()} | Points: ${r.pointsEarned}`);
  }
}

checkMercyAttendanceHistory().catch(console.error).finally(() => prisma.$disconnect());
