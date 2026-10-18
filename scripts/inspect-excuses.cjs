const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const excuses = await prisma.excuseRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { member: true, meeting: true },
  });
  console.log('=== LATEST 5 EXCUSES ===');
  for (const e of excuses) {
    console.log(`- [${e.id}] ${e.member.firstName} ${e.member.lastName} | Meeting: ${e.meeting.title} | Status: ${e.status} | CreatedAt: ${e.createdAt.toISOString()} | Reason: ${e.reason}`);
  }

  const corrections = await prisma.correctionRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { member: true, meeting: true },
  });
  console.log('\n=== LATEST 5 CORRECTIONS ===');
  for (const c of corrections) {
    console.log(`- [${c.id}] ${c.member.firstName} ${c.member.lastName} | Meeting: ${c.meeting.title} | Status: ${c.status} | Requested: ${c.requestedStatus} | CreatedAt: ${c.createdAt.toISOString()} | Reason: ${c.reason}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
