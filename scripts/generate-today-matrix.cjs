const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    include: {
      user: true,
      attendanceRecords: {
        where: {
          meeting: {
            startTime: {
              gte: new Date('2026-10-18T00:00:00.000Z'),
              lt: new Date('2026-10-19T00:00:00.000Z')
            }
          }
        },
        include: { meeting: true }
      }
    },
    orderBy: { firstName: 'asc' }
  });

  console.log(`Active members count: ${members.length}`);
  console.log('-----------------------------------------------------------------------------------------------------------------');
  console.log('| Member Name                  | User Email                      | 1st Service | 2nd Service | 3rd Service | Hosting Mtg |');
  console.log('-----------------------------------------------------------------------------------------------------------------');

  for (const m of members) {
    const name = `${m.firstName} ${m.lastName}`.padEnd(28, ' ');
    const email = (m.user?.email || 'NO_USER').padEnd(31, ' ');

    const recs = m.attendanceRecords;
    const s1 = recs.find(r => r.meeting.title.includes('First Service'));
    const s2 = recs.find(r => r.meeting.title.includes('Second Service'));
    const s3 = recs.find(r => r.meeting.title.includes('Third Service'));
    const host = recs.find(r => r.meeting.title.includes('Hosting'));

    const fmt = (r) => {
      if (!r) return '---'.padEnd(11, ' ');
      if (r.status === 'ABSENT') return 'ABSENT'.padEnd(11, ' ');
      return `${r.status}`.padEnd(11, ' ');
    };

    console.log(`| ${name} | ${email} | ${fmt(s1)} | ${fmt(s2)} | ${fmt(s3)} | ${fmt(host)} |`);
  }
  console.log('-----------------------------------------------------------------------------------------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
