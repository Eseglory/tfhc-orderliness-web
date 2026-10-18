const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const mercyMemberId = '459baa9f-190f-4296-a8c0-7a927e58dfb6';
  
  const avail = await prisma.weeklyAvailabilityResponse.findMany({
    where: { memberId: mercyMemberId },
    include: { cycle: true }
  });
  console.log('AVAIL RESPONSES:', JSON.stringify(avail, null, 2));

  const comm = await prisma.memberServiceCommitment.findMany({
    where: { memberId: mercyMemberId },
    include: { meeting: true }
  });
  console.log('COMMITMENTS:', JSON.stringify(comm, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
