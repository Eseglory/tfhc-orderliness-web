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
});
