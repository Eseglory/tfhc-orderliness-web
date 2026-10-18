const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const u = await prisma.user.findUnique({
    where: { id: 'e316c5a8-1820-45b8-81ee-bd083f77e5b4' },
    include: { member: true }
  });
  console.log('Leader:', u?.email, u?.role, u?.member?.firstName, u?.member?.lastName);
  await prisma.$disconnect();
}
main().catch(console.error);
