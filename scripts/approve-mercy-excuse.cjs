const { PrismaClient } = require('@prisma/client');
const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const excuseId = 'ee87c34f-d8b2-4a2f-842b-61d56a2987a8';
  const approvalId = 'cffbdb58-ebd1-464b-bfd9-d63f28113dd5';
  const reviewerUserId = 'e316c5a8-1820-45b8-81ee-bd083f77e5b4'; // Glory Eseosa
  const reviewerMemberId = '97166ab6-edcb-4017-b55f-8b2485285150';

  console.log('--- Approving Mercy Absence Excuse ---');
  await prisma.$transaction(async (tx) => {
    // 1. Update AbsenceExcuse
    await tx.absenceExcuse.update({
      where: { id: excuseId },
      data: {
        status: 'APPROVED',
        reviewedBy: reviewerUserId,
        reviewNote: 'Approved. Prior notice acknowledged.',
        updatedAt: new Date()
      }
    });

    // 2. Update ApprovalRequest
    await tx.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        decidedAt: new Date(),
        updatedAt: new Date()
      }
    });

    // 3. Create ApprovalAction
    await tx.approvalAction.create({
      data: {
        request: { connect: { id: approvalId } },
        stepName: 'Leadership Review',
        stepOrder: 1,
        actorUserId: reviewerUserId,
        decision: 'APPROVED',
        comment: 'Approved. Prior notice acknowledged.',
      }
    });

    // 4. Update attendance records for today from ABSENT to EXCUSED
    const updatedAtt = await tx.attendanceRecord.updateMany({
      where: {
        memberId: '459baa9f-190f-4296-a8c0-7a927e58dfb6',
        meetingId: {
          in: [
            '8626ca8e-3b58-4f6e-878c-e104231ee556', // First Service
            'ba2c53e1-7906-40e7-8f08-3f02285db4b8'  // Second Service
          ]
        }
      },
      data: {
        status: 'EXCUSED',
        isModified: true,
        pointsEarned: 0
      }
    });
    console.log(`Updated ${updatedAtt.count} attendance records to EXCUSED.`);

    // 5. Create AuditLog
    await tx.auditLog.create({
      data: {
        actorUserId: reviewerUserId,
        action: 'ABSENCE_EXCUSE_APPROVED',
        entity: 'AbsenceExcuse',
        entityId: excuseId,
        newData: { status: 'APPROVED', reviewNote: 'Approved. Prior notice acknowledged.' },
        reason: 'Reconciled and approved Saturday advance notice for Sunday services'
      }
    });
  });

  console.log('Mercy excuse successfully approved and attendance updated to EXCUSED!');
  await prisma.$disconnect();
}

main().catch(console.error);
