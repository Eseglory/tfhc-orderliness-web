import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { seedWardrobeSeptemberRoster } from '../src/prisma/seed-wardrobe-roster';

config();
const prisma = new PrismaClient();

async function run() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`Connecting to database (attempt ${attempt})...`);
      await seedWardrobeSeptemberRoster(prisma);
      console.log('✅ Done seeding roster!');
      return;
    } catch (e: any) {
      console.error(`Attempt ${attempt} error:`, e.message);
      if (attempt === 10) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

run()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
