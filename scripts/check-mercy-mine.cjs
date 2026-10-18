const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function checkMercyMine() {
  const memberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  const excuses = await prisma.absenceExcuse.findMany({
    where: { memberId },
    include: {
      meeting: { select: { id: true, title: true, startTime: true, endTime: true, locationName: true } },
      approvalRequest: {
        include: {
          workflow: { select: { key: true, name: true } },
          actions: { select: { stepOrder: true, stepName: true, decision: true, comment: true, createdAt: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Mercy getMyExcuses returned ${excuses.length} items:`);
  for (const e of excuses) {
    console.log(`- ID: ${e.id} | Status: ${e.status} | Reason: ${e.reason.slice(0, 40)}... | Actions: ${e.approvalRequest?.actions?.length || 0}`);
  }
}

checkMercyMine().catch(console.error).finally(() => prisma.$disconnect());
