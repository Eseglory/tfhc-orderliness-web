const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const mercyMemberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  const mercyUserId = '9a9c6a28-04f6-43c4-b1ae-1865cd0c835d';

  console.log('=== 1. MERCY AVAILABILITY RESPONSES ===');
  const availResponses = await prisma.weeklyAvailabilityResponse.findMany({
    where: { memberId: mercyMemberId },
    include: { cycle: true }
  });
  console.log(`Availability responses (${availResponses.length}):`, JSON.stringify(availResponses, null, 2));

  console.log('\n=== 2. MERCY SERVICE COMMITMENTS ===');
  const commitments = await prisma.memberServiceCommitment.findMany({
    where: { memberId: mercyMemberId },
    include: { meeting: true }
  });
  console.log(`Service commitments (${commitments.length}):`, JSON.stringify(commitments, null, 2));

  console.log('\n=== 3. MERCY EVENT RESPONSES ===');
  const eventResponses = await prisma.eventResponse.findMany({
    where: { memberId: mercyMemberId },
    include: { meeting: true }
  });
  console.log(`Event responses (${eventResponses.length}):`, JSON.stringify(eventResponses, null, 2));

  console.log('\n=== 4. MERCY ATTENDANCE RECORDS ===');
  const att = await prisma.attendanceRecord.findMany({
    where: { memberId: mercyMemberId },
    include: { meeting: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(`Attendance records (${att.length}):`);
  for (const a of att) {
    console.log(`- [${a.status}] ${a.meeting.title} (${a.meeting.startTime.toISOString()}) | Created: ${a.createdAt.toISOString()} | Arrival: ${a.actualArrivalTime?.toISOString()}`);
  }

  console.log('\n=== 5. CHECK ALL UNLINKED MEMBERS OR DUPLICATES OF MERCY ===');
  const allMembers = await prisma.member.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Mercy', mode: 'insensitive' } },
        { lastName: { contains: 'Mercy', mode: 'insensitive' } },
        { firstName: { contains: 'Ogbeide', mode: 'insensitive' } },
        { lastName: { contains: 'Ogbeide', mode: 'insensitive' } },
      ]
    },
    include: { user: true, approvedMember: true }
  });
  console.log(`Matching members (${allMembers.length}):`, JSON.stringify(allMembers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
