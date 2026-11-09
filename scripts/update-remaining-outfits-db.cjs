const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function updateDb() {
  const updates = [
    { id: 'outfit-july-12', coverImageUrl: '/wardrobe/black-gown-neckline-scarf.jpg' },
    { id: 'outfit-july-26', coverImageUrl: '/wardrobe/red-gown-black-beret.jpg' },
    { id: 'outfit-aug-23', coverImageUrl: '/wardrobe/colour-riot-gown-grey-skyblue.jpg' },
    { id: 'outfit-aug-30', coverImageUrl: '/wardrobe/colour-riot-gown-navy-suit.jpg' },
    { id: 'outfit-sept-6', coverImageUrl: '/wardrobe/carton-red-tie.jpg' },
  ];

  for (const u of updates) {
    try {
      const res = await prisma.wardrobeOutfit.update({
        where: { id: u.id },
        data: { coverImageUrl: u.coverImageUrl },
      });
      console.log(`Updated ${res.id} -> ${res.coverImageUrl}`);
    } catch (e) {
      console.error(`Failed to update ${u.id}:`, e.message);
    }
  }

  // Also check if any outfit has coverImageUrl = null
  const nullOutfits = await prisma.wardrobeOutfit.findMany({
    where: { coverImageUrl: null }
  });
  console.log(`Outfits with null coverImageUrl remaining: ${nullOutfits.length}`);

  // Also check if any schedule has outfit with coverImageUrl = null
  const schedulesWithNullOutfit = await prisma.wardrobeSchedule.findMany({
    where: { outfit: { coverImageUrl: null } },
    include: { outfit: true }
  });
  console.log(`Schedules with null outfit image: ${schedulesWithNullOutfit.length}`);
}

updateDb().then(() => prisma.$disconnect()).catch(err => {
  console.error(err);
  prisma.$disconnect();
});

