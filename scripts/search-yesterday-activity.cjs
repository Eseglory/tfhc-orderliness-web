const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const mercyMemberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  const mercyUserId = '9a9c6a28-04f6-43c4-b1ae-1865cd0c835d';

  console.log('=== 1. ALL WELFARE REQUESTS EVER ===');
  const allWelfare = await prisma.welfareRequest.findMany({
    include: { requestedByMember: true }
  });
  console.log(`Total welfare requests in db: ${allWelfare.length}`);
  for (const w of allWelfare) {
    console.log(`- [${w.id}] Member: ${w.requestedByMember?.firstName} ${w.requestedByMember?.lastName} (${w.requestedByMemberId}) | Status: ${w.status} | Amount: ${w.amount} | Purpose: ${w.purpose} | CreatedAt: ${w.createdAt.toISOString()}`);
  }

  console.log('\n=== 2. ALL ABSENCE EXCUSES EVER ===');
  const allExcuses = await prisma.absenceExcuse.findMany({
    include: { member: true, meeting: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Total excuses in db: ${allExcuses.length}`);
  for (const e of allExcuses) {
    console.log(`- [${e.id}] Member: ${e.member?.firstName} ${e.member?.lastName} (${e.memberId}) | Meeting: ${e.meeting?.title} | Status: ${e.status} | CreatedAt: ${e.createdAt.toISOString()} | Reason: ${e.reason}`);
  }

  console.log('\n=== 3. ALL CORRECTIONS EVER ===');
  const allCorrections = await prisma.correctionRequest.findMany({
    include: { member: true, meeting: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Total corrections in db: ${allCorrections.length}`);
  for (const c of allCorrections) {
    console.log(`- [${c.id}] Member: ${c.member?.firstName} ${c.member?.lastName} (${c.memberId}) | Meeting: ${c.meeting?.title} | Status: ${c.status} | CreatedAt: ${c.createdAt.toISOString()} | Reason: ${c.reason}`);
  }

  console.log('\n=== 4. ALL APPROVAL REQUESTS EVER ===');
  const allApprovals = await prisma.approvalRequest.findMany({
    include: { requestedByMember: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Total approval requests in db: ${allApprovals.length}`);
  for (const a of allApprovals) {
    console.log(`- [${a.id}] Type: ${a.requestType} | Member: ${a.requestedByMember?.firstName} ${a.requestedByMember?.lastName} (${a.requestedByMemberId}) | Status: ${a.status} | CreatedAt: ${a.createdAt.toISOString()} | Summary: ${a.summary}`);
  }

  console.log('\n=== 5. ALL NOTIFICATIONS FOR MERCY ===');
  const notifs = await prisma.memberNotification.findMany({
    where: { memberId: mercyMemberId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(`Notifications for Mercy (${notifs.length}):`);
  for (const n of notifs) {
    console.log(`- [${n.createdAt.toISOString()}] Type: ${n.type} | Title: ${n.title} | Body: ${n.body} | Data:`, JSON.stringify(n.data));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
