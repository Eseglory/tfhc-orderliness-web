const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function show() {
  const scheds = await prisma.wardrobeSchedule.findMany({
    where: {
      scheduledDate: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
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

  for (const s of scheds) {
    const d = s.scheduledDate.toISOString().split('T')[0];
    console.log('=== ' + d + ' (' + s.id + ') ===');
    console.log('Title: ' + s.title);
    console.log('Instructions: ' + s.instructions);
    console.log('Outfit ID: ' + s.outfit?.id + ' | Title: ' + s.outfit?.title);
    console.log('CoverImage: ' + s.outfit?.coverImageUrl);
    console.log('Items:');
    s.outfit?.items.forEach((it, idx) => {
      console.log('  ' + (idx+1) + '. [' + it.item.category + '] ' + it.item.name + ' (' + (it.variant?.colorName || 'Default') + ') - ' + (it.notes || ''));
    });
    console.log('');
  }
}

show().then(() => prisma.$disconnect()).catch(err => { console.error(err); prisma.$disconnect(); });

