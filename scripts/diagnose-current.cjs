const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function run() {
  const m = await prisma.member.findUnique({
    where: { id: '97166ab6-edcb-4017-b55f-8b2485285150' },
    include: { user: true }
  });
  console.log('Member 97166...:', m ? `${m.firstName} ${m.lastName} (${m.memberCode})` : 'NOT FOUND');

  const u = await prisma.user.findUnique({
    where: { id: '97166ab6-edcb-4017-b55f-8b2485285150' },
    include: { member: true }
  });
  console.log('User 97166...:', u ? `${u.email} (${u.role})` : 'NOT FOUND');

  // Check recent audit logs
  console.log('\n=== RECENT AUDIT LOGS (last 10) ===');
  const audits = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { actorUser: true }
  });
  for (const a of audits) {
    console.log(`[${a.createdAt.toISOString()}] ${a.action} on ${a.entity} (${a.entityId}) by ${a.actorUser?.email || a.actorUserId}: ${a.reason || ''}`);
  }

  // Check recent excuses
  console.log('\n=== ALL RECENT EXCUSES ===');
  const excuses = await prisma.absenceExcuse.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { member: true, approvalRequest: true }
  });
  for (const e of excuses) {
    console.log(`- [${e.id}] Member: ${e.member.firstName} ${e.member.lastName} | Status: ${e.status} | Cat: ${e.category} | Created: ${e.createdAt.toISOString()} | ApprovalReq: ${e.approvalRequest?.id} (${e.approvalRequest?.status})`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
