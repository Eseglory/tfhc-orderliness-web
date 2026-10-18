const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const years = await prisma.$queryRaw`
    SELECT EXTRACT(YEAR FROM "startTime") as yr, COUNT(*)::int as count
    FROM meetings
    GROUP BY yr
    ORDER BY yr ASC
  `;
  console.log('Meetings by year:', years);

  const recordYears = await prisma.$queryRaw`
    SELECT EXTRACT(YEAR FROM "createdAt") as yr, COUNT(*)::int as count
    FROM attendance_records
    GROUP BY yr
    ORDER BY yr ASC
  `;
  console.log('Attendance records by year (createdAt):', recordYears);

  const arrivalYears = await prisma.$queryRaw`
    SELECT EXTRACT(YEAR FROM "actualArrivalTime") as yr, COUNT(*)::int as count
    FROM attendance_records
    WHERE "actualArrivalTime" IS NOT NULL
    GROUP BY yr
    ORDER BY yr ASC
  `;
  console.log('Attendance records by year (actualArrivalTime):', arrivalYears);
}

main().catch(console.error).finally(() => prisma.$disconnect());
