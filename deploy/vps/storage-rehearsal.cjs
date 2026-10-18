// Synthetic data only. Run inside the staging image with /var/data bound to
// the staging VPS disk, never against the production operational database.
const { existsSync } = require('node:fs');
const base = '/app/apps/api/dist/apps/api/src/database-sync/';
const { bootstrapSqlite } = require(base + 'sqlite-bootstrap');
const { SqlitePrismaAdapter } = require(base + 'sqlite-prisma-adapter');
const { inspectSqliteStorage } = require(base + 'storage-preflight');
const file = '/var/data/operational.db';
async function main() {
  const action = process.argv[2];
  if (!['create', 'verify'].includes(action) || process.env.NODE_ENV !== 'development' || process.env.DATABASE_URL)
    throw Error('ISOLATED_STAGING_REQUIRED');
  if (action === 'create') {
    if (existsSync(file)) throw Error('REFUSING_TO_OVERWRITE_EXISTING_DATABASE');
    await bootstrapSqlite(file);
  }
  const adapter = new SqlitePrismaAdapter(file);
  try {
    await adapter.connect();
    if (action === 'create') {
      await adapter.client.$transaction(async tx => {
        await tx.user.create({ data: { id: 'tfhc-storage-rehearsal-user', email: 'rehearsal@example.test', passwordHash: 'not-a-valid-login-hash', role: 'ADMIN' } });
        await tx.auditLog.create({ data: { id: 'tfhc-storage-rehearsal-audit', actorUserId: 'tfhc-storage-rehearsal-user', action: 'STORAGE_REHEARSAL', entity: 'Test', entityId: 'synthetic-only' } });
      });
    }
    const record = await adapter.client.auditLog.findUnique({ where: { id: 'tfhc-storage-rehearsal-audit' }, include: { actorUser: true } });
    if (record?.actorUser?.id !== 'tfhc-storage-rehearsal-user') throw Error('PERSISTENCE_REHEARSAL_FAILED');
    const storage = inspectSqliteStorage(file);
    if (!storage.dedicatedMount) throw Error('DURABLE_BIND_MOUNT_REQUIRED');
    console.log(JSON.stringify({ action, sourceId: adapter.sourceId, relationshipVerified: true, storage, backlog: await adapter.journal.status() }));
  } finally { await adapter.disconnect(); }
}
main().catch(e => { console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'STAGING_REHEARSAL_FAILED'); process.exitCode = 1; });
