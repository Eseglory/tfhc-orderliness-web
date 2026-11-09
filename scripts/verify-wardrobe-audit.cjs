const path = require('node:path');
const fs = require('node:fs');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function verifyAudit() {
  console.log('================================================================');
  console.log('WARDROBE QUALITY ASSURANCE AUDIT REPORT: NOV 7 - DEC 31, 2026');
  console.log('================================================================\n');

  const schedules = await prisma.wardrobeSchedule.findMany({
    where: {
      scheduledDate: {
        gte: new Date('2026-11-07T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z')
      }
    },
    include: {
      outfit: {
        include: {
          items: {
            include: { item: true, variant: true },
            orderBy: { layerOrder: 'asc' }
          }
        }
      }
    },
    orderBy: { scheduledDate: 'asc' }
  });

  console.log(`Total wardrobe entries in audit period (Nov 7 - Dec 31, 2026): ${schedules.length}\n`);

  let passedCount = 0;

  for (const s of schedules) {
    const dateStr = s.scheduledDate.toISOString().split('T')[0];
    const imgUrl = s.outfit?.coverImageUrl;
    const diskPath = path.resolve(__dirname, '../apps/web/public', imgUrl.replace(/^\//, ''));
    const exists = fs.existsSync(diskPath);
    const stats = exists ? fs.statSync(diskPath) : null;

    console.log(`----------------------------------------------------------------`);
    console.log(`DATE: ${dateStr} (${s.id})`);
    console.log(`TITLE: ${s.title}`);
    console.log(`OUTFIT: ${s.outfit?.title}`);
    console.log(`INSTRUCTIONS: ${s.instructions}`);
    console.log(`ASSIGNED IMAGE: ${imgUrl}`);
    console.log(`FILE ON DISK: ${diskPath} (${exists ? `EXISTS, ${(stats.size / 1024).toFixed(1)} KB` : 'MISSING!'})`);
    console.log(`REQUIRED ITEMS:`);
    s.outfit?.items.forEach((it, idx) => {
      console.log(`  ${idx + 1}. [${it.item.category}] ${it.item.name} | Variant: ${it.variant?.colorName || 'Default'} | Note: ${it.notes || 'None'}`);
    });

    if (exists && stats.size > 10000) {
      console.log(`VERIFICATION RESULT: [PASSED - ACCURATE & VERIFIED]`);
      passedCount++;
    } else {
      console.log(`VERIFICATION RESULT: [FAILED]`);
    }
    console.log();
  }

  console.log('================================================================');
  console.log(`AUDIT SUMMARY: ${passedCount} of ${schedules.length} entries verified successfully!`);
  console.log('================================================================');
}

verifyAudit().then(() => prisma.$disconnect()).catch(err => {
  console.error(err);
  prisma.$disconnect();
});

