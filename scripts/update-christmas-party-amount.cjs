/**
 * Update Christmas Party campaign amount from ₦50,000 to ₦20,000.
 *
 *   node scripts/update-christmas-party-amount.cjs            # dry run
 *   node scripts/update-christmas-party-amount.cjs --apply    # write
 *
 * Respects DATABASE_URL from environment (or apps/api/.env fallback).
 * Never modifies or alters existing payment records (Payment table).
 */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
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

async function main() {
  const campaigns = await prisma.duesPeriod.findMany({
    where: {
      OR: [
        { label: { contains: 'Christmas', mode: 'insensitive' } },
        { description: { contains: 'Christmas', mode: 'insensitive' } },
      ],
    },
    include: {
      assignments: true,
      _count: { select: { assignments: true } },
    },
  });

  if (campaigns.length === 0) {
    console.log('No Christmas Party campaigns found in the database.');
    return;
  }

  for (const campaign of campaigns) {
    console.log(`\nFound Campaign: "${campaign.label}" (ID: ${campaign.id})`);
    console.log(`  Current default amount: ₦${campaign.defaultAmount.toLocaleString()}`);
    console.log(`  Current description: "${campaign.description || ''}"`);
    console.log(`  Total assignments: ${campaign._count.assignments}`);

    let updatedDescription = campaign.description || '';
    if (updatedDescription.includes('50,000')) {
      updatedDescription = updatedDescription.replace(/50,000/g, '20,000');
    } else if (updatedDescription.includes('50000')) {
      updatedDescription = updatedDescription.replace(/50000/g, '20,000');
    } else if (!updatedDescription) {
      updatedDescription = 'Please make your ₦20,000 Christmas Party contribution before the deadline. Kindly make payment 🙏🎉';
    }

    let assignmentsToUpdate = 0;
    let newlyPaidCount = 0;

    for (const a of campaign.assignments) {
      if (a.amountDue !== 20000) {
        assignmentsToUpdate++;
      }
      if (a.amountPaid >= 20000 && a.status !== 'PAID' && a.status !== 'WAIVED' && a.status !== 'EXEMPT') {
        newlyPaidCount++;
      }
    }

    console.log(`  Assignments needing amount update: ${assignmentsToUpdate}`);
    console.log(`  Assignments that will become PAID: ${newlyPaidCount}`);

    if (apply) {
      await prisma.duesPeriod.update({
        where: { id: campaign.id },
        data: {
          defaultAmount: 20000,
          description: updatedDescription,
        },
      });

      for (const a of campaign.assignments) {
        let newStatus = a.status;
        if (a.status !== 'WAIVED' && a.status !== 'EXEMPT') {
          if (a.amountPaid >= 20000) {
            newStatus = 'PAID';
          } else if (a.amountPaid > 0) {
            newStatus = 'PARTIALLY_PAID';
          } else {
            newStatus = 'OUTSTANDING';
          }
        }

        await prisma.memberDuesAssignment.update({
          where: { id: a.id },
          data: {
            amountDue: 20000,
            status: newStatus,
          },
        });
      }
      console.log('  -> Successfully updated campaign and assignments to ₦20,000.');
    }
  }

  console.log(apply ? '\nAll updates applied successfully.' : '\nDry run complete. No records modified.');
}

main()
  .catch((err) => {
    console.error('Error running update script:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
