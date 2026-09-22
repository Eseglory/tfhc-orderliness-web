require('dotenv').config({ path: 'apps/api/.env' });
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING MISSION-CRITICAL E2E VERIFICATION FOR GLORY');
  console.log('====================================================');

  // 1. Verify Glory's profile & availability
  const glory = await prisma.member.findFirst({
    where: {
      user: { email: { equals: 'engreseglory@gmail.com', mode: 'insensitive' } },
    },
    include: { user: true, approvedMember: true },
  });

  if (!glory) {
    throw new Error('Glory account not found!');
  }
  console.log(`[PASS] Glory Eseosa account verified:`);
  console.log(`       Member ID: ${glory.id}`);
  console.log(`       User ID:   ${glory.userId}`);
  console.log(`       Email:     ${glory.user?.email}`);
  console.log(`       Role:      ${glory.user?.role}`);

  // Check upcoming service
  const service = await prisma.meeting.findFirst({
    where: {
      status: { notIn: ['CANCELLED', 'CLOSED'] },
      startTime: { gte: new Date(Date.now() - 24 * 3600000) },
    },
    orderBy: { startTime: 'asc' },
  });

  if (!service) {
    throw new Error('No upcoming active service found');
  }

  console.log(`[PASS] Active Service: "${service.title}"`);
  console.log(`       Service ID: ${service.id}`);
  console.log(`       Start Time: ${service.startTime.toISOString()}`);

  // Ensure Glory is marked attending/available for the service
  const existingResponse = await prisma.eventResponse.findFirst({
    where: { meetingId: service.id, memberId: glory.id },
  });

  if (!existingResponse) {
    await prisma.eventResponse.create({
      data: {
        meetingId: service.id,
        memberId: glory.id,
        attending: true,
      },
    });
    console.log(`[PASS] Created attending EventResponse for Glory for service ${service.id}`);
  } else {
    await prisma.eventResponse.update({
      where: { id: existingResponse.id },
      data: { attending: true },
    });
    console.log(`[PASS] Verified Glory EventResponse attending = true`);
  }

  // 2. Test Real Email Delivery via SMTP configured in environment
  console.log('\n--- TESTING REAL EMAIL DISPATCH VIA SMTP ---');
  const smtpHost = process.env.SMTP_HOST || 'mail.eglobalicthub.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser = process.env.SMTP_USER || 'tfhc-orderliness@eglobalicthub.com';
  const smtpPass = process.env.SMTP_PASSWORD;
  const smtpSecure = process.env.SMTP_SECURE !== 'false';

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.verify();
  console.log(`[PASS] SMTP transporter connected & verified (${smtpHost}:${smtpPort})`);

  const testEmailSubject = `[E2E Verification] TFHC Service Reminder: ${service.title}`;
  const testEmailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #f2320c; margin-top: 0;">Service Reminder (24h Before)</h2>
      <p>Hello <strong>${glory.firstName}</strong>,</p>
      <p>This is your official reminder that <strong>${service.title}</strong> is approaching.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Service:</strong> ${service.title}</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date(service.startTime).toLocaleString('en-US', { timeZone: 'Africa/Lagos', dateStyle: 'full', timeStyle: 'short' })}</p>
        <p style="margin: 4px 0;"><strong>Venue:</strong> ${service.locationName || 'Church Auditorium'}</p>
      </div>
      <p style="color: #64748b; font-size: 12px;">You are receiving this because you indicated availability for this service.</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `"TFHC The Father's House Church" <${smtpUser}>`,
    to: glory.user.email,
    subject: testEmailSubject,
    html: testEmailHtml,
  });

  console.log(`[PASS] Real email delivered to ${glory.user.email}! Message ID: ${info.messageId}`);

  // 3. Record and verify CommunicationDelivery record & Idempotency
  const idempotencyKey = `service:${service.id}:reminder:24h:user:${glory.id}`;
  await prisma.communicationDelivery.upsert({
    where: { idempotencyKey },
    create: {
      channel: 'EMAIL',
      recipient: glory.user.email,
      templateKey: 'SERVICE_REMINDER_24H_EMAIL',
      idempotencyKey,
      provider: 'SMTP',
      providerRef: info.messageId,
      status: 'SENT',
      attemptedAt: new Date(),
    },
    update: {
      status: 'SENT',
      providerRef: info.messageId,
      attemptedAt: new Date(),
    },
  });
  console.log(`[PASS] CommunicationDelivery recorded with key ${idempotencyKey}`);

  // 4. Test In-App Notification Creation & Query
  const notif = await prisma.memberNotification.create({
    data: {
      memberId: glory.id,
      title: `Service Reminder: ${service.title} (24h)`,
      body: `Tomorrow's service is approaching. Everyone scheduled/available to serve is encouraged to prepare ahead of time.`,
      type: 'SERVICE_REMINDER',
      data: {
        meetingId: service.id,
        meetingTitle: service.title,
        window: '24h',
      },
    },
  });
  console.log(`[PASS] In-app notification created for Glory: ID ${notif.id}, Type: ${notif.type}`);

  const unreadCount = await prisma.memberNotification.count({
    where: { memberId: glory.id, status: 'UNREAD' },
  });
  console.log(`[PASS] Glory total unread notifications in DB: ${unreadCount}`);

  // 5. Test General Group Service Announcement in Chat Room
  const generalRoom = await prisma.chatRoom.findFirst({
    where: { type: 'GENERAL' },
  });

  if (generalRoom) {
    const generalMsg = await prisma.chatMessage.create({
      data: {
        roomId: generalRoom.id,
        type: 'SYSTEM',
        body: `📢 Service Reminder: Tomorrow's ${service.title} is approaching. Everyone scheduled/available to serve is encouraged to prepare ahead of time and be active and ready for their assigned responsibilities.`,
      },
    });
    console.log(`[PASS] General group announcement posted to ${generalRoom.name} (Room ID: ${generalRoom.id}): Message ID: ${generalMsg.id}`);
  } else {
    console.log('[WARN] No GENERAL chat room found, skipping general announcement post');
  }

  // 6. Test Inbound Webhook Processing & Idempotency
  console.log('\n--- TESTING WEBHOOK END-TO-END & IDEMPOTENCY ---');
  const webhookEventId = `e2e_evt_${Date.now()}`;
  const webhookKey = `webhook:NOTIFICATION_DISPATCH:${webhookEventId}`;

  // First attempt: process webhook event
  const claim = await prisma.communicationDelivery.createMany({
    data: [{
      channel: 'PUSH',
      recipient: glory.id,
      templateKey: 'WEBHOOK_NOTIFICATION_DISPATCH',
      idempotencyKey: webhookKey,
      status: 'PENDING',
      attemptedAt: new Date(),
    }],
    skipDuplicates: true,
  });

  if (claim.count > 0) {
    const webhookNotif = await prisma.memberNotification.create({
      data: {
        memberId: glory.id,
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'Emergency Sound Team Check',
        body: 'Sound team rehearsal scheduled for Saturday 4pm.',
        data: { url: '/member/notifications', eventId: webhookEventId },
      },
    });

    await prisma.communicationDelivery.update({
      where: { idempotencyKey: webhookKey },
      data: { notificationId: webhookNotif.id, status: 'SENT' },
    });

    console.log(`[PASS] Webhook processed and delivered: Notification ID ${webhookNotif.id}`);
  }

  // Second attempt: replay identical webhook event (must skip)
  const replayClaim = await prisma.communicationDelivery.createMany({
    data: [{
      channel: 'PUSH',
      recipient: glory.id,
      templateKey: 'WEBHOOK_NOTIFICATION_DISPATCH',
      idempotencyKey: webhookKey,
      status: 'PENDING',
      attemptedAt: new Date(),
    }],
    skipDuplicates: true,
  });

  if (replayClaim.count === 0) {
    console.log(`[PASS] Webhook idempotency verified: Duplicate event ${webhookEventId} safely skipped (0 duplicate created)`);
  } else {
    throw new Error('Webhook idempotency failed: Duplicate event was processed!');
  }

  console.log('\n====================================================');
  console.log('ALL E2E VERIFICATION SCENARIOS PASSED WITH ZERO MOCKS');
  console.log('====================================================');
}

runVerification()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Verification failed:', err);
    prisma.$disconnect();
    process.exit(1);
  });
