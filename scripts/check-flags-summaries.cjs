const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const flags = await prisma.followUpFlag.findMany();
  console.log('FollowUpFlags in PG:', flags.length);

  const summaries = await prisma.meetingSummary.findMany();
  console.log('MeetingSummaries in PG:', summaries.length);

  await prisma.$disconnect();
}
main().catch(console.error);
