const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== UPDATING HOSTING & GENERAL MEETING FOR CODE CHECK-IN ===\n');

  const meetingId = 'e07e3136-636d-4f5f-abca-0396a7540e43';
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  if (!meeting) {
    throw new Error(`Meeting ${meetingId} not found!`);
  }

  console.log(`Current Meeting: "${meeting.title}" (Status: ${meeting.status})`);

  // Today is Sunday, 18 October 2026.
  // Start: 1:00 PM WAT (12:00 UTC).
  // Extend attendance window through 8:00 PM WAT (19:00 UTC) so members can check in now.
  const code = '181026';
  const expiresAt = new Date('2026-10-18T19:00:00.000Z'); // 8:00 PM WAT

  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'ACTIVE',
      scheduleCancelled: false,
      isOnline: false,
      meetingUrl: null,
      locationName: "Sis Comfort's Residence",
      address: "No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.",
      attendanceCode: code,
      attendanceCodeExpiresAt: expiresAt,
      geofenceRadiusMeters: 50000,
      startTime: new Date('2026-10-18T12:00:00.000Z'), // 1:00 PM WAT
      endTime: new Date('2026-10-18T21:00:00.000Z'),   // 10:00 PM WAT
      attendanceOpenTime: new Date('2026-10-18T11:45:00.000Z'), // 12:45 PM WAT
      attendanceCloseTime: new Date('2026-10-18T21:00:00.000Z'), // 10:00 PM WAT
      notes: '[Attendance Code: 181026] Physical meeting at Sis Comfort\'s Residence. No geolocation required. Use 6-digit code to check in.',
    },
    include: {
      supervisingMinister: true,
      agendaItems: { orderBy: { order: 'asc' } }
    }
  });

  console.log('\n=== UPDATED MEETING DETAILS ===');
  console.log(`Meeting ID: ${updated.id}`);
  console.log(`Title: ${updated.title}`);
  console.log(`Status: ${updated.status} (ACTIVE)`);
  console.log(`IsOnline: ${updated.isOnline}`);
  console.log(`Attendance Code: ${updated.attendanceCode}`);
  console.log(`Attendance Code Expires At: ${updated.attendanceCodeExpiresAt.toISOString()}`);
  console.log(`Geofence Radius: ${updated.geofenceRadiusMeters}m (No geolocation check required)`);
  console.log(`Attendance Window: ${updated.attendanceOpenTime.toISOString()} to ${updated.attendanceCloseTime.toISOString()}`);
  console.log(`Supervising Minister: ${updated.supervisingMinister?.firstName} ${updated.supervisingMinister?.lastName}`);
  console.log(`Agenda Items Count: ${updated.agendaItems.length}`);

  // Create audit log
  const admin = await prisma.user.findFirst({
    where: { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } }
  });

  if (admin) {
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: 'HOSTING_MEETING_CODE_ENABLED',
        entity: 'Meeting',
        entityId: meetingId,
        newData: {
          attendanceCode: code,
          isOnline: true,
          geofenceRadiusMeters: 50000,
          status: 'ACTIVE',
          attendanceCloseTime: updated.attendanceCloseTime.toISOString()
        }
      }
    });
  }

  console.log('\n✓ Meeting updated and activated successfully in database!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
