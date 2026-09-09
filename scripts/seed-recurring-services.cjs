// Seeds the user-provided weekly timetable; does not send email or replace edits.
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
req('ts-node').register({ project: path.resolve(__dirname, '../apps/api/tsconfig.json'), transpileOnly: true });
const { SERVICE_SCHEDULES } = require('../apps/api/src/modules/recurring-services/service-schedules.ts');
const config = { venue: { name: "The Father’s House Church, 90 Alagbole–Akute Road, Iju, Ojodu, Ogun State", latitude: 6.6697906, longitude: 3.3581822, radiusMeters: 100 }, arrivalMinutesBefore: 30, reminderMinutes: [60], recipients: 'all', remindersEnabled: true };
const prisma = new (req('@prisma/client').PrismaClient)();
(async () => {
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify(SERVICE_SCHEDULES, null, 2)); console.log('Use --apply to save these recurring templates.'); return; }
  await prisma.$transaction(async tx => {
    for (const schedule of SERVICE_SCHEDULES) await tx.serviceSchedule.upsert({ where: { id: schedule.id }, update: {}, create: schedule });
  }, { timeout: 120000 });
  await prisma.systemSetting.upsert({ where: { key: 'recurring_services_config' }, update: {}, create: { key: 'recurring_services_config', value: JSON.stringify(config) } });
  const { RecurringServicesService } = require('../apps/api/src/modules/recurring-services/recurring-services.service.ts');
  const { MailService } = require('../apps/api/src/modules/mail/mail.service.ts');
  const { ConfigService } = req('@nestjs/config');
  const service = new RecurringServicesService(prisma, new MailService(new ConfigService()));
  console.log(JSON.stringify(await service.generateUpcoming()));
  console.log(`Verified ${await prisma.serviceSchedule.count({ where: { id: { in: SERVICE_SCHEDULES.map(s => s.id) } } })} recurring service templates. No emails sent.`);
})().catch(e => { console.error(e.code || 'Recurring service seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
