import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { SqlitePrismaAdapter } from '../src/database-sync/sqlite-prisma-adapter';
import { RecoveryJournal } from '../src/database-sync/recovery-journal';

describe('write protection failure and restart recovery (temporary SQLite only)', () => {
  it('withholds success during an outage, preserves the write, and deduplicates retries after restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tfhc-protection-test-'));
    const file = join(directory, 'test.db');
    let adapter: SqlitePrismaAdapter | undefined;
    try {
      await bootstrapSqlite(file);
      adapter = new SqlitePrismaAdapter(file);
      await adapter.connect();
      const unavailable = { $transaction: jest.fn().mockRejectedValue(new Error('simulated connection failure')) };
      const protection = new RecoveryJournal(unavailable as any, adapter.sourceId, adapter.journal);
      adapter.protectWrites = () => protection.protectPending();
      const write = jest.fn(async () => adapter!.client.subTeam.create({ data: { name: 'Preserved write' } }));
      await expect(adapter.request(write, 'stable-request-key', 'same-payload')).rejects.toMatchObject({ status: 503 });
      expect(await adapter.client.subTeam.count()).toBe(1);
      expect(await adapter.journal.status()).toMatchObject({ pending: 1, unprotected: 1 });
      await adapter.disconnect();
      adapter = new SqlitePrismaAdapter(file);
      await adapter.connect();
      const pending = await adapter.journal.unprotected();
      expect(pending).toHaveLength(1);
      // A fake remote receipt avoids any production or network access.
      const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ digest: pending[0].digest, sequence: pending[0].sequence }]) };
      const restored = new RecoveryJournal({ $transaction: async (work: any) => work(tx) } as any, adapter.sourceId, adapter.journal);
      adapter.protectWrites = () => restored.protectPending();
      const result: any = await adapter.request(write, 'stable-request-key', 'same-payload');
      expect(result.name).toBe('Preserved write');
      expect(write).toHaveBeenCalledTimes(1);
      expect(await adapter.client.subTeam.count()).toBe(1);
      expect(await adapter.journal.status()).toMatchObject({ pending: 1, unprotected: 0 });
      await expect(adapter.request(write, 'stable-request-key', 'different-payload')).rejects.toMatchObject({ status: 409 });
      expect(await adapter.client.subTeam.count()).toBe(1);
    } finally {
      await adapter?.disconnect();
      const target = resolve(directory);
      if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).pop()!.startsWith('tfhc-protection-test-')) {
        throw new Error('UNSAFE_TEST_CLEANUP_PATH');
      }
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      expect(existsSync(target)).toBe(false);
    }
  }, 30000);
});
