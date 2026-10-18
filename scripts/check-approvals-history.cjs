const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function checkApprovalsHistory() {
  const history = await prisma.approvalRequest.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] } },
    include: {
      workflow: true,
      requestedByMember: true,
      actions: {
        include: { actorUser: true }
      }
    },
    orderBy: { decidedAt: 'desc' },
    take: 10
  });

  console.log(`Approvals history has ${history.length} items:`);
  for (const h of history) {
    console.log(`- [${h.id}] Type: ${h.requestType} | Status: ${h.status} | Requester: ${h.requestedByMember?.firstName} ${h.requestedByMember?.lastName} | DecidedAt: ${h.decidedAt?.toISOString()} | Summary: ${h.summary}`);
  }
}

checkApprovalsHistory().catch(console.error).finally(() => prisma.$disconnect());
