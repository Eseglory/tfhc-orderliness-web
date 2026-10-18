const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const hostingMeetingId = 'e07e3136-636d-4f5f-abca-0396a7540e43';
  const secondServiceId = 'ba2c53e1-7906-40e7-8f08-3f02285db4b8';

  console.log('=== 1. CHECK HOSTING MEETING ATTENDANCE ===');
  const hostingRecords = await prisma.attendanceRecord.findMany({
    where: { meetingId: hostingMeetingId },
    include: { member: true }
  });
  console.log(`Total hosting records: ${hostingRecords.length}`);
  const absentRecords = hostingRecords.filter(r => r.status === 'ABSENT' && !r.actualArrivalTime);
  const presentRecords = hostingRecords.filter(r => r.status !== 'ABSENT');
  console.log(`Absent records to reset: ${absentRecords.length}`);
  console.log(`Present records to keep: ${presentRecords.length}`, presentRecords.map(r => `${r.member.firstName} ${r.member.lastName} (${r.status})`));

  console.log('\n=== 2. CHECK NOTIFICATIONS FOR HOSTING MEETING ===');
  const notifications = await prisma.memberNotification.findMany({
    where: {
      type: 'MISSED_SERVICE',
      data: { path: ['meetingId'], equals: hostingMeetingId }
    }
  });
  console.log(`Missed service notifications for hosting meeting: ${notifications.length}`);

  console.log('\n=== 3. CHECK PENDING CORRECTIONS ===');
  const corrections = await prisma.correctionRequest.findMany({
    where: { status: 'PENDING' },
    include: { member: true, meeting: true }
  });
  for (const c of corrections) {
    console.log(`Correction ${c.id}: ${c.member.firstName} ${c.member.lastName} for ${c.meeting.title} - ${c.reason} (requested: ${c.requestedStatus})`);
  }

  console.log('\n=== 4. CHECK PENDING EXCUSES ===');
  const excuses = await prisma.absenceExcuse.findMany({
    where: { status: 'PENDING' },
    include: { member: true, meeting: true }
  });
  for (const e of excuses) {
    console.log(`Excuse ${e.id}: ${e.member.firstName} ${e.member.lastName} for ${e.meeting?.title} - ${e.reason}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
