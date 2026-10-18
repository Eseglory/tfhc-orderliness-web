const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const m = await prisma.member.findFirst({
    where: { 
      OR: [
        { firstName: { contains: 'Rachael', mode: 'insensitive' } },
        { lastName: { contains: 'Akomolede', mode: 'insensitive' } }
      ]
    },
    include: { user: true }
  });
  console.log('Member Rachel:', m ? { id: m.id, email: m.email, userId: m.userId } : null);
  const app = await prisma.approvedMember.findFirst({
    where: { email: { contains: 'akomolederachael', mode: 'insensitive' } }
  });
  console.log('ApprovedMember Rachel:', app ? { id: app.id, email: app.email } : null);
  await prisma.$disconnect();
}
main().catch(console.error);
