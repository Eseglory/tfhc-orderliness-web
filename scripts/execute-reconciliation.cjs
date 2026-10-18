const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const exportData = JSON.parse(fs.readFileSync('scripts/sqlite-export.json', 'utf8'));
  console.log('=== STARTING PRODUCTION DATA RECONCILIATION ===');

  // 1. RECONCILE RACHEL AKOMOLEDE USER & MEMBER
  console.log('\n--- 1. Reconciling Rachel Akomolede User & Member ---');
  for (const u of exportData.users) {
    const existing = await prisma.user.findUnique({ where: { id: u.id } });
    if (!existing) {
      const createdUser = await prisma.user.create({
        data: {
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          googleSubject: u.googleSubject || null,
          role: u.role || 'MEMBER',
          isActive: Boolean(u.isActive),
          passwordAuthEnabled: true,
          emailVerifiedAt: u.emailVerifiedAt ? new Date(Number(u.emailVerifiedAt)) : new Date(),
          inviteAcceptedAt: u.inviteAcceptedAt ? new Date(Number(u.inviteAcceptedAt)) : new Date(),
          lastLoginAt: u.lastLoginAt ? new Date(Number(u.lastLoginAt)) : new Date(),
          createdAt: u.createdAt ? new Date(Number(u.createdAt)) : new Date(),
          updatedAt: u.updatedAt ? new Date(Number(u.updatedAt)) : new Date(),
        }
      });
      console.log(`Created user: ${createdUser.email} (${createdUser.id})`);
    } else {
      console.log(`User ${u.email} already exists.`);
    }

    // Link Member to User
    const member = await prisma.member.findUnique({
      where: { id: '210d75ac-f197-4569-bff9-a7af1ef0bcbb' }
    });
    if (member && member.userId !== u.id) {
      await prisma.member.update({
        where: { id: '210d75ac-f197-4569-bff9-a7af1ef0bcbb' },
        data: { userId: u.id }
      });
      console.log(`Linked member 210d75ac to user ${u.id}`);
    }

    // Update ApprovedMember inviteStatus
    const app = await prisma.approvedMember.findFirst({
      where: { normalizedEmail: u.email.toLowerCase() }
    });
    if (app && app.inviteStatus !== 'ACCEPTED') {
      await prisma.approvedMember.update({
        where: { id: app.id },
        data: { inviteStatus: 'ACCEPTED' }
      });
      console.log(`Updated approvedMember ${app.email} to ACCEPTED`);
    }
  }

  // 2. RECONCILE APPROVAL REQUEST (Mercy's request)
  console.log('\n--- 2. Reconciling Approval Requests ---');
  for (const a of exportData.approval_requests) {
    const existing = await prisma.approvalRequest.findUnique({ where: { id: a.id } });
    if (!existing) {
      const createdApp = await prisma.approvalRequest.create({
        data: {
          id: a.id,
          workflowId: a.workflowId,
          requestType: a.requestType,
          entityType: a.entityType,
          entityId: a.entityId,
          requestedByUserId: a.requestedByUserId || null,
          requestedByMemberId: a.requestedByMemberId || null,
          summary: a.summary,
          amount: a.amount ? Number(a.amount) : null,
          status: a.status || 'PENDING',
          currentStepOrder: a.currentStepOrder || 1,
          decidedAt: a.decidedAt ? new Date(Number(a.decidedAt)) : null,
          createdAt: a.createdAt ? new Date(Number(a.createdAt)) : new Date(),
          updatedAt: a.updatedAt ? new Date(Number(a.updatedAt)) : new Date(),
        }
      });
      console.log(`Created ApprovalRequest: ${createdApp.id} (${createdApp.summary})`);
    } else {
      console.log(`ApprovalRequest ${a.id} already exists.`);
    }
  }

  // 3. RECONCILE ABSENCE EXCUSES (Mercy's excuse)
  console.log('\n--- 3. Reconciling Absence Excuses ---');
  for (const e of exportData.absence_excuses) {
    const existing = await prisma.absenceExcuse.findUnique({ where: { id: e.id } });
    if (!existing) {
      const createdExcuse = await prisma.absenceExcuse.create({
        data: {
          id: e.id,
          memberId: e.memberId,
          meetingId: e.meetingId || null,
          startDate: e.startDate ? new Date(Number(e.startDate)) : null,
          endDate: e.endDate ? new Date(Number(e.endDate)) : null,
          requestType: e.requestType || 'GENERAL_UNAVAILABILITY',
          supportingDocUrl: e.supportingDocUrl || null,
          reason: e.reason,
          category: e.category || 'OTHER',
          status: e.status || 'PENDING',
          reviewedBy: e.reviewedBy || null,
          reviewNote: e.reviewNote || null,
          approvalRequestId: e.approvalRequestId || null,
          createdAt: e.createdAt ? new Date(Number(e.createdAt)) : new Date(),
          updatedAt: e.updatedAt ? new Date(Number(e.updatedAt)) : new Date(),
        }
      });
      console.log(`Created AbsenceExcuse: ${createdExcuse.id} for member ${createdExcuse.memberId}`);
    } else {
      console.log(`AbsenceExcuse ${e.id} already exists.`);
    }
  }

  // 4. RECONCILE PAYMENTS (Mercy's 2 + Blessing's 6)
  console.log('\n--- 4. Reconciling Payments ---');
  for (const p of exportData.payments) {
    const existing = await prisma.payment.findUnique({ where: { id: p.id } });
    if (!existing) {
      // Check if duesAssignment exists
      let validDuesAssignmentId = null;
      if (p.duesAssignmentId) {
        const da = await prisma.memberDuesAssignment.findUnique({ where: { id: p.duesAssignmentId } });
        if (da) {
          validDuesAssignmentId = p.duesAssignmentId;
        } else {
          console.log(`Warning: duesAssignment ${p.duesAssignmentId} not found, setting null`);
        }
      }

      let metaObj = null;
      if (p.metadata) {
        try {
          metaObj = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
        } catch (err) {
          metaObj = { raw: p.metadata };
        }
      }

      const createdPmt = await prisma.payment.create({
        data: {
          id: p.id,
          reference: p.reference,
          memberId: p.memberId,
          purpose: p.purpose,
          amount: Number(p.amount),
          method: p.method,
          payerReference: p.payerReference || null,
          description: p.description || null,
          paidOn: p.paidOn ? new Date(Number(p.paidOn)) : new Date(),
          status: p.status || 'PENDING',
          duesAssignmentId: validDuesAssignmentId,
          recordedByUserId: p.recordedByUserId || null,
          confirmedByUserId: p.confirmedByUserId || null,
          confirmedAt: p.confirmedAt ? new Date(Number(p.confirmedAt)) : null,
          rejectionReason: p.rejectionReason || null,
          metadata: metaObj,
          createdAt: p.createdAt ? new Date(Number(p.createdAt)) : new Date(),
          updatedAt: p.updatedAt ? new Date(Number(p.updatedAt)) : new Date(),
        }
      });
      console.log(`Created Payment: ${createdPmt.reference} (₦${createdPmt.amount}) member: ${createdPmt.memberId}`);
    } else {
      console.log(`Payment ${p.reference} already exists.`);
    }
  }

  // 5. RECONCILE MARTHA'S SATURDAY ATTENDANCE
  console.log('\n--- 5. Reconciling Martha Saturday Check-in ---');
  const marthaSatExcuse = exportData.attendance_records.find(
    r => r.memberId === '8bf8d6a1-39aa-480e-a690-ed0ea8ce0691' && r.meetingId === '063464ed-3d74-4948-9460-09dbdd66e5bb'
  );
  if (marthaSatExcuse) {
    const existingRec = await prisma.attendanceRecord.findFirst({
      where: {
        memberId: '8bf8d6a1-39aa-480e-a690-ed0ea8ce0691',
        meetingId: '063464ed-3d74-4948-9460-09dbdd66e5bb'
      }
    });
    if (existingRec && existingRec.status === 'ABSENT') {
      await prisma.attendanceRecord.update({
        where: { id: existingRec.id },
        data: {
          status: 'LATE',
          actualArrivalTime: new Date(Number(marthaSatExcuse.actualArrivalTime)),
          gpsLat: Number(marthaSatExcuse.gpsLat),
          gpsLong: Number(marthaSatExcuse.gpsLong),
          gpsAccuracy: Number(marthaSatExcuse.gpsAccuracy),
          distanceFromVenue: Number(marthaSatExcuse.distanceFromVenue),
          method: 'SYSTEM_GEO',
          pointsEarned: 5,
          joinedAt: new Date(Number(marthaSatExcuse.joinedAt)),
          lastSeenAt: new Date(Number(marthaSatExcuse.lastSeenAt)),
          deviceInfo: marthaSatExcuse.deviceInfo,
          isModified: false,
        }
      });
      console.log(`Updated Martha John-Williams Saturday attendance to LATE (+5 pts)`);
    } else {
      console.log(`Martha record already updated or not found: status=${existingRec?.status}`);
    }
  }

  // 6. RECONCILE PUSH SUBSCRIPTIONS
  console.log('\n--- 6. Reconciling Push Subscriptions ---');
  for (const s of exportData.push_subscriptions) {
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: s.endpoint } });
    if (!existing) {
      await prisma.pushSubscription.create({
        data: {
          id: s.id,
          userId: s.userId,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
          sessionExpiresAt: new Date(Number(s.sessionExpiresAt)),
          lastNotifiedAt: s.lastNotifiedAt ? new Date(Number(s.lastNotifiedAt)) : new Date(),
          nextAttemptAt: s.nextAttemptAt ? new Date(Number(s.nextAttemptAt)) : new Date(),
          failures: s.failures || 0,
          createdAt: s.createdAt ? new Date(Number(s.createdAt)) : new Date(),
          updatedAt: s.updatedAt ? new Date(Number(s.updatedAt)) : new Date(),
        }
      });
      console.log(`Created PushSubscription: ${s.id} for user ${s.userId}`);
    }
  }

  // 7. RECONCILE CHAT MESSAGES
  console.log('\n--- 7. Reconciling Chat Messages ---');
  for (const c of exportData.chat_messages) {
    const existing = await prisma.chatMessage.findUnique({ where: { id: c.id } });
    if (!existing) {
      await prisma.chatMessage.create({
        data: {
          id: c.id,
          roomId: c.roomId,
          senderMemberId: c.senderMemberId || null,
          type: c.type || 'SYSTEM',
          body: c.body,
          attachmentUrl: c.attachmentUrl || null,
          attachmentMeta: c.attachmentMeta || null,
          replyToId: c.replyToId || null,
          createdAt: c.createdAt ? new Date(Number(c.createdAt)) : new Date(),
        }
      });
      console.log(`Created ChatMessage: ${c.id}`);
    }
  }

  console.log('\n=== RECONCILIATION COMPLETED SUCCESSFULLY ===');
  await prisma.$disconnect();
}

main().catch(console.error);
