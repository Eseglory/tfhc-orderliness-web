const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const mercyMemberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  const recs = await prisma.attendanceRecord.findMany({
    where: {
      memberId: mercyMemberId,
      createdAt: { gte: new Date('2026-10-18T00:00:00.000Z') }
    },
    include: { meeting: true }
  });
  console.log(`Mercy has ${recs.length} attendance records created today:`);
  for (const r of recs) {
    console.log(`- [${r.id}] Meeting: ${r.meeting.title} | Status: ${r.status}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
