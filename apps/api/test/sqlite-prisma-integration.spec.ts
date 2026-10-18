import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { SqlitePrismaAdapter } from '../src/database-sync/sqlite-prisma-adapter';

describe('real SQLite Prisma application database', () => {
  let directory: string;
  let adapter: SqlitePrismaAdapter;
  let db: any;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tfhc-prisma-sqlite-'));
    const file = join(directory, 'operational.db');
    const result = await bootstrapSqlite(file);
    expect(result.tableCount).toBe(Prisma.dmmf.datamodel.models.length);
    adapter = new SqlitePrismaAdapter(file);
    await adapter.connect();
    db = adapter.client;
  }, 30000);
  afterEach(async () => { await adapter?.disconnect(); rmSync(directory, { recursive: true, force: true }); });

  it('creates related application records and captures the whole transaction', async () => {
    const inspection = new (require('node:sqlite').DatabaseSync)(adapter.path, { readOnly: true });
    try { expect(inspection.prepare('PRAGMA journal_mode').get().journal_mode).toBe('delete'); }
    finally { inspection.close(); }
    await db.$transaction(async tx => {
      await tx.subTeam.create({ data: { id: 'team', name: 'Test team' } });
      await tx.user.create({ data: { id: 'user', email: 'isolated@example.test', passwordHash: 'synthetic-test-only', role: 'ADMIN' } });
    });
    expect(await db.subTeam.count()).toBe(1);
    expect(await db.user.count()).toBe(1);
    const operation = await adapter.journal.next();
    expect(operation.changes.map(change => change.table)).toEqual(['sub_teams', 'users']);
    expect(operation.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rolls back all writes and journal entries on a foreign-key failure', async () => {
    await expect(db.$transaction(async tx => {
      await tx.subTeam.create({ data: { name: 'Rolled back' } });
      await tx.auditLog.create({ data: { actorUserId: 'missing', action: 'TEST', entity: 'Test', entityId: 'missing' } });
    })).rejects.toThrow();
    expect(await db.subTeam.count()).toBe(0);
    expect((await adapter.journal.status()).pending).toBe(0);
  });

  it('supports array transactions, callbacks, and duplicate-safe createMany', async () => {
    await db.$transaction([
      db.subTeam.create({ data: { name: 'One' } }), db.subTeam.create({ data: { name: 'Two' } }),
    ]);
    expect((await adapter.journal.next()).changes).toHaveLength(2);
    expect(await db.subTeam.createMany({ data: [{ name: 'One' }, { name: 'Three' }], skipDuplicates: true })).toEqual({ count: 1 });
    expect(await db.subTeam.count()).toBe(3);
  });

  it('preserves JSON objects, JSON null, SQL null, and relational includes', async () => {
    await db.user.create({ data: { id: 'user', email: 'json@example.test', passwordHash: 'synthetic-test-only', role: 'ADMIN' } });
    const record = await db.auditLog.create({ data: { actorUserId: 'user', action: 'TEST', entity: 'Test', entityId: 'id', previousData: Prisma.DbNull,
      newData: { imported: true, nested: { items: [1, 'two'] } } }, include: { actorUser: true } });
    expect(record.newData).toEqual({ imported: true, nested: { items: [1, 'two'] } });
    expect(record.previousData).toBeNull();
    expect(record.actorUser.email).toBe('json@example.test');
    await db.auditLog.update({ where: { id: record.id }, data: { newData: Prisma.JsonNull } });
    expect((await db.auditLog.findUnique({ where: { id: record.id } })).newData).toBeNull();
  });

  it('keeps exact case-insensitive and Unicode searches and JSON path filtering', async () => {
    await db.subTeam.createMany({ data: [{ name: 'ÉQUIPE' }, { name: 'Une Équipe' }, { name: 'Other' }] });
    expect(await db.subTeam.count({ where: { name: { equals: 'équipe', mode: 'insensitive' } } })).toBe(1);
    expect(await db.subTeam.count({ where: { name: { contains: 'équipe', mode: 'insensitive' } } })).toBe(2);
    await db.user.create({ data: { id: 'user', email: 'filter@example.test', passwordHash: 'synthetic-test-only', role: 'ADMIN' } });
    await db.auditLog.create({ data: { actorUserId: 'user', action: 'TEST', entity: 'Test', entityId: 'id', newData: { imported: true } } });
    expect(await db.auditLog.count({ where: { newData: { path: ['imported'], equals: true } } })).toBe(1);
  });

  it('adapts PostgreSQL row locks and aggregates while maintaining transaction scope', async () => {
    await db.subTeam.create({ data: { id: 'locked', name: 'Lock' } });
    await db.$transaction(async tx => {
      expect(await tx.$queryRaw`SELECT id FROM sub_teams WHERE id = ${'locked'} FOR UPDATE`).toEqual([{ id: 'locked' }]);
      // Outer service references inside callbacks must use the same transaction too.
      await db.subTeam.update({ where: { id: 'locked' }, data: { name: 'Updated' } });
    });
    expect(await db.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS total FROM sub_teams`)).toEqual([{ total: 1 }]);
  });

  it('enforces enum validation and preserves pending writes across adapter restarts', async () => {
    await expect(db.user.create({ data: { email: 'invalid@example.test', role: 'INVALID' } })).rejects.toThrow('INVALID_ENUM_VALUE');
    await db.subTeam.create({ data: { name: 'Persistent' } });
    const first = await adapter.journal.next();
    const path = adapter.path;
    await adapter.disconnect();
    adapter = new SqlitePrismaAdapter(path);
    await adapter.connect();
    db = adapter.client;
    expect(await db.subTeam.count()).toBe(1);
    expect((await adapter.journal.next()).operationId).toBe(first.operationId);
  });
});
