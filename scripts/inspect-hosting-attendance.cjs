const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const meetingId = 'e07e3136-636d-4f5f-abca-0396a7540e43';
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      attendanceRecords: {
        include: {
          member: {
            include: {
              user: true,
              approvedMember: true
            }
          }
        },
        orderBy: { actualArrivalTime: 'asc' }
      }
    }
  });

  console.log(`=== HOSTING MEETING: "${meeting?.title}" ===`);
  console.log(`Total attendance records: ${meeting?.attendanceRecords.length}`);
  
  meeting?.attendanceRecords.forEach((r, idx) => {
    const mem = r.member;
    console.log(`${idx + 1}. Member: ${mem?.firstName} ${mem?.lastName} | User: ${mem?.user?.email || '*** NO USER ***'} | ApprovedEmail: ${mem?.approvedMember?.normalizedEmail || 'NONE'} | Status: ${r.status} | Arrival: ${r.actualArrivalTime?.toISOString()} | MemberId: ${mem?.id}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
