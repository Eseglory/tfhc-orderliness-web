const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const allRecords = await prisma.attendanceRecord.findMany({
    include: {
      member: {
        include: { user: true }
      },
      meeting: true
    }
  });

  console.log(`Total attendance records in database: ${allRecords.length}`);

  const recordsWithoutUser = allRecords.filter(r => !r.member?.user);
  console.log(`Records where member has NO user: ${recordsWithoutUser.length}`);
  recordsWithoutUser.forEach(r => {
    console.log(`  Record [${r.id}] Meeting: "${r.meeting.title}" (${r.meeting.startTime.toISOString()}) | Status: ${r.status} | Arrival: ${r.actualArrivalTime} | Member: ${r.member?.firstName} ${r.member?.lastName} (id: ${r.memberId})`);
  });

  const recordsWithoutMember = allRecords.filter(r => !r.member);
  console.log(`Records with NO member: ${recordsWithoutMember.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
