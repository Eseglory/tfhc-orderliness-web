const { PrismaClient, Prisma } = require('@prisma/client');
const { DatabaseSync } = require('node:sqlite');
const quote = value => '"' + value.replace(/"/g, '""') + '"';
async function main() {
  const db = new DatabaseSync('/var/data/operational.db', { readOnly: true });
  const pg = new PrismaClient();
  try {
    const state = () => db.prepare("SELECT coalesce(max(sequence),0) AS latest,sum(CASE WHEN status<>'APPLIED' THEN 1 ELSE 0 END) AS pending FROM _sync_operations").get();
    const before = state();
    if (before.pending) throw Error('SYNC_MUST_DRAIN_BEFORE_COMPARISON');
    const models = Prisma.dmmf.datamodel.models;
    const tables = models.map(model => model.dbName || model.name);
    const local = tables.map(table => Number(db.prepare(`SELECT count(*) AS count FROM ${quote(table)}`).get().count));
    const central = await pg.$queryRawUnsafe(tables.map((table, index) => `SELECT ${index} AS position,count(*)::text AS count FROM public.${quote(table)}`).join(' UNION ALL '));
    const after = state();
    if (before.latest !== after.latest || after.pending) throw Error('CONCURRENT_WRITES_RETRY_COMPARISON');
    if (central.some(row => local[row.position] !== Number(row.count))) throw Error('RECORD_COUNT_MISMATCH');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('SQLITE_INTEGRITY_FAILED');
    const receipts = await pg.$queryRawUnsafe('SELECT count(*)::text AS total,count(DISTINCT (source_id,operation_id))::text AS distinct_operations FROM public._sqlite_sync_receipts');
    if (receipts[0].total !== receipts[0].distinct_operations) throw Error('DUPLICATE_RECEIPTS');
    console.log(JSON.stringify({ tablesCompared: models.length, records: local.reduce((a, b) => a + b, 0),
      countsMatch: true, foreignKeysValid: true, sqliteIntegrity: true, duplicateReceipts: 0,
      replayReceipts: Number(receipts[0].total), verifiedAt: new Date().toISOString() }));
  } finally { db.close(); await pg.$disconnect(); }
}
main().catch(e => { console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'CONSISTENCY_CHECK_FAILED'); process.exitCode = 1; });
