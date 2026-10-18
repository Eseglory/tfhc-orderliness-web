const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const pendingCorrections = await prisma.correctionRequest.findMany({
    where: { status: 'PENDING' },
    include: { member: true, meeting: true }
  });
  console.log(`Pending Corrections (${pendingCorrections.length}):`);
  pendingCorrections.forEach(c => {
    console.log(`  - [${c.id}] ${c.member.firstName} ${c.member.lastName} for "${c.meeting.title}" (${c.meeting.startTime.toISOString()}): requested ${c.requestedStatus}, reason: "${c.reason}"`);
  });

  const pendingExcuses = await prisma.absenceExcuse.findMany({
    where: { status: 'PENDING' },
    include: { member: true, meeting: true }
  });
  console.log(`\nPending Excuses (${pendingExcuses.length}):`);
  pendingExcuses.forEach(e => {
    console.log(`  - [${e.id}] ${e.member.firstName} ${e.member.lastName} for "${e.meeting?.title || 'Period'}": reason: "${e.reason}"`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
