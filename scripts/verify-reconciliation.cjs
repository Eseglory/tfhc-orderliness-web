const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const mercyMemberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';

  console.log('=== 1. VERIFY MERCY EXCUSES IN PG ===');
  const excuses = await prisma.absenceExcuse.findMany({
    where: { memberId: mercyMemberId },
    include: { approvalRequest: true }
  });
  console.log(`Mercy has ${excuses.length} absence excuse(s) in PG:`);
  for (const e of excuses) {
    console.log(`- [${e.id}] Status: ${e.status} | Type: ${e.requestType} | Dates: ${e.startDate?.toISOString()} to ${e.endDate?.toISOString()} | ApprovalReq: ${e.approvalRequestId} (${e.approvalRequest?.status})`);
    console.log(`  Reason: ${e.reason}`);
  }

  console.log('\n=== 2. VERIFY MERCY PAYMENTS IN PG ===');
  const p1 = await prisma.payment.findUnique({ where: { reference: 'PMT-202610-AFA0E6C1' } });
  const p2 = await prisma.payment.findUnique({ where: { reference: 'PMT-202610-AB570F22' } });
  console.log('Restored Mercy Payments:', p1 ? `${p1.reference} (₦${p1.amount})` : 'null', p2 ? `${p2.reference} (₦${p2.amount})` : 'null');
  const payments = await prisma.payment.findMany({
    where: { memberId: mercyMemberId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(`Mercy recent payments in PG (${payments.length}):`);
  for (const p of payments) {
    console.log(`- [${p.id}] Ref: ${p.reference} | Amount: ${p.amount} | Status: ${p.status} | PayerRef: ${p.payerReference} | Created: ${p.createdAt.toISOString()}`);
  }

  console.log('\n=== 3. VERIFY RACHEL USER & MEMBER IN PG ===');
  const rachelUser = await prisma.user.findFirst({
    where: { email: 'akomolederachael@gmail.com' },
    include: { member: true }
  });
  console.log('Rachel User in PG:', rachelUser ? {
    id: rachelUser.id,
    email: rachelUser.email,
    role: rachelUser.role,
    passwordAuthEnabled: rachelUser.passwordAuthEnabled,
    member: rachelUser.member ? `${rachelUser.member.firstName} ${rachelUser.member.lastName} (${rachelUser.member.id})` : 'NO MEMBER'
  } : 'NOT FOUND');

  console.log('\n=== 4. VERIFY MARTHA SATURDAY ATTENDANCE IN PG ===');
  const marthaRec = await prisma.attendanceRecord.findFirst({
    where: {
      memberId: '8bf8d6a1-39aa-480e-a690-ed0ea8ce0691',
      meetingId: '063464ed-3d74-4948-9460-09dbdd66e5bb'
    }
  });
  console.log('Martha Sat Attendance in PG:', {
    id: marthaRec?.id,
    status: marthaRec?.status,
    pointsEarned: marthaRec?.pointsEarned,
    actualArrivalTime: marthaRec?.actualArrivalTime?.toISOString(),
    method: marthaRec?.method
  });

  await prisma.$disconnect();
}

main().catch(console.error);
