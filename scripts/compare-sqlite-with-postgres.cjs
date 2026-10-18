const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  console.log('=== CHECKING POSTGRESQL FOR MERCY EXCUSE & APPROVAL ===');
  const excuseId = 'ee87c34f-d8b2-4a2f-842b-61d56a2987a8';
  const approvalId = 'cffbdb58-ebd1-464b-bfd9-d63f28113dd5';

  const excuse = await prisma.absenceExcuse.findUnique({
    where: { id: excuseId },
    include: { member: true }
  });
  console.log('PostgreSQL AbsenceExcuse:', excuse);

  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    include: { requestedByMember: true }
  });
  console.log('PostgreSQL ApprovalRequest:', approval);

  // Check all absence excuses for Mercy in PG
  const allMercyExcuses = await prisma.absenceExcuse.findMany({
    where: { memberId: '459baa9f-190f-4296-a8c0-7a927e58dfb6' }
  });
  console.log('All Mercy Excuses in PG:', allMercyExcuses.length);
  for (const e of allMercyExcuses) {
    console.log(`  - [${e.id}] status=${e.status} type=${e.requestType} reason=${e.reason?.slice(0, 50)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
