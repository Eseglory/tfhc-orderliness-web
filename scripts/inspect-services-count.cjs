const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
  const serviceSchedulesCount = await prisma.serviceSchedule.count();
  const meetingsCount = await prisma.meeting.count();
  const orgServicesCount = await prisma.organizationService.count();
  const appointmentsCount = await prisma.appointment.count();
  const attendanceCount = await prisma.attendanceRecord.count();
  const excuseCount = await prisma.absenceExcuse.count();
  const correctionCount = await prisma.correctionRequest.count();

  console.log('--- DATABASE SERVICE COUNTS ---');
  console.log('1. Recurring Service Schedules (service_schedules):', serviceSchedulesCount);
  console.log('2. Church Meetings & Gatherings (meetings):', meetingsCount);
  console.log('3. Organization/Appointment Services (organization_services):', orgServicesCount);
  console.log('4. Appointments (appointments):', appointmentsCount);
  console.log('5. Attendance Records:', attendanceCount);
  console.log('6. Absence Excuses:', excuseCount);
  console.log('7. Correction Requests:', correctionCount);

  if (serviceSchedulesCount > 0) {
    const schedules = await prisma.serviceSchedule.findMany({ select: { id: true, title: true } });
    console.log('\nService Schedules:', schedules);
  }

  if (meetingsCount > 0) {
    const meetings = await prisma.meeting.findMany({ select: { id: true, title: true, status: true, startTime: true }, take: 10 });
    console.log('\nSample Meetings (first 10):', meetings);
  }

  if (orgServicesCount > 0) {
    const orgServices = await prisma.organizationService.findMany({ select: { id: true, name: true } });
    console.log('\nOrganization Services:', orgServices);
  }
}

inspect()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
