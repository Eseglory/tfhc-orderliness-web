import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChatBufferRepository } from '../src/modules/chat/chat-buffer.repository';

describe('Shared SQLite Database Concurrency (Localhost & Production Multi-Instance)', () => {
  let sharedDbPath: string;
  let localhostInstance: ChatBufferRepository;
  let productionInstance: ChatBufferRepository;

  beforeEach(() => {
    // Both instances point to the exact same database file on disk
    sharedDbPath = path.join(
      process.cwd(),
      `test-data/chat_shared_concurrency_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CHAT_SHARED_DB_PATH' || key === 'CHAT_BUFFER_DB_PATH') {
          return sharedDbPath;
        }
        return null;
      }),
    } as unknown as ConfigService;

    localhostInstance = new ChatBufferRepository(mockConfig);
    localhostInstance.initDatabase(sharedDbPath);

    productionInstance = new ChatBufferRepository(mockConfig);
    productionInstance.initDatabase(sharedDbPath);
  });

  afterEach(() => {
    localhostInstance.close();
    productionInstance.close();
    try {
      if (fs.existsSync(sharedDbPath)) fs.unlinkSync(sharedDbPath);
      const wal = `${sharedDbPath}-wal`;
      const shm = `${sharedDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // ignore
    }
  });

  test('message posted from Localhost instance is immediately readable by Production instance', () => {
    const msgId = 'msg-from-local-1';
    localhostInstance.saveMessage({
      id: msgId,
      clientOperationId: 'client-op-local',
      roomId: 'shared-room-1',
      senderMemberId: 'member-local',
      type: 'TEXT',
      body: 'Hello from Localhost to Production!',
      createdAt: new Date().toISOString(),
    });

    // Production instance queries the shared SQLite DB directly
    const fetchedByProd = productionInstance.findById(msgId);
    expect(fetchedByProd).not.toBeNull();
    expect(fetchedByProd?.id).toBe(msgId);
    expect(fetchedByProd?.body).toBe('Hello from Localhost to Production!');
    expect(fetchedByProd?.roomId).toBe('shared-room-1');
  });

  test('message posted from Production instance is immediately readable and editable by Localhost instance', () => {
    const msgId = 'msg-from-prod-1';
    productionInstance.saveMessage({
      id: msgId,
      clientOperationId: 'client-op-prod',
      roomId: 'shared-room-1',
      senderMemberId: 'member-prod',
      type: 'TEXT',
      body: 'Message created in Production',
      createdAt: new Date().toISOString(),
    });

    // Localhost updates the message in the shared SQLite database
    const editedTime = new Date().toISOString();
    const updated = localhostInstance.updateMessage(msgId, 'Edited in Localhost', editedTime);
    expect(updated).toBe(true);

    // Production reads back the updated message
    const readByProd = productionInstance.findById(msgId);
    expect(readByProd?.body).toBe('Edited in Localhost');
    expect(readByProd?.editedAt).toBe(editedTime);
  });

  test('handles concurrent simultaneous writes from Localhost and Production without deadlock or data loss', () => {
    const count = 50;

    // Simulate concurrent interleaving writes
    for (let i = 0; i < count; i++) {
      localhostInstance.saveMessage({
        id: `local-concurrent-${i}`,
        clientOperationId: `op-local-${i}`,
        roomId: 'room-concurrent',
        senderMemberId: 'member-1',
        type: 'TEXT',
        body: `Localhost message ${i}`,
        createdAt: new Date(Date.now() + i).toISOString(),
      });

      productionInstance.saveMessage({
        id: `prod-concurrent-${i}`,
        clientOperationId: `op-prod-${i}`,
        roomId: 'room-concurrent',
        senderMemberId: 'member-2',
        type: 'TEXT',
        body: `Production message ${i}`,
        createdAt: new Date(Date.now() + i + 1000).toISOString(),
      });
    }

    // Both instances see all 100 messages in the shared database
    expect(localhostInstance.countAll()).toBe(count * 2);
    expect(productionInstance.countAll()).toBe(count * 2);

    const allRoomMessages = productionInstance.listRecentByRoom('room-concurrent', 200);
    expect(allRoomMessages.length).toBe(count * 2);
  });

  test('legacy seeding in shared database provides instant history to both environments', () => {
    const legacyRecords = [
      {
        id: 'legacy-shared-1',
        clientOperationId: 'leg-op-1',
        roomId: 'room-legacy',
        senderMemberId: 'member-old',
        type: 'TEXT',
        body: 'Old message before refactor',
        createdAt: '2025-12-01T10:00:00.000Z',
      },
      {
        id: 'legacy-shared-2',
        clientOperationId: 'leg-op-2',
        roomId: 'room-legacy',
        senderMemberId: 'member-old',
        type: 'TEXT',
        body: 'Another old message',
        createdAt: '2025-12-01T10:05:00.000Z',
      },
    ];

    // Seed via production instance
    const seedResult = productionInstance.seedLegacyMessages(legacyRecords);
    expect(seedResult.inserted).toBe(2);

    // Localhost immediately sees the legacy history
    const roomMessages = localhostInstance.listRecentByRoom('room-legacy', 10);
    expect(roomMessages.length).toBe(2);
    expect(roomMessages.some((m) => m.id === 'legacy-shared-1')).toBe(true);
    expect(roomMessages.some((m) => m.id === 'legacy-shared-2')).toBe(true);
  });
});
