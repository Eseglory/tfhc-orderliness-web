const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });
const prisma = new PrismaClient();

const {
  SYSTEM_ROLE_DEFINITIONS,
  SYSTEM_ROLE,
  PERMISSION_WILDCARD,
  ALL_PERMISSION_KEYS,
} = require('@tfhc/shared');

function makeReference(prefix, date = new Date()) {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ym}-${rand}`;
}

async function syncSystemRoles() {
  console.log('Syncing system roles and permissions...');
  for (const [key, def] of Object.entries(SYSTEM_ROLE_DEFINITIONS)) {
    const role = await prisma.accessRole.upsert({
      where: { key },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { key, name: def.name, description: def.description, isSystem: true },
    });

    if (key === SYSTEM_ROLE.SUPER_ADMIN) {
      await prisma.accessRolePermission.deleteMany({
        where: { roleId: role.id, permission: { not: PERMISSION_WILDCARD } },
      });
      await prisma.accessRolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission: PERMISSION_WILDCARD } },
        update: {},
        create: { roleId: role.id, permission: PERMISSION_WILDCARD },
      });
      continue;
    }

    await prisma.accessRolePermission.createMany({
      data: def.permissions
        .filter((p) => ALL_PERMISSION_KEYS.includes(p))
        .map((permission) => ({ roleId: role.id, permission })),
      skipDuplicates: true,
    });
  }
  console.log('System roles synced successfully.');
}

const ADMIN_ASSIGNMENTS = [
  { email: 'engreseglory@gmail.com', name: 'Eseosa Glory', roleKey: SYSTEM_ROLE.SUPER_ADMIN },
  { email: 'aanuoyeniran@gmail.com', name: 'Aanu', roleKey: SYSTEM_ROLE.WARDROBE_MANAGER },
  { email: 'olarenwajuvictoria@gmail.com', name: 'Victoria', roleKey: SYSTEM_ROLE.WARDROBE_MANAGER },
  { email: 'fpaseda@yahoo.com', name: 'Passed', roleKey: SYSTEM_ROLE.EVENT_MANAGER },
  { email: 'comfort.osariroya@gmail.com', name: 'Confort', roleKey: SYSTEM_ROLE.EVENT_MANAGER },
  { email: 'nicoleokafor0@gmail.com', name: 'Nicole', roleKey: SYSTEM_ROLE.APPROVAL_MANAGER },
  { email: 'dotunakingbesote@gmail.com', name: 'Dotun', roleKey: SYSTEM_ROLE.APPROVAL_MANAGER },
  { email: 'onojamonday123@gmail.com', name: 'Jacob', roleKey: SYSTEM_ROLE.APPROVAL_MANAGER },
  { email: 'ngoziloveth41@gmail.com', name: 'Loveth', roleKey: SYSTEM_ROLE.WELFARE_SECRETARY },
  { email: 'danoguamanam@gmail.com', name: 'Daniel', roleKey: SYSTEM_ROLE.VIEWER },
  { email: 'david.folawewo@gmail.com', name: 'Folawewo', roleKey: SYSTEM_ROLE.VIEWER },
  { email: 'wewoaesthetics@gmail.com', name: 'Folawewo (Alt)', roleKey: SYSTEM_ROLE.VIEWER },
];

async function assignAdminRoles() {
  console.log('\nAssigning Admin RBAC roles to verified administrator accounts...');
  
  const allRoles = await prisma.accessRole.findMany();
  const roleMap = new Map(allRoles.map((r) => [r.key, r.id]));

  for (const item of ADMIN_ASSIGNMENTS) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: item.email, mode: 'insensitive' } },
      include: { accessRoles: true },
    });

    if (!user) {
      console.warn(`[WARN] User not found for email: ${item.email} (${item.name})`);
      continue;
    }

    const targetRoleId = roleMap.get(item.roleKey);
    if (!targetRoleId) {
      console.error(`[ERROR] Role not found for key: ${item.roleKey}`);
      continue;
    }

    // 1. Ensure user.role is 'ADMIN'
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', isActive: true },
    });

    // 2. Ensure user has the specific access role
    await prisma.userAccessRole.deleteMany({
      where: { userId: user.id },
    });

    await prisma.userAccessRole.create({
      data: {
        userId: user.id,
        roleId: targetRoleId,
      },
    });

    console.log(`[ASSIGNED] ${item.name} (${user.email}) -> Role: ADMIN, AccessRole: ${item.roleKey}`);
  }
}

async function configureWelfareApprovalWorkflow() {
  console.log('\nConfiguring Welfare Fund Request approval workflow...');
  
  const daniel = await prisma.user.findFirst({
    where: { email: { equals: 'danoguamanam@gmail.com', mode: 'insensitive' } },
  });
  const eseosa = await prisma.user.findFirst({
    where: { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } },
  });

  if (!daniel || !eseosa) {
    throw new Error('Daniel or Eseosa Glory account not found in database!');
  }

  const workflow = await prisma.approvalWorkflow.upsert({
    where: { key: 'WELFARE_FUND_DEFAULT' },
    update: {
      name: 'Welfare Fund Request Approval Workflow',
      description: 'Stage 1: Daniel review -> Stage 2: Super Admin review -> Super Admin disbursement',
      requestType: 'WELFARE_FUND',
      active: true,
      isSystem: true,
    },
    create: {
      key: 'WELFARE_FUND_DEFAULT',
      name: 'Welfare Fund Request Approval Workflow',
      description: 'Stage 1: Daniel review -> Stage 2: Super Admin review -> Super Admin disbursement',
      requestType: 'WELFARE_FUND',
      active: true,
      isSystem: true,
    },
  });

  // Reconfigure steps to ensure exact order and assigned approvers
  await prisma.approvalStep.deleteMany({
    where: { workflowId: workflow.id },
  });

  await prisma.approvalStep.create({
    data: {
      workflowId: workflow.id,
      order: 1,
      name: 'Stage 1 — Daniel Review',
      approverMode: 'SPECIFIC_USER',
      approverUserId: daniel.id,
    },
  });

  await prisma.approvalStep.create({
    data: {
      workflowId: workflow.id,
      order: 2,
      name: 'Stage 2 — Super Admin Review',
      approverMode: 'SPECIFIC_USER',
      approverUserId: eseosa.id,
    },
  });

  console.log(`Workflow ${workflow.key} configured with Stage 1 (Daniel: ${daniel.id}) and Stage 2 (Eseosa Glory: ${eseosa.id}).`);
}

async function backfillWelfareReferences() {
  console.log('\nBackfilling references on existing welfare requests...');
  const existing = await prisma.welfareRequest.findMany({
    where: { reference: null },
    orderBy: { createdAt: 'asc' },
  });

  for (const req of existing) {
    const ref = makeReference('WFR', req.createdAt);
    await prisma.welfareRequest.update({
      where: { id: req.id },
      data: { reference: ref },
    });
    console.log(`Assigned reference ${ref} to WelfareRequest ${req.id}`);
  }
}

async function main() {
  await syncSystemRoles();
  await assignAdminRoles();
  await configureWelfareApprovalWorkflow();
  await backfillWelfareReferences();
  console.log('\n--- RBAC & WELFARE SETUP COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
