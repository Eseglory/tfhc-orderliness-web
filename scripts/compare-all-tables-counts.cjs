const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const summary = JSON.parse(fs.readFileSync('scripts/sqlite-table-summary.json', 'utf8').replace(/^[^{[]+/, ''));
  console.log(`=== COMPARING ${summary.length} TABLES: SQLITE VS POSTGRESQL ===\n`);

  const discrepancies = [];

  for (const item of summary) {
    const table = item.table;
    if (table.startsWith('_sync')) continue;

    try {
      const res = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${table}"`);
      const pgCount = Number(res[0].count);
      const sqliteCount = item.total;
      const diff = pgCount - sqliteCount;

      const flag = diff < 0 ? '⚠️ PG HAS FEWER ROWS!' : (diff === 0 ? 'MATCH' : 'PG has more');
      console.log(`[${flag.padEnd(20)}] ${table.padEnd(35)} SQLite: ${String(sqliteCount).padStart(5)} | PG: ${String(pgCount).padStart(5)}`);

      if (diff < 0) {
        discrepancies.push({ table, sqliteCount, pgCount, diff });
      }
    } catch (err) {
      console.log(`[TABLE ERROR         ] ${table.padEnd(35)} ${err.message.slice(0, 50)}`);
    }
  }

  console.log('\n=== SUMMARY OF DISCREPANCIES (WHERE PG HAS FEWER ROWS) ===');
  if (discrepancies.length === 0) {
    console.log('✅ ZERO DISCREPANCIES FOUND! PostgreSQL has equal or more rows across ALL tables!');
  } else {
    console.log(JSON.stringify(discrepancies, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
