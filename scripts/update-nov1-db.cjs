const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function update() {
  console.log('Updating outfit-nov-01 coverImageUrl to /wardrobe/wrapper-buba-agbada.jpg...');
  const res = await prisma.wardrobeOutfit.update({
    where: { id: 'outfit-nov-01' },
    data: { coverImageUrl: '/wardrobe/wrapper-buba-agbada.jpg' }
  });
  console.log('Updated outfit-nov-01:', res.id, res.title, res.coverImageUrl);

  // Also check if any other outfit or schedule in Oct/Nov/Dec needs updating
  const scheds = await prisma.wardrobeSchedule.findMany({
    where: {
      scheduledDate: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z')
      }
    },
    include: { outfit: true },
    orderBy: { scheduledDate: 'asc' }
  });

  console.log('\n--- ALL OCT, NOV, DEC SCHEDULES ---');
  for (const s of scheds) {
    const d = s.scheduledDate.toISOString().split('T')[0];
    console.log(`${d} (${s.id}) -> Outfit: ${s.outfit?.title} | Img: ${s.outfit?.coverImageUrl}`);
  }
}

update().then(() => prisma.$disconnect()).catch(err => {
  console.error(err);
  prisma.$disconnect();
});

