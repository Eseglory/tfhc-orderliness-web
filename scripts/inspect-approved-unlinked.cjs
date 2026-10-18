const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const unlinkedMemberIds = [
    '210d75ac-f197-4569-bff9-a7af1ef0bcbb',
    'fc4c184c-7a9a-4fff-ae42-14b34a202859',
    '1da66dc3-8a0c-4fb6-b81b-f9fefacafa48',
    'c2834858-d8ab-416c-af7d-21158619e2b6',
    'da27a88f-0365-441c-9dd1-ee9bd3cf543c',
    'ec3a056f-0f30-4589-9fc6-d17a8bf3e529',
    '28bcd058-d047-43c6-9396-d80a5721260c',
    '30c62a9f-4f3a-42bd-ad41-544074f94cfa',
  ];

  const members = await prisma.member.findMany({
    where: { id: { in: unlinkedMemberIds } },
    include: {
      approvedMember: true,
      attendanceRecords: { include: { meeting: true } }
    }
  });

  console.log('Unlinked members detail:');
  for (const m of members) {
    console.log(`\n${m.firstName} ${m.lastName} (${m.id}):`);
    console.log(`  member.email: ${m.email}`);
    console.log(`  approvedMember:`, m.approvedMember ? {
      email: m.approvedMember.email,
      normalizedEmail: m.approvedMember.normalizedEmail,
      fullName: m.approvedMember.fullName,
      status: m.approvedMember.status
    } : 'NONE');
    console.log(`  records:`, m.attendanceRecords.map(r => `${r.meeting.title} (${r.status}, ${r.method})`));
  }

  // Also check all approved members without users
  console.log('\n--- ALL APPROVED MEMBERS ---');
  const allApproved = await prisma.approvedMember.findMany({
    include: {
      member: {
        include: { user: true }
      }
    }
  });

  allApproved.forEach(am => {
    const hasUser = !!am.member?.user;
    if (!hasUser) {
      console.log(`ApprovedMember without user: ${am.fullName} (${am.normalizedEmail}) -> member: ${am.member?.firstName} ${am.member?.lastName} (${am.member?.id})`);
    }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
