const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      createdAt: { gte: new Date('2026-10-17T00:00:00.000Z') }
    },
    include: {
      member: { include: { user: true } },
      meeting: true
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Total attendance records since Oct 17: ${records.length}`);
  
  // Group by meeting
  const byMeeting = new Map();
  records.forEach(r => {
    const title = r.meeting.title;
    if (!byMeeting.has(title)) byMeeting.set(title, []);
    byMeeting.get(title).push(r);
  });

  for (const [title, list] of byMeeting.entries()) {
    console.log(`\n=== MEETING: "${title}" (Total: ${list.length}) ===`);
    const presentList = list.filter(r => r.status !== 'ABSENT');
    const absentList = list.filter(r => r.status === 'ABSENT');
    console.log(`  Present/Late/Early/Grace: ${presentList.length}`);
    console.log(`  Absent: ${absentList.length}`);
    console.log(`  Present members:`, presentList.map(r => `${r.member.firstName} ${r.member.lastName} (${r.status}, ${r.method}, arrival: ${r.actualArrivalTime?.toISOString()})`).join(', '));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
