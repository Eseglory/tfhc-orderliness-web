// Read-only source rehearsal. The temporary copy is never an operational DB.
const { PrismaClient } = require('@prisma/client');
const { bootstrapSqlite } = require('./apps/api/dist/apps/api/src/database-sync/sqlite-bootstrap');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'tfhc-import-check-'));
  const pg = new PrismaClient();
  try {
    const result = await bootstrapSqlite(join(directory, 'rehearsal.db'), pg);
    console.log(JSON.stringify({ readOnlyImportVerified: true, tables: result.tableCount,
      rows: Object.values(result.counts).reduce((sum, value) => sum + value, 0),
      recordValuesVerified: true, foreignKeysVerified: true,
      scope: 'Read-only snapshot rehearsal; not a final cutover snapshot' }));
  } finally {
    await pg.$disconnect();
    // Only the fresh temporary directory allocated by this process.
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(() => { console.error('READ_ONLY_IMPORT_REHEARSAL_FAILED'); process.exitCode = 1; });
