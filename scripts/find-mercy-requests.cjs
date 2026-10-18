const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  console.log('=== 1. FIND MERCY USER & MEMBER ===');
  const user = await prisma.user.findFirst({
    where: { email: { contains: 'angelmercy4u', mode: 'insensitive' } },
    include: { member: true }
  });
  console.log('User:', user ? { id: user.id, email: user.email, memberId: user.member?.id } : null);

  const members = await prisma.member.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Mercy', mode: 'insensitive' } },
        { lastName: { contains: 'Mercy', mode: 'insensitive' } },
        { firstName: { contains: 'Ogbeide', mode: 'insensitive' } },
        { lastName: { contains: 'Ogbeide', mode: 'insensitive' } },
      ]
    },
    include: { user: true }
  });
  console.log(`Members found matching Mercy/Ogbeide (${members.length}):`);
  for (const m of members) {
    console.log(`  - [${m.id}] ${m.firstName} ${m.lastName} | User: ${m.user?.email || 'NO USER'} | Status: ${m.status}`);
  }

  const memberIds = members.map(m => m.id);
  const userIds = user ? [user.id] : [];

  console.log('\n=== 2. WELFARE REQUESTS ===');
  const welfare = await prisma.welfareRequest.findMany({
    where: {
      OR: [
        { memberId: { in: memberIds } },
        { requesterId: { in: memberIds } }
      ]
    }
  }).catch(() => []);
  console.log(`Welfare requests: ${welfare.length}`);
  console.log(JSON.stringify(welfare, null, 2));

  console.log('\n=== 3. ABSENCE EXCUSES ===');
  const excuses = await prisma.absenceExcuse.findMany({
    where: { memberId: { in: memberIds } },
    include: { meeting: true }
  });
  console.log(`Absence excuses: ${excuses.length}`);
  console.log(JSON.stringify(excuses, null, 2));

  console.log('\n=== 4. CORRECTION REQUESTS ===');
  const corrections = await prisma.correctionRequest.findMany({
    where: { memberId: { in: memberIds } },
    include: { meeting: true }
  });
  console.log(`Correction requests: ${corrections.length}`);
  console.log(JSON.stringify(corrections, null, 2));

  console.log('\n=== 5. APPOINTMENTS ===');
  const appointments = await prisma.appointment.findMany({
    where: { memberId: { in: memberIds } }
  }).catch(() => []);
  console.log(`Appointments: ${appointments.length}`);
  console.log(JSON.stringify(appointments, null, 2));

  console.log('\n=== 6. APPROVAL REQUESTS ===');
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      OR: [
        { memberId: { in: memberIds } },
        { requesterId: { in: memberIds } }
      ]
    }
  }).catch(() => []);
  console.log(`Approval requests: ${approvals.length}`);
  console.log(JSON.stringify(approvals, null, 2));

  console.log('\n=== 7. AUDIT LOGS FOR MERCY ===');
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        { entityId: { in: [...memberIds, ...userIds] } },
        { details: { contains: 'Mercy', mode: 'insensitive' } },
        { details: { contains: 'angelmercy4u', mode: 'insensitive' } }
      ]
    },
    orderBy: { timestamp: 'desc' },
    take: 20
  });
  console.log(`Audit logs count: ${auditLogs.length}`);
  for (const a of auditLogs) {
    console.log(`  - [${a.timestamp.toISOString()}] Action: ${a.action} | Entity: ${a.entity} | EntityId: ${a.entityId} | Details: ${a.details}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
