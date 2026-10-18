const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const members = await prisma.member.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Blessing', mode: 'insensitive' } },
        { lastName: { contains: 'Blessing', mode: 'insensitive' } },
        { firstName: { contains: 'Patrick', mode: 'insensitive' } },
        { lastName: { contains: 'Patrick', mode: 'insensitive' } },
      ]
    },
    include: {
      user: true,
      approvedMember: true,
      attendanceRecords: {
        include: { meeting: true }
      }
    }
  });

  console.log('Blessing / Patrick members:', members.length);
  for (const m of members) {
    console.log(`Member ID: ${m.id}`);
    console.log(`  Name: ${m.firstName} ${m.lastName}`);
    console.log(`  Email: ${m.email}`);
    console.log(`  User: ${m.user ? m.user.email + ' (userId: ' + m.user.id + ')' : 'NO USER LINKED'}`);
    console.log(`  ApprovedMember: ${m.approvedMember ? m.approvedMember.fullName + ' (' + m.approvedMember.normalizedEmail + ')' : 'NONE'}`);
    console.log(`  Records count: ${m.attendanceRecords.length}`);
    m.attendanceRecords.forEach(r => {
      console.log(`    - Meeting: ${r.meeting.title} | Status: ${r.status} | Arrival: ${r.actualArrivalTime}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
