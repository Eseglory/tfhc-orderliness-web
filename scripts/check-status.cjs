const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function check() {
  const m = await prisma.meeting.findUnique({
    where: { id: 'e07e3136-636d-4f5f-abca-0396a7540e43' },
    select: { id: true, title: true, status: true, attendanceOpenTime: true, attendanceCloseTime: true, attendanceCode: true, isOnline: true }
  });
  console.log('HOSTING MEETING DB STATUS:', m);
}
check().catch(console.error).finally(() => prisma.$disconnect());
