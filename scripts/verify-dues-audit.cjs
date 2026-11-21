const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const martha = await prisma.member.findFirst({
    where: { firstName: { contains: 'Martha' } },
    include: { duesAssignments: { include: { period: true }, orderBy: { period: { month: 'asc' } } } },
  });
  console.log('Martha John-Williams:');
  martha.duesAssignments.forEach((a) => {
    console.log(`  ${a.period.label}: due=${a.amountDue}, paid=${a.amountPaid}, status=${a.status}`);
  });

  const chioma = await prisma.member.findFirst({
    where: { firstName: { contains: 'Chioma' } },
    include: { duesAssignments: { include: { period: true }, orderBy: { period: { month: 'asc' } } } },
  });
  console.log('\nChioma Happiness Nwankwo:');
  chioma.duesAssignments.forEach((a) => {
    console.log(`  ${a.period.label}: due=${a.amountDue}, paid=${a.amountPaid}, status=${a.status}`);
  });
}

main().finally(() => prisma.$disconnect());
