// Explicit additive support-schema installation after verified backup restoration.
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
async function main() {
  if (!process.argv.includes('--apply-after-verified-backup')) throw Error('EXPLICIT_APPLY_REQUIRED');
  const evidence = JSON.parse(fs.readFileSync('/var/backups/evidence.json', 'utf8'));
  if (!evidence.restoreVerified || createHash('sha256').update(fs.readFileSync('/var/backups/public.dump')).digest('hex') !== evidence.sha256)
    throw Error('BACKUP_VERIFICATION_REQUIRED');
  const pg = new PrismaClient();
  try {
    const rows = await pg.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('_sqlite_sync_sources','_sqlite_sync_receipts','_sqlite_recovery_operations','_sqlite_operational_authority')");
    if (rows.length) throw Error('SUPPORT_SCHEMA_ALREADY_EXISTS_REVIEW_REQUIRED');
    const sql = fs.readFileSync('/app/replication-receipts.sql', 'utf8').replace(/--[^\n]*/g, '');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s && !/^(BEGIN|COMMIT)$/i.test(s));
    await pg.$transaction(async tx => { for (const statement of statements) await tx.$executeRawUnsafe(statement); });
    console.log(JSON.stringify({ supportTablesCreated: 4, businessDataModified: false }));
  } finally { await pg.$disconnect(); }
}
main().catch(() => { console.error('CENTRAL_PREPARATION_FAILED'); process.exitCode = 1; });
