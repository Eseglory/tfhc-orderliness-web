const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: new Date('2026-10-18T00:00:00.000Z') }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  console.log(`Audit logs today: ${logs.length}`);
  logs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] Action: ${l.action} | Entity: ${l.entity} | Actor: ${l.actorUserId} | Details:`, JSON.stringify(l.newData || {}));
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
