import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { SqlitePrismaAdapter } from '../src/database-sync/sqlite-prisma-adapter';
import { SyncRunner } from '../src/database-sync/sync-runner';

// Synthetic local contention test; deliberately makes no production connections.
describe('SQLite concurrent application writes during replay', () => {
  it('preserves every related transaction through replay and restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tfhc-contention-'));
    const file = join(directory, 'operational.db');
    let adapter: SqlitePrismaAdapter | undefined;
    try {
      await bootstrapSqlite(file);
      adapter = new SqlitePrismaAdapter(file);
      await adapter.connect();
      const db = adapter.client;
      const receipts = new Map<string, string>();
      const runner = new SyncRunner(adapter.journal, { apply: async operation => {
        const previous = receipts.get(operation.operationId);
        if (previous) expect(previous).toBe(operation.digest);
        expect(operation.changes).toHaveLength(2);
        expect(operation.changes[1].after!.actorUserId).toBe(operation.changes[0].after!.id);
        receipts.set(operation.operationId, operation.digest);
        await new Promise(resolve => setTimeout(resolve, 1));
      } });
      const latencies: number[] = [];
      for (let batch = 0; batch < 8; batch++) {
        const writes = Array.from({ length: 32 }, (_, offset) => {
          const id = `synthetic-${batch * 32 + offset}`;
          const start = performance.now();
          return db.$transaction(async tx => {
            await tx.user.create({ data: { id, email: `${id}@example.test`, passwordHash: 'synthetic', role: 'ADMIN' } });
            await tx.auditLog.create({ data: { actorUserId: id, action: 'CONTENTION_TEST', entity: 'User', entityId: id } });
          }).then(() => { latencies.push(performance.now() - start); });
        });
        await Promise.all([...writes, runner.run(32, 10000)]);
      }
      expect(await db.user.count()).toBe(256);
      expect(await db.auditLog.count()).toBe(256);
      await adapter.disconnect();
      adapter = new SqlitePrismaAdapter(file);
      await adapter.connect();
      const resumed = new SyncRunner(adapter.journal, { apply: async operation => {
        expect(receipts.has(operation.operationId)).toBe(false);
        receipts.set(operation.operationId, operation.digest);
      } });
      await resumed.run(256, 30000);
      expect(receipts.size).toBe(256);
      expect(await adapter.journal.status()).toMatchObject({ pending: 0, conflicts: 0, checkpoint: 256 });
      expect(await adapter.client.auditLog.count({ where: { actorUser: { email: { endsWith: '@example.test' } } } })).toBe(256);
      latencies.sort((a, b) => a - b);
      console.info(JSON.stringify({ scenario: 'local-synthetic-32-concurrent', writes: 256,
        p50Ms: Math.round(latencies[127]), p95Ms: Math.round(latencies[243]), p99Ms: Math.round(latencies[253]) }));
    } finally {
      await adapter?.disconnect();
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 120000);
});
