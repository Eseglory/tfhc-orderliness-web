const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      sender: true
    }
  });
  console.log(`=== RECENT ${messages.length} CHAT MESSAGES ===`);
  for (const m of messages) {
    const name = m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : 'System';
    console.log(`[${m.createdAt.toISOString()}] ${name}: ${m.content}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
