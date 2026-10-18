import { Prisma, PrismaClient } from '@prisma/client';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { SqlitePrismaAdapter } from '../src/database-sync/sqlite-prisma-adapter';
import { PostgresDestination } from '../src/database-sync/postgres-destination';
import { SyncRunner } from '../src/database-sync/sync-runner';
import { RecoveryJournal } from '../src/database-sync/recovery-journal';
import { recoverSqlite } from '../src/database-sync/recover-sqlite';
import { OperationalLease } from '../src/database-sync/operational-lease';

const enabled = process.env.TFHC_SQLITE_PG_INTEGRATION === '1';
jest.setTimeout(30000);
(enabled ? describe : describe.skip)('SQLite to actual disposable PostgreSQL', () => {
  let pg: PrismaClient;
  let directory: string;
  let adapter: SqlitePrismaAdapter;
  let target: PostgresDestination;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.port !== '55519' || url.pathname !== '/tfhc_e2e') throw new Error('ISOLATED_DATABASE_REQUIRED');
    pg = new PrismaClient();
    await pg.$connect();
    const tables = await pg.$queryRawUnsafe<any[]>("SELECT to_regclass('public._sqlite_sync_sources')::text AS name");
    if (!tables[0].name) {
      const sql = readFileSync(resolve(__dirname, '../src/database-sync/replication-receipts.sql'), 'utf8').replace(/--[^\n]*/g, '');
      await pg.$transaction(async tx => {
        for (const statement of sql.split(';').map(value => value.trim()).filter(value => value && !['BEGIN','COMMIT'].includes(value))) await tx.$executeRawUnsafe(statement);
      });
    }
    await pg.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS public._sqlite_recovery_operations (
      source_id text NOT NULL REFERENCES public._sqlite_sync_sources(source_id), operation_id text NOT NULL,
      sequence bigint NOT NULL, digest text NOT NULL, payload text NOT NULL, protected_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(source_id,operation_id), UNIQUE(source_id,sequence))`);
    await pg.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS public._sqlite_operational_authority (
      singleton boolean PRIMARY KEY CHECK(singleton),source_id text NOT NULL,owner_id text NOT NULL,expires_at timestamptz NOT NULL)`);
  }, 30000);
  beforeEach(async () => {
    // Explicit opt-in AND exact disposable container port/database required above.
    const tables = Prisma.dmmf.datamodel.models.map(model => '"' + (model.dbName || model.name) + '"');
    await pg.$executeRawUnsafe(`TRUNCATE ${[...tables, '_sqlite_sync_receipts', '_sqlite_sync_sources', '_sqlite_operational_authority'].join(',')} RESTART IDENTITY CASCADE`);
    directory = mkdtempSync(join(tmpdir(), 'tfhc-live-replication-'));
  });
  afterEach(async () => { await adapter?.disconnect(); adapter = undefined; if (directory) rmSync(directory, { recursive: true, force: true }); });
  afterAll(async () => pg?.$disconnect());
  const open = async () => {
    const file = join(directory, 'local.db');
    const imported = await bootstrapSqlite(file, pg);
    adapter = new SqlitePrismaAdapter(file);
    await adapter.connect();
    target = new PostgresDestination(pg, adapter.sourceId);
    return imported;
  };

  it('fences a second writer and refuses an unrelated SQLite authority', async () => {
    await open();
    const first = new OperationalLease(pg, adapter.sourceId);
    const second = new OperationalLease(pg, adapter.sourceId);
    try {
      await first.acquire();
      await expect(second.acquire()).rejects.toThrow('SQLITE_AUTHORITY_ALREADY_ACTIVE');
      await first.release();
      await second.acquire();
      await expect(pg.$transaction(tx => first.assertOwner(tx))).rejects.toThrow('SQLITE_AUTHORITY_LEASE_LOST');
      await expect(new OperationalLease(pg, 'unrelated-source-identifier').acquire()).rejects.toThrow('SQLITE_AUTHORITY_ALREADY_ACTIVE');
    } finally { await first.release(); await second.release(); }
  });

  it('protects acknowledged writes remotely and retries a failed confirmation without duplicating data', async () => {
    await open();
    const recovery = new RecoveryJournal(pg, adapter.sourceId, adapter.journal);
    adapter.protectWrites = () => recovery.protectPending();
    const work = () => adapter.client.subTeam.create({ data: { id: 'protected', name: 'Protected' } });
    const first = await adapter.request(work, 'protected-request-key', 'request-hash');
    expect(await pg.subTeam.count()).toBe(0); // Business tables still follow the daily schedule.
    expect(await adapter.journal.unprotected()).toHaveLength(0);
    const logs = await pg.$queryRawUnsafe<any[]>('SELECT payload FROM public._sqlite_recovery_operations');
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].payload).request.key).toBe('protected-request-key');
    adapter.protectWrites = () => new RecoveryJournal({ $transaction: async () => { throw new Error('offline'); } } as any,
      adapter.sourceId, adapter.journal).protectPending();
    const secondWork = () => adapter.client.subTeam.create({ data: { id: 'pending', name: 'Pending' } });
    await expect(adapter.request(secondWork, 'pending-request-key', 'second-hash')).rejects.toMatchObject({ status: 503 });
    expect(await adapter.journal.unprotected()).toHaveLength(1);
    const path = adapter.path;
    await adapter.disconnect();
    adapter = new SqlitePrismaAdapter(path);
    await adapter.connect();
    adapter.protectWrites = () => new RecoveryJournal(pg, adapter.sourceId, adapter.journal).protectPending();
    const recovered = await adapter.request<any>(secondWork, 'pending-request-key', 'second-hash');
    expect(recovered.id).toBe('pending');
    expect(await adapter.client.subTeam.count()).toBe(2);
    expect(await adapter.request(work, 'protected-request-key', 'request-hash')).toEqual(first);
    expect(await adapter.journal.unprotected()).toHaveLength(0);
    expect((await new SyncRunner(adapter.journal, new PostgresDestination(pg, adapter.sourceId)).run()).applied).toBe(2);
    expect(await pg.subTeam.count()).toBe(2);
  });

  it('imports a consistent snapshot and preserves JSON null versus SQL NULL', async () => {
    await pg.user.create({ data: { id: 'actor', email: 'import@example.test', passwordHash: 'synthetic-test-only', role: 'ADMIN' } });
    await pg.auditLog.create({ data: { id: 'audit', actorUserId: 'actor', action: 'TEST', entity: 'Fixture', entityId: 'fixture', previousData: Prisma.DbNull, newData: Prisma.JsonNull } });
    const imported = await open();
    expect(imported.counts.User).toBe(1);
    expect(imported.counts.AuditLog).toBe(1);
    await adapter.client.auditLog.update({ where: { id: 'audit' }, data: { reason: 'Updated locally' } });
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
    const masks = await pg.$queryRawUnsafe<any[]>('SELECT "previousData" IS NULL AS previous_null,"newData" IS NULL AS new_null FROM audit_logs');
    expect(masks).toEqual([{ previous_null: true, new_null: false }]);
  });

  it('rebuilds a lost SQLite authority from protected operations and preserves retry receipts', async () => {
    await open();
    adapter.protectWrites = () => new RecoveryJournal(pg, adapter.sourceId, adapter.journal).protectPending();
    const original = await adapter.request<any>(() => adapter.client.subTeam.create({ data: { name: 'Disk recovery' } }), 'disk-recovery-request', 'disk-hash');
    const sourceId = adapter.sourceId;
    await adapter.disconnect();
    adapter = undefined;
    const restored = join(directory, 'restored.db');
    await expect(recoverSqlite(pg, sourceId, restored, { writersStopped: false, backupVerified: true })).rejects.toThrow('RECOVERY_PREFLIGHT_REQUIRED');
    const result = await recoverSqlite(pg, sourceId, restored, { writersStopped: true, backupVerified: true });
    expect(result.recoveredOperations).toBe(1);
    expect(result.counts.SubTeam).toBe(1);
    adapter = new SqlitePrismaAdapter(restored);
    await adapter.connect();
    expect(adapter.sourceId).toBe(sourceId);
    expect(await adapter.request(async () => { throw new Error('Must not run twice'); }, 'disk-recovery-request', 'disk-hash')).toEqual(original);
    await adapter.client.subTeam.update({ where: { id: original.id }, data: { name: 'Restored and writable' } });
    expect((await new SyncRunner(adapter.journal, new PostgresDestination(pg, sourceId)).run()).applied).toBe(1);
    expect((await pg.subTeam.findUnique({ where: { id: original.id } })).name).toBe('Restored and writable');
  });

  it('replicates multi-row inserts, duplicate receipt replay, updates, and deletions in order', async () => {
    await open();
    await adapter.client.$transaction(async tx => {
      await tx.subTeam.create({ data: { id: 'team', name: 'First' } });
      await tx.subTeam.create({ data: { id: 'second', name: 'Second' } });
    });
    const first = await adapter.journal.next();
    await target.apply(first);
    await target.apply(first); // remote receipt, local checkpoint deliberately not updated
    expect(await pg.subTeam.count()).toBe(2);
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
    await adapter.client.subTeam.update({ where: { id: 'team' }, data: { name: 'Updated' } });
    await adapter.client.subTeam.delete({ where: { id: 'second' } });
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(2);
    expect(await pg.subTeam.count()).toBe(1);
    expect((await pg.subTeam.findUnique({ where: { id: 'team' } })).name).toBe('Updated');
    expect((await adapter.journal.status()).checkpoint).toBe(3);
  });

  it('detects centrally edited data without overwriting it and recovers after reconciliation', async () => {
    await pg.subTeam.create({ data: { id: 'team', name: 'Original' } });
    await open();
    await adapter.client.subTeam.update({ where: { id: 'team' }, data: { name: 'Local edit' } });
    const operation = await adapter.journal.next();
    await pg.subTeam.update({ where: { id: 'team' }, data: { name: 'Central edit' } });
    expect((await new SyncRunner(adapter.journal, target).run()).blocked).toBe(true);
    expect((await pg.subTeam.findUnique({ where: { id: 'team' } })).name).toBe('Central edit');
    expect((await adapter.journal.status()).conflicts).toBe(1);
    // Explicit, isolated test reconciliation. Production conflicts need domain review.
    await pg.subTeam.update({ where: { id: 'team' }, data: { name: 'Original' } });
    await adapter.journal.retry(operation.operationId);
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
  });

  it('rolls back a whole remote transaction if a later unique constraint conflicts', async () => {
    await open();
    await adapter.client.$transaction(async tx => {
      await tx.subTeam.create({ data: { id: 'first', name: 'Unique first' } });
      await tx.subTeam.create({ data: { id: 'second', name: 'Collision' } });
    });
    await pg.subTeam.create({ data: { id: 'remote', name: 'Collision' } });
    expect((await new SyncRunner(adapter.journal, target).run()).blocked).toBe(true);
    expect(await pg.subTeam.findUnique({ where: { id: 'first' } })).toBeNull();
    expect(await pg.subTeam.count()).toBe(1);
    const receipts = await pg.$queryRawUnsafe<any[]>('SELECT count(*)::int AS total FROM _sqlite_sync_receipts');
    expect(receipts[0].total).toBe(0);
  });

  it('preserves related records and cascading deletes across both databases', async () => {
    await open();
    await adapter.client.user.create({ data: { id: 'cascade-user', email: 'cascade@example.test', passwordHash: 'synthetic-only', role: 'MEMBER',
      member: { create: { id: 'cascade-member', memberCode: 'CASCADE', firstName: 'Cascade', lastName: 'Test', phoneNumber: '0000000000',
        notifications: { create: { type: 'SYSTEM_ANNOUNCEMENT', title: 'Fixture', body: 'Fixture', data: { nested: true } } } } } } });
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
    expect(await pg.memberNotification.count()).toBe(1);
    await adapter.client.user.delete({ where: { id: 'cascade-user' } });
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
    expect(await pg.user.count()).toBe(0);
    // The existing schema intentionally preserves member records on user deletion.
    expect((await pg.member.findUnique({ where: { id: 'cascade-member' } })).userId).toBeNull();
    await adapter.client.member.delete({ where: { id: 'cascade-member' } });
    expect((await new SyncRunner(adapter.journal, target).run()).applied).toBe(1);
    expect(await pg.member.count()).toBe(0);
    expect(await pg.memberNotification.count()).toBe(0);
  });
});
