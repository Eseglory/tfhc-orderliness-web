const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const users = await prisma.user.findMany({
    include: {
      member: {
        include: {
          attendanceRecords: {
            select: { id: true, meetingId: true, status: true, actualArrivalTime: true },
            orderBy: { actualArrivalTime: 'desc' }
          }
        }
      }
    },
    orderBy: { email: 'asc' }
  });

  console.log(`ALL 29 USERS:`);
  for (const u of users) {
    const mem = u.member;
    console.log(`User: ${u.email} | Role: ${u.role} | Member: ${mem?.firstName} ${mem?.lastName} (id: ${mem?.id}, code: ${mem?.memberCode}) | Records count: ${mem?.attendanceRecords.length || 0}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
