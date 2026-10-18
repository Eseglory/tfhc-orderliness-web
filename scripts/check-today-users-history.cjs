const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const emails = ['prudentvee@gmail.com', 'nicoleokafor0@gmail.com', 'lahanloba@gmail.com', 'engreseglory@gmail.com'];
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        member: {
          include: {
            attendanceRecords: {
              where: {
                createdAt: { gte: new Date('2026-10-18T00:00:00.000Z') }
              },
              include: { meeting: true }
            }
          }
        }
      }
    });

    console.log(`\n=== User ${email} (${user.member.firstName} ${user.member.lastName}) ===`);
    user.member.attendanceRecords.forEach(r => {
      console.log(`  Meeting: ${r.meeting.title} | Status: ${r.status} | Arrival: ${r.actualArrivalTime} | Method: ${r.method}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
