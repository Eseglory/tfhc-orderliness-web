const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const dbUrl = 'postgresql://postgres.chokeuzqefbxfkntkvfq:%2A7mYs%25TBHnU3-yk@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=3';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  const data = JSON.parse(fs.readFileSync('scripts/sqlite-export.json', 'utf8'));

  console.log('=== 1. USERS ===');
  for (const u of data.users) {
    const existing = await prisma.user.findUnique({ where: { id: u.id } });
    console.log(`User [${u.email}] (${u.id}): ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 2. MEETINGS ===');
  for (const m of data.meetings) {
    const existing = await prisma.meeting.findUnique({ where: { id: m.id } });
    console.log(`Meeting [${m.title}] (${m.id}): ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 3. ABSENCE EXCUSES ===');
  for (const e of data.absence_excuses) {
    const existing = await prisma.absenceExcuse.findUnique({ where: { id: e.id } });
    console.log(`AbsenceExcuse [${e.id}] (member ${e.memberId}): ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 4. APPROVAL REQUESTS ===');
  for (const a of data.approval_requests) {
    const existing = await prisma.approvalRequest.findUnique({ where: { id: a.id } });
    console.log(`ApprovalRequest [${a.id}] (entity ${a.entityId}): ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 5. PAYMENTS ===');
  for (const p of data.payments) {
    const existing = await prisma.payment.findUnique({ where: { id: p.id } });
    console.log(`Payment [${p.reference}] (${p.id}) member ${p.memberId}: ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 6. ATTENDANCE RECORDS ===');
  for (const a of data.attendance_records) {
    const existing = await prisma.attendanceRecord.findUnique({ where: { id: a.id } });
    console.log(`AttendanceRecord [${a.id}] (meeting ${a.meetingId}, member ${a.memberId}): ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 7. PUSH SUBSCRIPTIONS ===');
  for (const s of data.push_subscriptions) {
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: s.endpoint } });
    console.log(`PushSubscription [${s.id}] user ${s.userId}: ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 8. PWA SESSIONS ===');
  for (const s of data.pwa_device_sessions) {
    const existing = await prisma.pwaDeviceSession.findUnique({ where: { tokenHash: s.tokenHash } });
    console.log(`PwaSession [${s.id}] user ${s.userId}: ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  console.log('\n=== 9. CHAT MESSAGES ===');
  for (const c of data.chat_messages) {
    const existing = await prisma.chatMessage.findUnique({ where: { id: c.id } });
    console.log(`ChatMessage [${c.id}]: ${existing ? 'ALREADY IN PG' : 'MISSING IN PG'}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
