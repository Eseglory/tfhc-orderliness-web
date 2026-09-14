import './setup-test-env';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function seed() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e';
  if (!url || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(url)) throw new Error('E2E seed requires an isolated local tfhc_e2e database');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // db push creates schema without the default business records supplied by migrations.
    for (const name of ['20260909160000_approval_engine', '20260909170000_finance']) {
      const sql = readFileSync(join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8');
      for (const statement of sql.slice(sql.indexOf('-- Seed')).split(';').filter(s => s.trim())) {
        await db.$executeRawUnsafe(statement);
      }
    }
  } finally { await db.$disconnect(); }
}
