const { PrismaClient } = require('@prisma/client');

const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const users = await prisma.user.findMany({
    include: { member: true },
    orderBy: { email: 'asc' },
  });

  console.log(`Total users: ${users.length}`);
  const usersWithoutMember = users.filter(u => !u.member);
  console.log(`Users without member (${usersWithoutMember.length}):`);
  usersWithoutMember.forEach(u => {
    console.log(`  User: ${u.email} (id: ${u.id}, role: ${u.role})`);
  });

  const members = await prisma.member.findMany({
    include: {
      user: true,
      approvedMember: true,
      attendanceRecords: { select: { id: true } },
    },
    orderBy: { firstName: 'asc' },
  });

  console.log(`\nTotal members: ${members.length}`);
  const unlinkedMembers = members.filter(m => !m.user);
  console.log(`Members without user (${unlinkedMembers.length}):`);
  unlinkedMembers.forEach(m => {
    console.log(`  Member: ${m.firstName} ${m.lastName} (email: ${m.email}, code: ${m.memberCode}, records: ${m.attendanceRecords.length}, id: ${m.id})`);
  });

  console.log('\n--- MATCHES BY EMAIL ---');
  for (const u of usersWithoutMember) {
    const match = members.find(m => 
      (m.email && m.email.toLowerCase().trim() === u.email.toLowerCase().trim()) ||
      (m.approvedMember && m.approvedMember.normalizedEmail === u.email.toLowerCase().trim())
    );
    if (match) {
      console.log(`  MATCH: User ${u.email} (${u.id}) <-> Member ${match.firstName} ${match.lastName} (memberId: ${match.id}, records: ${match.attendanceRecords.length}, current userId: ${match.userId})`);
    } else {
      console.log(`  NO MATCH: User ${u.email} (${u.id})`);
    }
  }

  console.log('\n--- DUPLICATE MEMBERS BY EMAIL OR NAME ---');
  const emailMap = new Map();
  members.forEach(m => {
    const e = (m.email || m.approvedMember?.normalizedEmail || '').toLowerCase().trim();
    if (e) {
      if (!emailMap.has(e)) emailMap.set(e, []);
      emailMap.get(e).push(m);
    }
  });
  for (const [e, list] of emailMap.entries()) {
    if (list.length > 1) {
      console.log(`  DUPLICATE EMAIL ${e}:`, list.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, userId: m.userId, records: m.attendanceRecords.length })));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
