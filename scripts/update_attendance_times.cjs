/** Evidence-based attendance correction. Dry-run unless --apply is supplied.
 * Input: [{recordId, meetingId, actualArrivalTime: ISO8601, evidence: string}].
 * Usage: node scripts/update_attendance_times.cjs input.json [--apply --actor-user-id ID]
 * DATABASE_URL must be provided explicitly. Never infer times, duration or attendance method.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const args = process.argv.slice(2);
if (!args[0] || args.includes('--help')) {
  console.log('Usage: node scripts/update_attendance_times.cjs input.json [--apply --actor-user-id ID]');
  process.exit(0);
}
const apply = args.includes('--apply');
const actor = args[args.indexOf('--actor-user-id') + 1];
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL explicitly');
if (apply && !args.includes('--actor-user-id')) throw new Error('An audit actor is required for --apply');
const inputs = JSON.parse(fs.readFileSync(args[0], 'utf8'));
if (!Array.isArray(inputs) || !inputs.length) throw new Error('A nonempty input array is required');
const ids = new Set();
for (const row of inputs) {
  if (!row.recordId || !row.meetingId || !row.evidence?.trim() ||
      typeof row.actualArrivalTime !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(row.actualArrivalTime) ||
      !Number.isFinite(Date.parse(row.actualArrivalTime)) || ids.has(row.recordId)) {
    throw new Error('Each unique record requires a meeting, timezone-qualified timestamp and supporting evidence');
  }
  ids.add(row.recordId);
}
const db = new PrismaClient();
(async () => {
  const records = await db.attendanceRecord.findMany({ where: { id: { in: [...ids] } } });
  for (const row of inputs) if (!records.some(record => record.id === row.recordId && record.meetingId === row.meetingId)) throw new Error('Record/meeting mismatch');
  if (!apply) { console.log(JSON.stringify({ dryRun: true, proposedCorrections: inputs.length })); return; }
  await db.user.findUniqueOrThrow({ where: { id: actor } });
  const backupDir = path.resolve(__dirname, '../data/storage-backups/attendance-corrections');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(backupDir, Date.now() + '.json'), JSON.stringify({ inputs, records }), { mode: 0o600, flag: 'wx' });
  await db.$transaction(async tx => {
    for (const row of inputs) {
      const previous = records.find(record => record.id === row.recordId);
      const result = await tx.attendanceRecord.updateMany({
        where: { id: row.recordId, meetingId: row.meetingId, actualArrivalTime: previous.actualArrivalTime },
        data: { actualArrivalTime: new Date(row.actualArrivalTime) },
      });
      if (result.count !== 1) throw new Error('Record changed concurrently; correction rolled back');
      await tx.auditLog.create({ data: { actorUserId: actor, action: 'ATTENDANCE_TIME_CORRECTED', entity: 'AttendanceRecord', entityId: row.recordId,
        previousData: { actualArrivalTime: previous.actualArrivalTime?.toISOString() || null },
        newData: { actualArrivalTime: row.actualArrivalTime, evidence: row.evidence } } });
    }
  });
  console.log(JSON.stringify({ applied: inputs.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
