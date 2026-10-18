import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PostgresDestination } from '../src/database-sync/postgres-destination';
import { RowChange, SyncConflict, SyncOperation } from '../src/database-sync/sync.types';

/** Contract tests. Real PostgreSQL integration remains a separate required gate. */
describe('PostgreSQL replication transaction contract', () => {
  const row = { id: 'team-1', name: 'Team', description: null, isSystem: 0, active: 1 };
  const remote = { ...row, isSystem: false, active: true };
  const operation = (changes: RowChange[]): SyncOperation => ({
    operationId: randomUUID(), sequence: 1, attempts: 0, changes,
    digest: createHash('sha256').update(JSON.stringify(changes)).digest('hex'),
  });
  let tx: any;
  let client: any;
  let target: PostgresDestination;
  beforeEach(() => {
    tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ checkpoint: 0n }]).mockResolvedValueOnce([]).mockResolvedValue([]) };
    client = { $transaction: jest.fn(async callback => callback(tx)) };
    target = new PostgresDestination(client as PrismaClient, 'test-source-authority');
  });
  const executed = () => tx.$executeRawUnsafe.mock.calls.map(call => call[0]).join('\n');

  it('inserts a model row, receipt, and checkpoint in the same serializable transaction', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([]);
    await target.apply(operation([{ table: 'sub_teams', before: null, after: row }]));
    expect(executed()).toContain('INSERT INTO public."sub_teams"');
    expect(executed()).toContain('INSERT INTO public._sqlite_sync_receipts');
    expect(client.$transaction.mock.calls[0][1].isolationLevel).toBe('Serializable');
  });

  it('uses a matching receipt to prevent re-applying a committed operation', async () => {
    const op = operation([{ table: 'sub_teams', before: null, after: row }]);
    tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce([{ checkpoint: 1n }])
      .mockResolvedValueOnce([{ digest: op.digest, sequence: 1n }]);
    await target.apply(op);
    expect(executed()).not.toContain('INSERT INTO public."sub_teams"');
  });

  it('detects destination edits without overwriting or writing a receipt', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: { ...remote, name: 'Changed centrally' } }]);
    await expect(target.apply(operation([{ table: 'sub_teams', before: row, after: { ...row, name: 'Changed locally' } }])))
      .rejects.toBeInstanceOf(SyncConflict);
    expect(executed()).not.toContain('UPDATE public."sub_teams"');
    expect(executed()).not.toContain('INSERT INTO public._sqlite_sync_receipts');
  });

  it('deletes only when the existing row matches its before image', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: remote }]);
    await target.apply(operation([{ table: 'sub_teams', before: row, after: null }]));
    expect(executed()).toContain('DELETE FROM public."sub_teams"');
    expect(tx.$queryRawUnsafe.mock.calls[2][0]).toContain('FOR UPDATE OF t');
  });

  it('updates matched rows using bound values', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: remote }]);
    await target.apply(operation([{ table: 'sub_teams', before: row, after: { ...row, name: "name ' with quotes" } }]));
    const update = tx.$executeRawUnsafe.mock.calls.find(call => call[0].startsWith('UPDATE public."sub_teams"'));
    expect(update[0]).not.toContain("name ' with quotes");
    expect(JSON.parse(update[1]).name).toBe("name ' with quotes");
  });

  it('blocks parent deletion if PostgreSQL has a child absent from the local cascade', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: remote }]).mockResolvedValueOnce([{ exists: 1 }]);
    await expect(target.apply(operation([{ table: 'sub_teams', before: row, after: null }]))).rejects.toBeInstanceOf(SyncConflict);
    expect(executed()).not.toContain('DELETE FROM public."sub_teams"');
    expect(executed()).not.toContain('INSERT INTO public._sqlite_sync_receipts');
  });

  it('rejects sequence gaps, tampered payloads, non-model tables, and missing fields', async () => {
    const op = operation([{ table: 'sub_teams', before: null, after: row }]);
    await expect(target.apply({ ...op, sequence: 3 })).rejects.toBeInstanceOf(SyncConflict);
    await expect(target.apply({ ...op, digest: 'incorrect' })).rejects.toBeInstanceOf(SyncConflict);
    tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce([{ checkpoint: 0n }]).mockResolvedValueOnce([]);
    await expect(target.apply(operation([{ table: 'untrusted', before: null, after: row }]))).rejects.toBeInstanceOf(SyncConflict);
    tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce([{ checkpoint: 0n }]).mockResolvedValueOnce([]);
    await expect(target.apply(operation([{ table: 'sub_teams', before: null, after: { id: 'incomplete' } }]))).rejects.toBeInstanceOf(SyncConflict);
  });

  it('does not record success when PostgreSQL is unavailable', async () => {
    client.$transaction.mockRejectedValue(new Error('unavailable'));
    await expect(target.apply(operation([{ table: 'sub_teams', before: null, after: row }]))).rejects.toThrow('unavailable');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  const audit = { id: 'audit', actorUserId: 'actor', action: 'TEST', entity: 'fixture', entityId: 'fixture',
    previousData: null, newData: null, reason: null, createdAt: '2026-10-12T01:00:00.000Z' };

  it('preserves local JSON literal null separately from SQL NULL', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([]);
    await target.apply(operation([{ table: 'audit_logs', before: null, after: { ...audit, newData: 'null' } }]));
    const insert = tx.$executeRawUnsafe.mock.calls.find(call => call[0].startsWith('INSERT INTO public."audit_logs"'));
    expect(insert[0]).toContain("'null'::jsonb");
    expect(JSON.parse(insert[2])).toContain('newData');
  });

  it('detects remote JSON literal null as distinct from a local SQL NULL', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: audit, _json_null_0: false, _json_null_1: true }]);
    await expect(target.apply(operation([{ table: 'audit_logs', before: audit, after: { ...audit, newData: '{"value":1}' } }])))
      .rejects.toBeInstanceOf(SyncConflict);
    expect(executed()).not.toContain('UPDATE public."audit_logs"');
  });

  it('normalizes unzoned PostgreSQL timestamps as UTC and preserves JSON objects', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ row: { ...audit, createdAt: '2026-10-12T01:00:00' }, _json_null_0: true, _json_null_1: true }]);
    await target.apply(operation([{ table: 'audit_logs', before: audit, after: { ...audit, newData: '{"value":1}' } }]));
    const update = tx.$executeRawUnsafe.mock.calls.find(call => call[0].startsWith('UPDATE public."audit_logs"'));
    expect(JSON.parse(update[1]).newData).toEqual({ value: 1 });
  });
});
