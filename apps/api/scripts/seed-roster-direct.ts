import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { seedWardrobeSeptemberRoster } from '../src/prisma/seed-wardrobe-roster';

config();
const prisma = new PrismaClient();

async function run() {
  console.log('Connecting to database...');
  await seedWardrobeSeptemberRoster(prisma);
  console.log('Done!');
}

run()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
