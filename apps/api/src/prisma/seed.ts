import { PrismaClient, Role, MemberStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding TFHC Orderliness database...');

  // 1. Create Default Categories
  const categories = [
    { name: 'Unit Meeting', basePoints: 10, pointWeight: 1.0, description: 'Regular weekly TFHC orderliness unit meeting' },
    { name: 'Sunday Service', basePoints: 5, pointWeight: 1.0, description: 'Sunday church worship service' },
    { name: 'Midweek Service', basePoints: 5, pointWeight: 1.0, description: 'Wednesday midweek service' },
    { name: 'Training', basePoints: 10, pointWeight: 1.5, description: 'Orderliness & protocol leadership training' },
    { name: 'Special Programme', basePoints: 15, pointWeight: 2.0, description: 'Major church convention or special event' },
  ];

  for (const cat of categories) {
    await prisma.meetingCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  // 2. Create Sub-Teams
  const subTeams = ['Protocol', 'Media & IT', 'Choir', 'Ushering', 'Security'];
  const createdSubTeams: Record<string, string> = {};
  for (const name of subTeams) {
    const st = await prisma.subTeam.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    createdSubTeams[name] = st.id;
  }

  // 3. Create Admin User
  const adminPasswordHash = await argon2.hash('Admin@123456');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@tfhc.org' },
    update: {},
    create: {
      email: 'admin@tfhc.org',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      member: {
        create: {
          memberCode: 'TFHC-0001',
          firstName: 'Unit',
          lastName: 'Leader',
          phoneNumber: '+2348000000000',
          roleInUnit: 'Head of Unit',
          status: MemberStatus.ACTIVE,
          subTeamId: createdSubTeams['Protocol'],
        },
      },
    },
  });

  // 4. Create Sample Members
  const sampleMembers = [
    { firstName: 'Emmanuel', lastName: 'Okonkwo', email: 'emmanuel@example.com', subTeam: 'Protocol' },
    { firstName: 'Blessing', lastName: 'Adeyemi', email: 'blessing@example.com', subTeam: 'Media & IT' },
    { firstName: 'David', lastName: 'Eze', email: 'david@example.com', subTeam: 'Choir' },
    { firstName: 'Grace', lastName: 'Johnson', email: 'grace@example.com', subTeam: 'Ushering' },
  ];

  for (const [idx, m] of sampleMembers.entries()) {
    const passwordHash = await argon2.hash('Member@123456');
    await prisma.user.upsert({
      where: { email: m.email },
      update: {},
      create: {
        email: m.email,
        passwordHash,
        role: Role.MEMBER,
        member: {
          create: {
            memberCode: `TFHC-100${idx + 1}`,
            firstName: m.firstName,
            lastName: m.lastName,
            phoneNumber: `+234801111000${idx + 1}`,
            roleInUnit: 'Member',
            status: MemberStatus.ACTIVE,
            subTeamId: createdSubTeams[m.subTeam],
          },
        },
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
