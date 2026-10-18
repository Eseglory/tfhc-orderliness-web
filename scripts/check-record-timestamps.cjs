const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function check() {
  const records = await prisma.attendanceRecord.findMany({
    where: { meetingId: 'e07e3136-636d-4f5f-abca-0396a7540e43' },
    select: { id: true, status: true, createdAt: true, updatedAt: true, method: true, member: { select: { firstName: true, lastName: true } } },
    take: 10
  });
  console.log(records);
}
check().catch(console.error).finally(() => prisma.$disconnect());
