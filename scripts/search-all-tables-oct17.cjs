const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  
  console.log('Searching all tables for activity on 2026-10-17...');
  for (const row of tables) {
    const table = row.table_name;
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${table}'
    `);
    const colNames = cols.map(c => c.column_name);
    
    const timeCols = colNames.filter(c => ['createdAt', 'created_at', 'timestamp', 'date', 'updatedAt', 'updated_at'].includes(c));
    for (const timeCol of timeCols) {
      try {
        const count = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as cnt 
          FROM "${table}" 
          WHERE "${timeCol}" >= '2026-10-17T00:00:00Z' 
            AND "${timeCol}" < '2026-10-18T00:00:00Z'
        `);
        const cnt = Number(count[0].cnt);
        if (cnt > 0) {
          console.log(`Table '${table}' (${timeCol}): ${cnt} row(s) on 2026-10-17`);
          const samples = await prisma.$queryRawUnsafe(`
            SELECT * 
            FROM "${table}" 
            WHERE "${timeCol}" >= '2026-10-17T00:00:00Z' 
              AND "${timeCol}" < '2026-10-18T00:00:00Z'
            LIMIT 3
          `);
          console.log(JSON.stringify(samples, null, 2));
        }
      } catch (err) {
        // ignore
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
