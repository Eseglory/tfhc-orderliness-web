const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          attendanceRecords: {
            select: { id: true, meetingId: true, status: true, actualArrivalTime: true },
            orderBy: { actualArrivalTime: 'desc' }
          }
        }
      }
    },
    orderBy: { lastLoginAt: 'desc' }
  });

  console.log(`=== USERS SORTED BY LAST LOGIN ===`);
  users.forEach(u => {
    const mem = u.member;
    const recs = mem?.attendanceRecords || [];
    const attended = recs.filter(r => r.status !== 'ABSENT').length;
    console.log(`User: ${u.email} | LastLogin: ${u.lastLoginAt?.toISOString() || 'NEVER'} | Member: ${mem?.firstName} ${mem?.lastName} | TotalRecs: ${recs.length} (Attended: ${attended}, Absent: ${recs.length - attended})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
