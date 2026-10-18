const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3'
    }
  }
});

async function main() {
  const meetingId = 'e07e3136-636d-4f5f-abca-0396a7540e43';
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  console.log('--- CURRENT MEETING ROW ---');
  console.log(JSON.stringify(meeting, null, 2));

  // Fix meeting:
  // 1. isOnline MUST be false (this is a physical meeting!)
  // 2. meetingUrl MUST be null (no Google Meet!)
  // 3. locationName = "Sis Comfort's Residence"
  // 4. address = "No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State."
  // 5. attendanceCode = '181026'
  // 6. attendanceCodeExpiresAt = 2026-10-18T20:00:00.000Z (extend so attendees can check in tonight)
  // 7. geofenceRadiusMeters = 50000 (bypass geolocation checks)
  // 8. status = 'ACTIVE'

  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      isOnline: false,
      meetingUrl: null,
      locationName: "Sis Comfort's Residence",
      address: "No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.",
      attendanceCode: '181026',
      attendanceCodeExpiresAt: new Date('2026-10-18T21:00:00.000Z'), // valid until 10:00 PM WAT
      attendanceCloseTime: new Date('2026-10-18T21:00:00.000Z'),     // valid until 10:00 PM WAT
      endTime: new Date('2026-10-18T21:00:00.000Z'),
      geofenceRadiusMeters: 50000,
      status: 'ACTIVE',
      scheduleCancelled: false,
      notes: '[Attendance Code: 181026] Physical meeting at Sis Comfort\'s Residence. No geolocation required. Check in with 6-digit code.',
    }
  });

  console.log('\n--- UPDATED MEETING ROW ---');
  console.log(JSON.stringify(updated, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
