const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const records = await prisma.attendanceRecord.findMany({
    where: { meetingId: '063464ed-3d74-4948-9460-09dbdd66e5bb' },
    include: { member: true }
  });
  console.log(`Meeting 0634... has ${records.length} records in PG:`);
  for (const r of records) {
    console.log(`  - [${r.id}] ${r.member.firstName} ${r.member.lastName} (${r.status}) method=${r.method} time=${r.actualArrivalTime}`);
  }
  await prisma.$disconnect();
}

main().catch(console.error);
