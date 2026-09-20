const path = require('node:path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          roleInUnit: true,
          memberCode: true,
        },
      },
      accessRoles: {
        select: {
          role: {
            select: {
              id: true,
              key: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('TOTAL USERS:', users.length);
  for (const u of users) {
    const mem = u.member ? `${u.member.firstName} ${u.member.lastName} (${u.member.roleInUnit})` : 'NO_MEMBER';
    const roles = u.accessRoles.map(r => r.role.key).join(', ') || 'NONE';
    console.log(`[${u.id}] ${u.email} | Role: ${u.role} | Member: ${mem} | AccessRoles: ${roles}`);
  }

  const workflows = await prisma.approvalWorkflow.findMany({
    include: {
      steps: {
        orderBy: { order: 'asc' },
      },
    },
  });
  console.log('\n--- APPROVAL WORKFLOWS ---');
  for (const wf of workflows) {
    console.log(`Workflow: ${wf.key} (${wf.name}) - active=${wf.active} - type=${wf.requestType}`);
    for (const st of wf.steps) {
      console.log(`   Step ${st.order}: ${st.name} [mode: ${st.approverMode}, role: ${st.roleKey}, user: ${st.approverUserId}, perm: ${st.permission}]`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
