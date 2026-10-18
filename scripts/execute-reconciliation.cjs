const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const hostingMeetingId = 'e07e3136-636d-4f5f-abca-0396a7540e43';
  const secondServiceId = 'ba2c53e1-7906-40e7-8f08-3f02285db4b8';
  const danielAdminId = '419f9425-32ed-446d-9cfd-46b247fdc0ac';
  const sisComfortMemberId = '13363493-2b67-4006-ba5f-3a390064e499';
  const chiomaMemberId = '0263663e-2e90-4e2b-bf92-9d75d1d1a226';

  console.log('--- STARTING RECONCILIATION ---');

  // 1. Approve Chioma Happiness correction request
  console.log('1. Approving Chioma Happiness correction request for Second Service...');
  const correction = await prisma.correctionRequest.findUnique({
    where: { id: '9372a8ab-44f7-4dca-be08-06e363d5e30d' },
    include: { meeting: { include: { category: true } } }
  });

  if (correction && correction.status === 'PENDING') {
    await prisma.correctionRequest.update({
      where: { id: correction.id },
      data: {
        status: 'APPROVED',
        reviewedBy: danielAdminId,
      }
    });

    const secondService = await prisma.meeting.findUnique({
      where: { id: secondServiceId },
      include: { category: true }
    });

    await prisma.attendanceRecord.upsert({
      where: {
        memberId_meetingId: {
          memberId: chiomaMemberId,
          meetingId: secondServiceId
        }
      },
      update: {
        actualArrivalTime: new Date('2026-10-18T07:20:00.000Z'),
        status: 'ON_TIME',
        method: 'CORRECTION_APPROVED',
        isModified: true,
        pointsEarned: 10
      },
      create: {
        memberId: chiomaMemberId,
        meetingId: secondServiceId,
        expectedArrivalTime: secondService.expectedArrivalTime,
        actualArrivalTime: new Date('2026-10-18T07:20:00.000Z'),
        status: 'ON_TIME',
        method: 'CORRECTION_APPROVED',
        attendanceType: 'PHYSICAL',
        isModified: true,
        pointsEarned: 10
      }
    });
    console.log('  -> Chioma Happiness Second Service attendance recorded as ON_TIME.');
  } else {
    console.log('  -> Correction already processed or not found.');
  }

  // 2. Approve Nicole Okafor excuse
  console.log('2. Approving Nicole Okafor excuse for Third Service...');
  const excuse = await prisma.absenceExcuse.findUnique({
    where: { id: 'd9a5e178-7617-4c62-98ea-8a4c52f240fa' }
  });
  if (excuse && excuse.status === 'PENDING') {
    await prisma.absenceExcuse.update({
      where: { id: excuse.id },
      data: {
        status: 'APPROVED',
        reviewedBy: danielAdminId,
      }
    });
    console.log('  -> Nicole Okafor excuse approved (she already has ON_TIME check-in).');
  }

  // 3. Clear premature notifications for Hosting Meeting
  console.log('3. Clearing premature missed service notifications for Hosting Meeting...');
  const delNotifs = await prisma.memberNotification.deleteMany({
    where: {
      type: 'MISSED_SERVICE',
      data: { path: ['meetingId'], equals: hostingMeetingId }
    }
  });
  console.log(`  -> Deleted ${delNotifs.count} premature missed service notifications.`);

  // 4. Reset premature ABSENT records on Hosting Meeting
  console.log('4. Resetting premature ABSENT records on Hosting Meeting...');
  const delAbsent = await prisma.attendanceRecord.deleteMany({
    where: {
      meetingId: hostingMeetingId,
      status: 'ABSENT',
      actualArrivalTime: null
    }
  });
  console.log(`  -> Deleted ${delAbsent.count} premature ABSENT records.`);

  // 5. Mark Host Sis Comfort as ON_TIME for Hosting Meeting
  console.log('5. Marking Sis Comfort (Meeting Host) as ON_TIME...');
  const hostingMeeting = await prisma.meeting.findUnique({
    where: { id: hostingMeetingId },
    include: { category: true }
  });

  await prisma.attendanceRecord.upsert({
    where: {
      memberId_meetingId: {
        memberId: sisComfortMemberId,
        meetingId: hostingMeetingId
      }
    },
    update: {
      actualArrivalTime: new Date('2026-10-18T12:00:00.000Z'),
      status: 'ON_TIME',
      method: 'SYSTEM_GEO',
      attendanceType: 'PHYSICAL',
      pointsEarned: 10
    },
    create: {
      memberId: sisComfortMemberId,
      meetingId: hostingMeetingId,
      expectedArrivalTime: hostingMeeting.expectedArrivalTime,
      actualArrivalTime: new Date('2026-10-18T12:00:00.000Z'),
      status: 'ON_TIME',
      method: 'SYSTEM_GEO',
      attendanceType: 'PHYSICAL',
      pointsEarned: 10
    }
  });
  console.log('  -> Sis Comfort marked ON_TIME for Hosting Meeting.');

  console.log('--- RECONCILIATION COMPLETED SUCCESSFULLY ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
