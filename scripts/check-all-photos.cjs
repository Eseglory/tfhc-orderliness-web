const path = require('node:path');
const fs = require('node:fs');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const schedules = await prisma.wardrobeSchedule.findMany({
    include: { outfit: true },
    orderBy: { scheduledDate: 'asc' }
  });
  console.log('=== ALL WARDROBE SCHEDULES (' + schedules.length + ') ===');
  for (const s of schedules) {
    const d = s.scheduledDate.toISOString().split('T')[0];
    const img = s.outfit?.coverImageUrl;
    let fileExists = false;
    if (img) {
      const diskPath = path.resolve(__dirname, '../apps/web/public', img.replace(/^\//, ''));
      fileExists = fs.existsSync(diskPath);
    }
    console.log(d + ' | ' + s.id + ' | Img: ' + img + ' | Exists: ' + fileExists + ' | Title: ' + s.title);
  }

  const outfits = await prisma.wardrobeOutfit.findMany({
    orderBy: { title: 'asc' }
  });
  console.log('\n=== ALL WARDROBE OUTFITS (' + outfits.length + ') ===');
  for (const o of outfits) {
    let fileExists = false;
    if (o.coverImageUrl) {
      const diskPath = path.resolve(__dirname, '../apps/web/public', o.coverImageUrl.replace(/^\//, ''));
      fileExists = fs.existsSync(diskPath);
    }
    console.log(o.id + ' | Img: ' + o.coverImageUrl + ' | Exists: ' + fileExists + ' | Title: ' + o.title);
  }

  const items = await prisma.wardrobeItem.findMany({
    include: { variants: true }
  });
  console.log('\n=== WARDROBE ITEMS (' + items.length + ') ===');
  let itemsWithImg = 0;
  let variantsWithImg = 0;
  for (const it of items) {
    if (it.imageUrl) itemsWithImg++;
    for (const v of it.variants) {
      if (v.imageUrl) variantsWithImg++;
    }
  }
  console.log('Items with imageUrl: ' + itemsWithImg + ' / ' + items.length);
  console.log('Variants with imageUrl: ' + variantsWithImg);
}
check().then(() => prisma.$disconnect()).catch(err => {
  console.error(err);
  prisma.$disconnect();
});

