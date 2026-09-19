import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChatBufferRepository } from '../src/modules/chat/chat-buffer.repository';

describe('ChatBufferRepository (SQLite Realtime Buffer with WAL Mode)', () => {
  let repo: ChatBufferRepository;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(
      process.cwd(),
      `test-data/chat_buf_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CHAT_BUFFER_DB_PATH') return testDbPath;
        return null;
      }),
    } as unknown as ConfigService;

    repo = new ChatBufferRepository(mockConfig);
    repo.initDatabase(testDbPath);
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

  test('saves and retrieves messages from SQLite realtime buffer', () => {
    const msgId = 'msg-101';
    const saved = repo.saveMessage({
      id: msgId,
      clientOperationId: 'client-op-1',
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Hello SQLite Buffer',
      createdAt: new Date().toISOString(),
    });

    expect(saved.id).toBe(msgId);
    expect(saved.body).toBe('Hello SQLite Buffer');
    expect(saved.syncStatus).toBe('PENDING');

    const fetched = repo.findById(msgId);
    expect(fetched).not.toBeNull();
    expect(fetched?.body).toBe('Hello SQLite Buffer');
  });

  test('enforces clientOperationId idempotency', () => {
    const opId = 'client-op-unique-123';
    const first = repo.saveMessage({
      id: 'msg-first',
      clientOperationId: opId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'First submission',
      createdAt: new Date().toISOString(),
    });

    const second = repo.saveMessage({
      id: 'msg-second-different-id',
      clientOperationId: opId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Second retry submission',
      createdAt: new Date().toISOString(),
    });

    expect(second.id).toBe(first.id);
    expect(second.body).toBe('First submission');
  });

  test('handles status transitions: PENDING -> PROCESSING -> MIGRATED / FAILED', () => {
    const msgId = 'msg-trans-1';
    repo.saveMessage({
      id: msgId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Transition test',
      createdAt: new Date().toISOString(),
    });

    const pending = repo.getPendingBatch(10);
    expect(pending.some((m) => m.id === msgId)).toBe(true);

    repo.markProcessing(msgId);
    expect(repo.findById(msgId)?.syncStatus).toBe('PROCESSING');

    // Startup recovery restores PROCESSING to PENDING
    const restored = repo.resetProcessingToPending();
    expect(restored).toBeGreaterThanOrEqual(1);
    expect(repo.findById(msgId)?.syncStatus).toBe('PENDING');

    // Mark migrated
    const migratedAt = new Date().toISOString();
    repo.markMigrated(msgId, migratedAt);
    const migrated = repo.findById(msgId);
    expect(migrated?.syncStatus).toBe('MIGRATED');
    expect(migrated?.migratedAt).toBe(migratedAt);
  });

  test('updates and soft deletes messages in SQLite buffer', () => {
    const msgId = 'msg-edit-1';
    repo.saveMessage({
      id: msgId,
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Original text',
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    repo.updateMessage(msgId, 'Edited text', now);
    expect(repo.findById(msgId)?.body).toBe('Edited text');
    expect(repo.findById(msgId)?.editedAt).toBe(now);

    repo.deleteMessage(msgId, now);
    expect(repo.findById(msgId)?.deletedAt).toBe(now);
    expect(repo.findById(msgId)?.body).toBeNull();
  });

  test('seeds legacy messages from primary database idempotently', () => {
    const legacyMsgs = [
      {
        id: 'legacy-1',
        clientOperationId: 'legacy-op-1',
        roomId: 'room-1',
        senderMemberId: 'member-1',
        type: 'TEXT',
        body: 'Legacy message 1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'legacy-2',
        clientOperationId: 'legacy-op-2',
        roomId: 'room-1',
        senderMemberId: 'member-2',
        type: 'TEXT',
        body: 'Legacy message 2',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ];

    const result1 = repo.seedLegacyMessages(legacyMsgs);
    expect(result1.inserted).toBe(2);
    expect(result1.skipped).toBe(0);
    expect(repo.countAll()).toBe(2);

    // Running seed a second time should be idempotent (0 duplicates inserted)
    const result2 = repo.seedLegacyMessages(legacyMsgs);
    expect(result2.inserted).toBe(0);
    expect(result2.skipped).toBe(2);
    expect(repo.countAll()).toBe(2);

    const roomCounts = repo.getRoomMessageCounts();
    expect(roomCounts.get('room-1')).toBe(2);
  });

  test('returns buffer statistics and file size', () => {
    repo.saveMessage({
      id: 'stat-1',
      roomId: 'room-1',
      senderMemberId: 'member-1',
      type: 'TEXT',
      body: 'Stat message',
      createdAt: new Date().toISOString(),
    });

    const stats = repo.getStats();
    expect(stats.totalBuffered).toBeGreaterThanOrEqual(1);
    expect(stats.pendingCount).toBeGreaterThanOrEqual(1);
    expect(stats.dbSizeBytes).toBeGreaterThan(0);
  });
});
