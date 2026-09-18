const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanAllServices() {
  console.log('=== REMOVING ALL SERVICES & MEETINGS ===\n');

  await prisma.$transaction(async (tx) => {
    // 1. Delete dependent appointment records
    const deletedAppointments = await tx.appointment.deleteMany({});
    console.log(`✔ Deleted ${deletedAppointments.count} appointments.`);

    // 2. Delete organization/appointment services
    const deletedOrgServices = await tx.organizationService.deleteMany({});
    console.log(`✔ Deleted ${deletedOrgServices.count} organization appointment services.`);

    // 3. Delete meeting dependencies
    const deletedEventResponses = await tx.eventResponse.deleteMany({});
    console.log(`✔ Deleted ${deletedEventResponses.count} event responses.`);

    const deletedEventInvitations = await tx.eventInvitation.deleteMany({});
    console.log(`✔ Deleted ${deletedEventInvitations.count} event invitations.`);

    const deletedEventAudiences = await tx.eventAudience.deleteMany({});
    console.log(`✔ Deleted ${deletedEventAudiences.count} event audiences.`);

    const deletedAttendance = await tx.attendanceRecord.deleteMany({});
    console.log(`✔ Deleted ${deletedAttendance.count} attendance records.`);

    const deletedExcuses = await tx.absenceExcuse.deleteMany({});
    console.log(`✔ Deleted ${deletedExcuses.count} absence excuses.`);

    const deletedCorrections = await tx.correctionRequest.deleteMany({});
    console.log(`✔ Deleted ${deletedCorrections.count} correction requests.`);

    const deletedSummaries = await tx.meetingSummary.deleteMany({});
    console.log(`✔ Deleted ${deletedSummaries.count} meeting summaries.`);

    const deletedCommitments = await tx.memberServiceCommitment.deleteMany({});
    console.log(`✔ Deleted ${deletedCommitments.count} member service commitments.`);

    // 4. Delete all meetings
    const deletedMeetings = await tx.meeting.deleteMany({});
    console.log(`✔ Deleted ${deletedMeetings.count} meetings / church service occurrences.`);

    // 5. Delete service schedule exceptions & schedules
    const deletedExceptions = await tx.serviceScheduleException.deleteMany({});
    console.log(`✔ Deleted ${deletedExceptions.count} service schedule exceptions.`);

    const deletedSchedules = await tx.serviceSchedule.deleteMany({});
    console.log(`✔ Deleted ${deletedSchedules.count} recurring service schedules.`);
  });

  console.log('\n======================================================');
  console.log('✔ ALL SERVICES, GATHERINGS & SCHEDULES REMOVED 100%');
  console.log('======================================================\n');
}

cleanAllServices()
  .catch((err) => {
    console.error('Clean failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
