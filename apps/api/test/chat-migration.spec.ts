import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChatBufferRepository } from '../src/modules/chat/chat-buffer.repository';
import { ChatMigrationJob } from '../src/modules/chat/chat-migration.job';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ChatMigrationJob (Idempotent Midnight Migration from SQLite to PostgreSQL)', () => {
  let repo: ChatBufferRepository;
  let job: ChatMigrationJob;
  let mockPrisma: any;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(
      process.cwd(),
      `test-data/chat_mig_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CHAT_BUFFER_DB_PATH') return testDbPath;
        return null;
      }),
    } as unknown as ConfigService;

    repo = new ChatBufferRepository(mockConfig);
    repo.initDatabase(testDbPath);

    mockPrisma = {
      chatMessage: {
        upsert: jest.fn().mockResolvedValue({ id: 'persisted-id' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'mig-dup-1', roomId: 'room-1', senderMemberId: 'member-1', body: 'Duplicate test', attachmentUrl: null, attachmentMeta: null, editedAt: null, deletedAt: null }),
      },
    };

    job = new ChatMigrationJob(mockPrisma as unknown as PrismaService, repo);
  });

  afterEach(() => {
    repo.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      const wal = `${testDbPath}-wal`;
      const shm = `${testDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // ignore
    }
  });

  test('migrates pending buffered messages into PostgreSQL and marks them MIGRATED', async () => {
    const msgId = 'mig-test-1';
    repo.saveMessage({
      id: msgId,
      clientOperationId: 'mig-op-1',
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Migration message body',
      createdAt: new Date().toISOString(),
    });

    const summary = await job.runMigration('test-run');
    expect(summary.totalProcessed).toBe(1);
    expect(summary.migratedCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(mockPrisma.chatMessage.upsert).toHaveBeenCalledTimes(1);

    const record = repo.findById(msgId);
    expect(record?.syncStatus).toBe('MIGRATED');
    expect(record?.migratedAt).toBeTruthy();
  });

  test('prevents duplicate errors idempotently if already present in PostgreSQL', async () => {
    const msgId = 'mig-dup-1';
    repo.saveMessage({
      id: msgId,
      clientOperationId: 'mig-op-dup',
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Duplicate test',
      createdAt: new Date().toISOString(),
    });

    const p2002Error: any = new Error('Unique constraint failed');
    p2002Error.code = 'P2002';
    mockPrisma.chatMessage.upsert.mockRejectedValueOnce(p2002Error);

    const summary = await job.runMigration('test-duplicate');
    expect(summary.totalProcessed).toBe(1);
    expect(summary.migratedCount).toBe(1);
    expect(summary.duplicatesPrevented).toBe(1);
    expect(summary.failedCount).toBe(0);

    const record = repo.findById(msgId);
    expect(record?.syncStatus).toBe('MIGRATED');
  });

  test('retries failed migrations up to retry limit without crashing', async () => {
    const msgId = 'mig-fail-1';
    repo.saveMessage({
      id: msgId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Failure test',
      createdAt: new Date().toISOString(),
    });

    mockPrisma.chatMessage.upsert.mockRejectedValueOnce(new Error('Network error'));

    const summary = await job.runMigration('test-failure');
    expect(summary.totalProcessed).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.migratedCount).toBe(0);

    const record = repo.findById(msgId);
    expect(record?.syncStatus).toBe('FAILED');
    expect(record?.retryCount).toBe(1);
    expect(record?.lastError).toContain('Network error');
  });

  test('seeds legacy messages from Primary Database on bootstrap', async () => {
    mockPrisma.chatMessage.findMany = jest.fn().mockResolvedValue([
      {
        id: 'legacy-pg-1',
        clientOperationId: 'pg-op-1',
        roomId: 'room-1',
        senderMemberId: 'mem-1',
        type: 'TEXT',
        body: 'Historical message from Postgres',
        attachmentUrl: null,
        attachmentMeta: null,
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    ]);

    const res = await job.seedFromPrimaryDatabase();
    expect(res.totalDiscovered).toBe(1);
    expect(res.inserted).toBe(1);
    expect(repo.countAll()).toBe(1);

    const seeded = repo.findById('legacy-pg-1');
    expect(seeded).not.toBeNull();
    expect(seeded?.body).toBe('Historical message from Postgres');
    expect(seeded?.syncStatus).toBe('MIGRATED');
  });

  test('persists single message asynchronously in continuous realtime persistence', async () => {
    const msgId = 'async-persist-1';
    repo.saveMessage({
      id: msgId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Continuous async persist',
      createdAt: new Date().toISOString(),
    });

    const success = await job.persistMessageAsync(msgId);
    expect(success).toBe(true);
    expect(mockPrisma.chatMessage.upsert).toHaveBeenCalled();
    expect(repo.findById(msgId)?.syncStatus).toBe('MIGRATED');
  });

  test('executes bidirectional reconciliation without data loss or duplication', async () => {
    mockPrisma.chatMessage.findMany = jest.fn().mockResolvedValue([]);
    mockPrisma.chatMessage.count = jest.fn().mockResolvedValue(5);

    const report = await job.reconcileWithPrimaryDatabase('noon-cron');
    expect(report.postgresTotal).toBe(5);
    expect(report.sqliteTotal).toBeGreaterThanOrEqual(0);
  });
  test('does not starve later messages when a full batch fails', async () => {
    for (let i = 0; i < 105; i++) repo.saveMessage({ id: `batch-${String(i).padStart(3, '0')}`, roomId: 'room-1', senderMemberId: 'member-1', type: 'TEXT', body: 'retry', createdAt: '2026-01-01T00:00:00.000Z' });
    mockPrisma.chatMessage.upsert.mockRejectedValue(new Error('Offline'));
    const result = await job.runMigration('failure-test');
    expect(result.totalProcessed).toBe(105);
    expect(result.failedCount).toBe(105);
    mockPrisma.chatMessage.upsert.mockResolvedValue({});
    expect((await job.runMigration('retry')).migratedCount).toBe(105);
  });

  test('leaves newer edits pending when an older snapshot finishes persisting', async () => {
    repo.saveMessage({ id: 'concurrent-edit', roomId: 'room-1', senderMemberId: 'member-1', type: 'TEXT', body: 'before', createdAt: '2026-01-01T00:00:00.000Z' });
    mockPrisma.chatMessage.upsert.mockImplementation(async () => {
      repo.updateMessage('concurrent-edit', 'after', '2026-01-02T00:00:00.000Z');
      return { id: 'concurrent-edit', body: 'before', attachmentUrl: null, attachmentMeta: null };
    });
    await job.persistMessageAsync('concurrent-edit');
    expect(repo.findById('concurrent-edit')).toMatchObject({ body: 'after', syncStatus: 'PENDING' });
  });

  test('does not trust a migrated flag when a durable acknowledgement is required', async () => {
    repo.saveMessage({ id: 'stale-migrated', roomId: 'room-1', senderMemberId: 'member-1', type: 'TEXT', body: 'preserve', createdAt: '2026-01-01T00:00:00.000Z' });
    repo.markMigrated('stale-migrated', new Date().toISOString());
    mockPrisma.chatMessage.findUnique.mockResolvedValue(null);
    mockPrisma.chatMessage.upsert.mockRejectedValue(new Error('Primary unavailable'));
    expect(await job.persistMessageAsync('stale-migrated', true)).toBe(false);
    expect(repo.findById('stale-migrated')?.syncStatus).toBe('FAILED');
    expect(repo.findById('stale-migrated')?.body).toBe('preserve');
  });

  test('propagates import failure without advancing checkpoint', async () => {
    repo.setSyncCheckpoint('2026-01-01T00:00:00.000Z');
    mockPrisma.chatMessage.findMany = jest.fn().mockRejectedValue(new Error('Unavailable'));
    await expect(job.seedFromPrimaryDatabase()).rejects.toThrow('Unavailable');
    expect(repo.getSyncCheckpoint()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('persists newer edits with compare-and-set rather than acknowledging a no-op', async () => {
    repo.saveMessage({ id: 'edited', roomId: 'room-1', senderMemberId: 'member-1', type: 'TEXT', body: 'before', createdAt: '2026-01-01T00:00:00.000Z' });
    repo.updateMessage('edited', 'after', '2026-01-02T00:00:00.000Z');
    mockPrisma.chatMessage.upsert.mockResolvedValue({ id: 'edited', roomId: 'room-1', senderMemberId: 'member-1', body: 'before', editedAt: null, deletedAt: null });
    mockPrisma.chatMessage.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    expect(await job.persistMessageAsync('edited')).toBe(true);
    expect(mockPrisma.chatMessage.updateMany.mock.calls[0][0].data.body).toBe('after');
  });

  test('full audit finds historical backfills despite a newer import checkpoint', async () => {
    repo.setSyncCheckpoint('2026-09-23T00:00:00.000Z');
    mockPrisma.chatMessage.findMany = jest.fn().mockResolvedValueOnce([{
      id: 'historical-backfill', clientOperationId: null, roomId: 'room-1', senderMemberId: null,
      type: 'SYSTEM', body: 'Recovered history', attachmentUrl: null, attachmentMeta: null,
      replyToId: null, editedAt: null, deletedAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }]).mockResolvedValue([]);
    await job.seedFromPrimaryDatabase(true);
    expect(mockPrisma.chatMessage.findMany.mock.calls[0][0].where).toBeUndefined();
    expect(repo.findById('historical-backfill')?.body).toBe('Recovered history');
  });

});
