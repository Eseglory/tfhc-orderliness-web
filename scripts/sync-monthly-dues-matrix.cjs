/**
 * Synchronize Members' Monthly Dues Matrix (2026) with the Database.
 *
 * Uses apps/api/prisma/data/dues-matrix-2026.json as the single source of truth.
 *
 * Usage:
 *   node scripts/sync-monthly-dues-matrix.cjs            # dry run
 *   node scripts/sync-monthly-dues-matrix.cjs --apply    # apply updates
 *
 * Respects DATABASE_URL from environment (or apps/api/.env fallback).
 * Idempotent: Does not create duplicate members or duplicate dues assignments.
 * Never alters or deletes non-imported member payment records.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apply = process.argv.includes('--apply');
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
console.log(`Target database: ${maskedUrl}`);
console.log(apply ? 'MODE: APPLYING CHANGES\n' : 'MODE: DRY RUN (pass --apply to write)\n');

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

async function main() {
  const duesFilePath = path.resolve(__dirname, '../apps/api/prisma/data/dues-matrix-2026.json');
  const dirFilePath = path.resolve(__dirname, '../apps/api/prisma/data/member-directory.json');

  const duesData = JSON.parse(fs.readFileSync(duesFilePath, 'utf8'));
  const dirData = JSON.parse(fs.readFileSync(dirFilePath, 'utf8'));

  const year = Number(duesData.year) || 2026;
  const dueDay = Math.min(28, Math.max(1, Number(duesData.dueDayOfMonth) || 5));
  const defaultAmount = Number(duesData.defaultAmount) || 2000;

  console.log(`Processing Monthly Dues for Year: ${year}`);
  console.log(`Total roster rows in source of truth: ${duesData.rows.length}`);

  // Fetch or create admin actor for attribution
  const adminUser =
    (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  const actorUserId = adminUser ? adminUser.id : null;

  // 1. Ensure all 12 monthly dues periods exist
  const periods = [];
  for (let m = 1; m <= 12; m++) {
    let period = await prisma.duesPeriod.findFirst({
      where: { year, month: m, type: 'MONTHLY' },
    });
    if (!period) {
      console.log(`Creating MONTHLY period: ${MONTHS[m - 1]} ${year}`);
      if (apply) {
        period = await prisma.duesPeriod.create({
          data: {
            year,
            month: m,
            type: 'MONTHLY',
            label: `${MONTHS[m - 1]} ${year}`,
            defaultAmount,
            dueDate: new Date(Date.UTC(year, m - 1, dueDay)),
            createdByUserId: actorUserId,
          },
        });
      } else {
        period = { id: `simulated-period-${m}`, year, month: m, label: `${MONTHS[m - 1]} ${year}` };
      }
    }
    periods.push(period);
  }

  // 2. Build member map from existing database members
  const dbMembers = await prisma.member.findMany({
    include: { approvedMember: true },
  });

  const memberLookup = new Map();
  for (const m of dbMembers) {
    const full1 = normalizeName(`${m.firstName} ${m.lastName}`);
    const full2 = normalizeName(`${m.lastName} ${m.firstName}`);
    memberLookup.set(full1, m);
    memberLookup.set(full2, m);
    if (m.preferredName) {
      memberLookup.set(normalizeName(`${m.preferredName} ${m.lastName}`), m);
    }
  }

  // Add alias mappings from directory
  for (const entry of dirData.members) {
    const aliases = entry.aliases || [];
    for (const alias of aliases) {
      const aliasNorm = normalizeName(alias);
      const targetNorm = normalizeName(`${entry.firstName} ${entry.lastName}`);
      const matched = memberLookup.get(targetNorm);
      if (matched && !memberLookup.has(aliasNorm)) {
        memberLookup.set(aliasNorm, matched);
      }
    }
  }

  let matchedCount = 0;
  let createdMemberCount = 0;
  let updatedAssignmentsCount = 0;
  let createdAssignmentsCount = 0;
  let createdPaymentsCount = 0;

  for (const row of duesData.rows) {
    const rowNorm = normalizeName(row.name);
    let member = memberLookup.get(rowNorm);

    if (!member) {
      // Try token subset matching
      const rowTokens = rowNorm.split(' ');
      for (const m of dbMembers) {
        const mTokens = normalizeName(`${m.firstName} ${m.lastName}`).split(' ');
        const overlap = rowTokens.filter((t) => mTokens.includes(t));
        if (overlap.length >= 2 || (rowTokens.length === 1 && overlap.length === 1)) {
          member = m;
          break;
        }
      }
    }

    if (!member) {
      console.log(`Member not found: "${row.name}" -> creating without duplicate`);
      if (apply) {
        const parts = row.name.trim().split(/\s+/);
        const first = parts[0] || row.name;
        const last = parts.slice(1).join(' ') || 'Member';
        const code = `TFHC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        member = await prisma.member.create({
          data: {
            memberCode: code,
            firstName: first,
            lastName: last,
            phoneNumber: 'UNVERIFIED',
            roleInUnit: 'Member',
            status: row.newMember ? 'NEW_MEMBER' : 'ACTIVE',
          },
        });
        memberLookup.set(rowNorm, member);
        createdMemberCount++;
      } else {
        member = { id: `simulated-member-${row.name}`, firstName: row.name, lastName: '' };
        createdMemberCount++;
      }
    } else {
      matchedCount++;
    }

    const rowAmount = Number(row.amount) > 0 ? Number(row.amount) : defaultAmount;
    const paidMonths = new Set(row.paidMonths || []);
    const waivedMonths = new Set(row.waivedMonths || []);

    for (let m = 1; m <= 12; m++) {
      const period = periods[m - 1];
      const isPaid = paidMonths.has(m);
      const isWaived = waivedMonths.has(m);
      const expectedStatus = isPaid ? 'PAID' : isWaived ? 'WAIVED' : 'OUTSTANDING';
      const expectedAmountPaid = isPaid ? rowAmount : 0;

      if (!apply) {
        // Simulation
        createdAssignmentsCount++;
        if (isPaid) createdPaymentsCount++;
        continue;
      }

      // Check existing assignment
      let assignment = await prisma.memberDuesAssignment.findUnique({
        where: {
          periodId_memberId: {
            periodId: period.id,
            memberId: member.id,
          },
        },
        include: {
          payments: true,
        },
      });

      if (!assignment) {
        assignment = await prisma.memberDuesAssignment.create({
          data: {
            periodId: period.id,
            memberId: member.id,
            amountDue: rowAmount,
            amountPaid: expectedAmountPaid,
            status: expectedStatus,
            note: row.note || null,
          },
          include: { payments: true },
        });
        createdAssignmentsCount++;
      } else {
        // Update existing assignment if different
        if (
          assignment.amountDue !== rowAmount ||
          assignment.amountPaid !== expectedAmountPaid ||
          assignment.status !== expectedStatus
        ) {
          await prisma.memberDuesAssignment.update({
            where: { id: assignment.id },
            data: {
              amountDue: rowAmount,
              amountPaid: expectedAmountPaid,
              status: expectedStatus,
              note: row.note || assignment.note,
            },
          });
          updatedAssignmentsCount++;
        }
      }

      // Payment record handling for paid months
      if (isPaid) {
        const hasConfirmedPayment = assignment.payments && assignment.payments.some((p) => p.status === 'CONFIRMED');
        if (!hasConfirmedPayment) {
          const paidDate = new Date(Date.UTC(year, m - 1, dueDay));
          const dateStr = paidDate.toISOString().slice(2, 10).replace(/-/g, '');
          const ref = `PMT-${dateStr}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

          await prisma.payment.create({
            data: {
              reference: ref,
              memberId: member.id,
              purpose: 'MONTHLY_DUES',
              amount: rowAmount,
              method: 'OTHER',
              description: `${MONTHS[m - 1]} ${year} monthly dues (verified record)`,
              paidOn: paidDate,
              status: 'CONFIRMED',
              duesAssignmentId: assignment.id,
              recordedByUserId: actorUserId,
              confirmedByUserId: actorUserId,
              confirmedAt: new Date(),
              metadata: {
                imported: true,
                source: 'dues-matrix-2026',
                year,
                month: m,
              },
            },
          });
          createdPaymentsCount++;
        }
      } else {
        // If the month is not paid (e.g. waived or unpaid), clean up any stale imported matrix payments
        if (apply && assignment.id) {
          await prisma.payment.deleteMany({
            where: {
              duesAssignmentId: assignment.id,
              metadata: {
                path: ['imported'],
                equals: true,
              },
            },
          });
        }
      }
    }
  }

  console.log('\n=== Reconciliation Summary ===');
  console.log(`  Members matched:              ${matchedCount}`);
  console.log(`  New members created:          ${createdMemberCount}`);
  console.log(`  Assignments created:          ${createdAssignmentsCount}`);
  console.log(`  Assignments updated:          ${updatedAssignmentsCount}`);
  console.log(`  Confirmed payments created:   ${createdPaymentsCount}`);
  console.log(apply ? '\nAll 2026 dues records successfully synced.' : '\nDry run complete. No records modified.');
}

main()
  .catch((err) => {
    console.error('Error syncing dues:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
