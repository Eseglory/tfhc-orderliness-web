const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const corrections = await prisma.correctionRequest.findMany({
    include: {
      member: true,
      meeting: true
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log(`Recent correction requests: ${corrections.length}`);
  corrections.forEach(c => {
    console.log(`  [${c.createdAt.toISOString()}] Member: ${c.member.firstName} ${c.member.lastName} | Meeting: ${c.meeting?.title} | Status: ${c.status} | Reason: ${c.reason}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
