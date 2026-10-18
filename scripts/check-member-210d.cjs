const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const m = await prisma.member.findUnique({
    where: { id: '210d75ac-f197-4569-bff9-a7af1ef0bcbb' },
    include: { user: true, approvedMember: true }
  });
  console.log('Member in PG:', m);
  await prisma.$disconnect();
}
main().catch(console.error);
