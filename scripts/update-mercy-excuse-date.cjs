const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  await prisma.absenceExcuse.update({
    where: { id: 'ee87c34f-d8b2-4a2f-842b-61d56a2987a8' },
    data: {
      startDate: new Date('2026-10-18T00:00:00.000Z'),
      endDate: new Date('2026-10-18T23:59:59.999Z')
    }
  });
  console.log('Updated Mercy excuse endDate to cover full day of 2026-10-18.');
  await prisma.$disconnect();
}
main().catch(console.error);
