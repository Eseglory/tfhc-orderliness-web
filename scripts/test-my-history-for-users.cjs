const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const users = await prisma.user.findMany({
    include: {
      member: true
    }
  });

  console.log(`Total users: ${users.length}`);

  for (const u of users) {
    if (!u.member) {
      console.log(`User ${u.email} HAS NO MEMBER PROFILE!`);
      continue;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { memberId: u.member.id },
      include: { meeting: { include: { category: true } } },
      orderBy: { meeting: { startTime: 'desc' } }
    });

    const attended = records.filter(r => ['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE', 'PRESENT'].includes(r.status));
    const absent = records.filter(r => r.status === 'ABSENT');

    console.log(`User ${u.email} (${u.member.firstName} ${u.member.lastName}): Total ${records.length} records (${attended.length} attended, ${absent.length} absent)`);
    if (records.length === 0) {
      console.log(`  --> WARNING: 0 RECORDS FOR ${u.email}!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
