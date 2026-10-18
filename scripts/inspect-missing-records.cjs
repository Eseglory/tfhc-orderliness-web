const { PrismaClient } = require('@prisma/client');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

async function main() {
  console.log('=== 1. USERS AND THEIR LINKED MEMBERS ===');
  const users = await prisma.user.findMany({
    include: {
      member: true,
    },
    orderBy: { email: 'asc' },
  });

  console.log(`Total users: ${users.length}`);
  const usersWithoutMember = users.filter(u => !u.member);
  console.log(`Users without member: ${usersWithoutMember.length}`);
  usersWithoutMember.forEach(u => {
    console.log(`  User with NO member: ${u.email} (id: ${u.id}, role: ${u.role}, active: ${u.isActive})`);
  });

  console.log('\n=== 2. MEMBERS AND THEIR LINKED USERS ===');
  const members = await prisma.member.findMany({
    include: {
      user: true,
      approvedMember: true,
      attendanceRecords: {
        select: { id: true, meetingId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { firstName: 'asc' },
  });

  console.log(`Total members: ${members.length}`);
  const unlinkedMembers = members.filter(m => !m.user);
  console.log(`Members with NO userId: ${unlinkedMembers.length}`);
  unlinkedMembers.forEach(m => {
    console.log(`  Unlinked Member: ${m.firstName} ${m.lastName} (email: ${m.email}, code: ${m.memberCode}, records: ${m.attendanceRecords.length}, id: ${m.id})`);
  });

  console.log('\n=== 3. EMAIL MATCHES BETWEEN UNLINKED USERS AND MEMBERS ===');
  for (const u of usersWithoutMember) {
    const match = members.find(m => (m.email && m.email.toLowerCase().trim() === u.email.toLowerCase().trim()) || (m.approvedMember && m.approvedMember.normalizedEmail === u.email.toLowerCase().trim()));
    if (match) {
      console.log(`  MATCH FOUND: User ${u.email} (${u.id}) <-> Member ${match.firstName} ${match.lastName} (${match.id}, records: ${match.attendanceRecords.length}, current userId: ${match.userId})`);
    } else {
      console.log(`  NO MATCH FOR USER: ${u.email} (${u.id})`);
    }
  }

  console.log('\n=== 4. TODAY (2026-10-18) ATTENDANCE RECORDS ===');
  const todayStart = new Date('2026-10-18T00:00:00.000Z');
  const todayRecords = await prisma.attendanceRecord.findMany({
    where: {
      createdAt: { gte: todayStart },
    },
    include: {
      member: {
        include: { user: true },
      },
      meeting: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total attendance records today: ${todayRecords.length}`);
  todayRecords.forEach(r => {
    const mem = r.member;
    const hasUser = !!mem?.user;
    console.log(`  Record [${r.id}]: ${mem?.firstName} ${mem?.lastName} (${mem?.email}) -> User: ${hasUser ? mem.user.email : '*** NO USER LINKED ***'} | Meeting: ${r.meeting?.title} | Status: ${r.status} | Method: ${r.method}`);
  });

  console.log('\n=== 5. CHECKING RECENT MEETINGS AND TOTAL ATTENDANCE ===');
  const recentMeetings = await prisma.meeting.findMany({
    where: {
      startTime: { gte: new Date('2026-10-17T00:00:00.000Z') },
    },
    include: {
      attendanceRecords: true,
      category: true,
    },
    orderBy: { startTime: 'desc' },
  });
  console.log(`Recent meetings count: ${recentMeetings.length}`);
  recentMeetings.forEach(m => {
    console.log(`  Meeting "${m.title}" (${m.id}): Start ${m.startTime.toISOString()}, isOnline: ${m.isOnline}, Records: ${m.attendanceRecords.length}`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
