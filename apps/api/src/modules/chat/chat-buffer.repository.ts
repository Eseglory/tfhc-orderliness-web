import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Resolve from the installed application, not the shell's working directory. */
export function defaultChatDatabasePath(): string {
  let directory = __dirname;
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
      if (name === 'tfhc-orderliness-monorepo') return path.join(directory, 'data/chat_shared.db');
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Cannot locate chat data directory; configure CHAT_SHARED_DB_PATH explicitly.');
    directory = parent;
  }
}

export interface StatementSync {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

// Safely resolve node:sqlite if available in the Node.js runtime
let NodeSqliteDatabaseSync: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sqlite = require('node:sqlite');
  NodeSqliteDatabaseSync = sqlite?.DatabaseSync ?? null;
} catch {
  NodeSqliteDatabaseSync = null;
}

export interface BufferedMessageRecord {
  id: string;
  clientOperationId: string | null;
  roomId: string;
  senderMemberId: string | null;
  type: string;
  body: string | null;
  attachmentUrl: string | null;
  attachmentMeta: Record<string, unknown> | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  syncStatus: 'PENDING' | 'PROCESSING' | 'MIGRATED' | 'FAILED';
  retryCount: number;
  lastError: string | null;
  migratedAt: string | null;
}

export interface BufferStats {
  databasePath: string | null;
  totalBuffered: number;
  pendingCount: number;
  processingCount: number;
  migratedCount: number;
  failedCount: number;
  dbSizeBytes: number;
}

@Injectable()
export class ChatBufferRepository implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ChatBufferRepository.name);
  private db: DatabaseSync | null = null;
  private dbPath!: string;
  private changeEpoch?: string;
  private isFallback = false;
  private memoryStore = new Map<string, BufferedMessageRecord>();

  // Prepared statements for high performance
  private insertStmt!: StatementSync;
  private findByIdStmt!: StatementSync;
  private findByOpIdStmt!: StatementSync;
  private listByRoomStmt!: StatementSync;
  private listByRoomCursorStmt!: StatementSync;
  private searchByRoomStmt!: StatementSync;
  private countUnreadStmt!: StatementSync;
  private getLatestByRoomStmt!: StatementSync;
  private markReadInRoomStmt!: StatementSync;
  private updateBodyStmt!: StatementSync;
  private softDeleteStmt!: StatementSync;
  private memberProfiles = new Map<string, { id: string; firstName: string; lastName: string; preferredName: string | null; profilePhotoUrl: string | null }>();
  private getPendingBatchStmt!: StatementSync;
  private markProcessingBatchStmt!: StatementSync;
  private markMigratedStmt!: StatementSync;
  private markFailedStmt!: StatementSync;
  private resetProcessingStmt!: StatementSync;
  private purgeMigratedStmt!: StatementSync;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap() {
    this.initDatabase();
  }

  onApplicationShutdown() {
    this.close();
  }

  private checkpoint: string | null = null;
  getSyncCheckpoint(): string | null {
    if (!this.db) return this.checkpoint;
    this.db.exec('CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    return (this.db.prepare('SELECT value FROM chat_sync_meta WHERE key = ?').get('primary_checkpoint') as { value: string } | undefined)?.value || null;
  }
  setSyncCheckpoint(value: string) {
    if (!this.db) { this.checkpoint = value; return; }
    this.db.exec('CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.db.prepare('INSERT INTO chat_sync_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('primary_checkpoint', value);
  }

  getSyncSummary(): Record<string, unknown> | null {
    if (!this.db) return null;
    this.db.exec('CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const row = this.db.prepare('SELECT value FROM chat_sync_meta WHERE key = ?').get('last_summary') as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }
  setSyncSummary(summary: unknown) {
    if (!this.db) return;
    this.db.exec('CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.db.prepare('INSERT INTO chat_sync_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('last_summary', JSON.stringify(summary));
  }

  public initDatabase(customPath?: string) {
    if (this.db || this.isFallback) return;

    if (!NodeSqliteDatabaseSync) {
      throw new Error('Durable chat storage requires a Node runtime with node:sqlite.');
    }

    try {
      const resolvedPath =
        customPath ||
        this.config.get<string>('CHAT_SHARED_DB_PATH') ||
        this.config.get<string>('CHAT_BUFFER_DB_PATH') ||
        (process.env.NODE_ENV === 'test'
          ? path.join(process.cwd(), `test-data/chat_shared_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
          : defaultChatDatabasePath());

      this.dbPath = path.resolve(resolvedPath);
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new NodeSqliteDatabaseSync(this.dbPath);
      this.changeEpoch = undefined;

      // Configure SQLite for high concurrency across localhost & production, WAL mode, crash safety
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA busy_timeout = 10000;');
      this.db.exec('PRAGMA synchronous = FULL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA cache_size = -64000;');
      this.db.exec('PRAGMA wal_autocheckpoint = 1000;');

      this.initSchema();
      this.prepareStatements();

      // Startup recovery: any records left in 'PROCESSING' state are safely restored to 'PENDING'
      const resetCount = this.resetProcessingToPending();
      if (resetCount > 0) {
        this.logger.log(`[Startup Recovery] Restored ${resetCount} uncommitted processing messages in SQLite buffer to PENDING.`);
      }

      this.logger.log(`[Shared Realtime SQLite] Connected to shared SQLite database at: ${this.dbPath} (WAL mode, busy_timeout=10000ms)`);
    } catch (err) {
      this.db?.close();
      this.db = null;
      throw new Error(`Durable chat storage unavailable: ${(err as Error).message}`);
    }
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_message_buffer (
        id TEXT PRIMARY KEY,
        client_operation_id TEXT UNIQUE,
        room_id TEXT NOT NULL,
        sender_member_id TEXT,
        type TEXT NOT NULL DEFAULT 'TEXT',
        body TEXT,
        attachment_url TEXT,
        attachment_meta TEXT,
        reply_to_id TEXT,
        edited_at TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        migrated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_chat_buf_room_created ON chat_message_buffer(room_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_buf_sync_status ON chat_message_buffer(sync_status);
      CREATE INDEX IF NOT EXISTS idx_chat_buf_op_id ON chat_message_buffer(client_operation_id);
      CREATE INDEX IF NOT EXISTS idx_chat_buf_room_cursor ON chat_message_buffer(room_id, created_at DESC, id DESC);
      CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_notification_outbox (message_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_changes (sequence INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, message_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_chat_changes_room_sequence ON chat_changes(room_id, sequence);
      CREATE TRIGGER IF NOT EXISTS chat_message_insert_change AFTER INSERT ON chat_message_buffer
        BEGIN INSERT INTO chat_changes(room_id, message_id) VALUES (NEW.room_id, NEW.id); END;
      CREATE TRIGGER IF NOT EXISTS chat_message_update_change AFTER UPDATE OF body, edited_at, deleted_at, attachment_url, attachment_meta ON chat_message_buffer
        BEGIN INSERT INTO chat_changes(room_id, message_id) VALUES (NEW.room_id, NEW.id); END;
    `);
  }

  private prepareStatements() {
    this.insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO chat_message_buffer (
        id, client_operation_id, room_id, sender_member_id, type, body,
        attachment_url, attachment_meta, reply_to_id, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);

    this.findByIdStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer WHERE id = ?
    `);

    this.findByOpIdStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer WHERE client_operation_id = ?
    `);

    this.listByRoomStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer
      WHERE room_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `);

    this.listByRoomCursorStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer
      WHERE room_id = ? AND (created_at < (SELECT created_at FROM chat_message_buffer WHERE id = ?)
        OR (created_at = (SELECT created_at FROM chat_message_buffer WHERE id = ?) AND id < ?))
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `);

    this.searchByRoomStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer
      WHERE room_id = ? AND deleted_at IS NULL AND body LIKE ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `);

    this.countUnreadStmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM chat_message_buffer
      WHERE room_id = ? AND deleted_at IS NULL
        AND id NOT IN (SELECT value FROM json_each(?))
        AND (sender_member_id IS NULL OR sender_member_id != ?)
        AND (? IS NULL OR created_at > ?)
        AND created_at > COALESCE((SELECT MAX(sent.created_at) FROM chat_message_buffer sent WHERE sent.room_id = ? AND sent.sender_member_id = ?), '')
    `);

    this.getLatestByRoomStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer
      WHERE room_id = ? AND deleted_at IS NULL
        AND id NOT IN (SELECT value FROM json_each(?))
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    this.updateBodyStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET body = ?, edited_at = ?, sync_status = 'PENDING'
      WHERE id = ?
    `);

    this.softDeleteStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET deleted_at = ?, body = NULL, attachment_url = NULL, attachment_meta = NULL, sync_status = 'PENDING'
      WHERE id = ?
    `);

    this.getPendingBatchStmt = this.db.prepare(`
      SELECT * FROM chat_message_buffer
      WHERE (sync_status = 'PENDING' OR sync_status = 'FAILED') AND (created_at > ? OR (created_at = ? AND id > ?))
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `);

    this.markProcessingBatchStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET sync_status = 'PROCESSING'
      WHERE id = ?
    `);

    this.markMigratedStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET sync_status = 'MIGRATED', migrated_at = ?, last_error = NULL
      WHERE id = ?
    `);

    this.markFailedStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET sync_status = 'FAILED', retry_count = retry_count + 1, last_error = ?
      WHERE id = ?
    `);

    this.resetProcessingStmt = this.db.prepare(`
      UPDATE chat_message_buffer
      SET sync_status = 'PENDING'
      WHERE sync_status = 'PROCESSING'
    `);

    this.purgeMigratedStmt = this.db.prepare(`
      DELETE FROM chat_message_buffer
      WHERE sync_status = 'MIGRATED' AND migrated_at < ?
    `);
  }

  // -------------------------------------------------------------------------
  // Real-time Buffer Writes & Lookups
  // -------------------------------------------------------------------------

  public saveMessage(msg: {
    id: string;
    clientOperationId?: string | null;
    roomId: string;
    senderMemberId: string | null;
    type: string;
    body: string | null;
    attachmentUrl?: string | null;
    attachmentMeta?: Record<string, unknown> | null;
    replyToId?: string | null;
    createdAt: string;
    notificationPayload?: Record<string, unknown>;
  }): BufferedMessageRecord {
    if (!this.db) throw new Error('Durable chat storage is not initialized');
    if (this.isFallback || !this.db) {
      if (msg.clientOperationId) {
        const existing = this.findByClientOperationId(msg.clientOperationId);
        if (existing) return existing;
      }
      const existingById = this.findById(msg.id);
      if (existingById) return existingById;

      const record: BufferedMessageRecord = {
        id: msg.id,
        clientOperationId: msg.clientOperationId || null,
        roomId: msg.roomId,
        senderMemberId: msg.senderMemberId || null,
        type: msg.type || 'TEXT',
        body: msg.body || null,
        attachmentUrl: msg.attachmentUrl || null,
        attachmentMeta: msg.attachmentMeta || null,
        replyToId: msg.replyToId || null,
        editedAt: null,
        deletedAt: null,
        createdAt: msg.createdAt,
        syncStatus: 'PENDING',
        retryCount: 0,
        lastError: null,
        migratedAt: null,
      };
      this.memoryStore.set(msg.id, record);
      return record;
    }

    // Idempotency check on clientOperationId
    if (msg.clientOperationId) {
      const existing = this.findByClientOperationId(msg.clientOperationId);
      if (existing) return existing;
    }

    const existingById = this.findById(msg.id);
    if (existingById) return existingById;

    const metaStr = msg.attachmentMeta ? JSON.stringify(msg.attachmentMeta) : null;

    this.db.exec('BEGIN IMMEDIATE');
    try {
    this.insertStmt.run(
      msg.id,
      msg.clientOperationId || null,
      msg.roomId,
      msg.senderMemberId || null,
      msg.type || 'TEXT',
      msg.body || null,
      msg.attachmentUrl || null,
      metaStr,
      msg.replyToId || null,
      msg.createdAt,
    );

      const saved = msg.clientOperationId ? this.findByClientOperationId(msg.clientOperationId) : this.findById(msg.id);
      if (saved?.id === msg.id && msg.notificationPayload) {
        this.db.prepare('INSERT OR IGNORE INTO chat_notification_outbox(message_id, payload) VALUES (?, ?)')
          .run(msg.id, JSON.stringify(msg.notificationPayload));
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return (msg.clientOperationId ? this.findByClientOperationId(msg.clientOperationId) : this.findById(msg.id))!;
  }

  public changeCursor(): string {
    const epoch = this.getChangeEpoch();
    const sequence = (this.db!.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM chat_changes').get() as { cursor: number }).cursor;
    return `${epoch}:${sequence}`;
  }

  private getChangeEpoch(): string {
    if (!this.db) throw new Error('Chat storage is not initialized');
    if (!this.changeEpoch) {
      this.db.exec('CREATE TABLE IF NOT EXISTS chat_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      this.db.prepare('INSERT OR IGNORE INTO chat_sync_meta(key, value) VALUES (?, ?)').run('change_epoch', randomUUID());
      this.changeEpoch = (this.db.prepare('SELECT value FROM chat_sync_meta WHERE key = ?').get('change_epoch') as { value: string }).value;
    }
    return this.changeEpoch;
  }

  public touchMessage(roomId: string, messageId: string) {
    this.db?.prepare('INSERT INTO chat_changes(room_id, message_id) VALUES (?, ?)').run(roomId, messageId);
  }

  public changesAfter(roomId: string, cursor: string, limit = 100) {
    const parsed = /^(?:([a-f0-9-]{36}):)?(\d+)$/.exec(cursor);
    if (!parsed || !Number.isSafeInteger(Number(parsed[2]))) throw new Error('Invalid chat cursor');
    const epoch = this.getChangeEpoch();
    // Legacy cursors and cursors from an erased Render filesystem replay once.
    // The response contains the current epoch so subsequent pages advance normally.
    const after = parsed[1] === epoch ? Number(parsed[2]) : 0;
    const rows = (this.db?.prepare('SELECT sequence, message_id FROM chat_changes WHERE room_id = ? AND sequence > ? ORDER BY sequence LIMIT ?')
      .all(roomId, after, limit + 1) || []) as Array<{ sequence: number; message_id: string }>;
    const page = rows.slice(0, limit);
    return { ids: [...new Set(page.map(r => r.message_id))], nextCursor: `${epoch}:${page[page.length - 1]?.sequence ?? after}`, hasMore: rows.length > limit };
  }

  public pendingNotifications(limit = 50, afterRowId = 0): Array<{ rowId: number; messageId: string; payload: Record<string, any> }> {
    if (!this.db) return [];
    return (this.db.prepare('SELECT rowid, message_id, payload FROM chat_notification_outbox WHERE rowid > ? ORDER BY rowid LIMIT ?').all(afterRowId, limit) as Array<{ rowid: number; message_id: string; payload: string }>)
      .map(row => ({ rowId: row.rowid, messageId: row.message_id, payload: JSON.parse(row.payload) }));
  }

  public acknowledgeNotifications(messageId: string) {
    this.db?.prepare('DELETE FROM chat_notification_outbox WHERE message_id = ?').run(messageId);
  }

  public findById(id: string): BufferedMessageRecord | null {
    if (this.isFallback || !this.db) {
      return this.memoryStore.get(id) || null;
    }
    const row = this.findByIdStmt.get(id) as Record<string, any> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public findByClientOperationId(opId: string): BufferedMessageRecord | null {
    if (this.isFallback || !this.db) {
      for (const record of this.memoryStore.values()) {
        if (record.clientOperationId === opId) return record;
      }
      return null;
    }
    const row = this.findByOpIdStmt.get(opId) as Record<string, any> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listRecentByRoom(roomId: string, limit = 50): BufferedMessageRecord[] {
    if (this.isFallback || !this.db) {
      return Array.from(this.memoryStore.values())
        .filter((r) => r.roomId === roomId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }
    const rows = this.listByRoomStmt.all(roomId, limit) as Array<Record<string, any>>;
    return rows.map((r) => this.mapRow(r));
  }

  public getLatestMessage(roomId: string, excludedIds: string[] = []): BufferedMessageRecord | null {
    if (this.isFallback || !this.db) {
      const filtered = Array.from(this.memoryStore.values())
        .filter((r) => r.roomId === roomId && !r.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return filtered[0] || null;
    }
    const row = this.getLatestByRoomStmt.get(roomId, JSON.stringify(excludedIds)) as Record<string, any> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public countUnread(roomId: string, memberId: string, lastReadAt?: string | null, excludedIds: string[] = []): number {
    if (this.isFallback || !this.db) {
      return Array.from(this.memoryStore.values()).filter(
        (r) =>
          r.roomId === roomId &&
          !r.deletedAt &&
          (!r.senderMemberId || r.senderMemberId !== memberId) &&
          (!lastReadAt || r.createdAt > lastReadAt),
      ).length;
    }
    const row = this.countUnreadStmt.get(roomId, JSON.stringify(excludedIds), memberId, lastReadAt || null, lastReadAt || null, roomId, memberId) as { cnt: number | bigint } | undefined;
    return Number(row?.cnt ?? 0);
  }

  public listMessages(
    roomId: string,
    limit = 30,
    cursor?: string,
    search?: string,
  ): { messages: BufferedMessageRecord[]; hasMore: boolean; nextCursor: string | null } {
    const take = Math.min(Math.max(limit, 1), 100);
    if (this.isFallback || !this.db) {
      let items = Array.from(this.memoryStore.values()).filter(
        (r) => r.roomId === roomId && !r.deletedAt,
      );
      if (search) {
        const q = search.toLowerCase();
        items = items.filter((r) => (r.body || '').toLowerCase().includes(q));
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      if (cursor) {
        const idx = items.findIndex((r) => r.id === cursor);
        if (idx !== -1) items = items.slice(idx + 1);
      }
      const page = items.slice(0, take);
      const hasMore = items.length > take;
      const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
      return { messages: page, hasMore, nextCursor };
    }

    const anchor = cursor ? this.findById(cursor) : null;
    if (cursor && (!anchor || anchor.roomId !== roomId)) return { messages: [], hasMore: false, nextCursor: null };
    const clauses = ['room_id = ?'];
    const params: unknown[] = [roomId];
    if (anchor) { clauses.push('(created_at < ? OR (created_at = ? AND id < ?))'); params.push(anchor.createdAt, anchor.createdAt, anchor.id); }
    if (search) { clauses.push("deleted_at IS NULL AND body LIKE ? ESCAPE '\\'"); params.push('%' + search.replace(/[\\%_]/g, '\\$&') + '%'); }
    const rows = this.db.prepare(`SELECT * FROM chat_message_buffer WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(...params, take + 1) as Array<Record<string, any>>;

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? String(page[page.length - 1]?.id) : null;
    return {
      messages: page.map((r) => this.mapRow(r)),
      hasMore,
      nextCursor,
    };
  }

  public setMemberProfiles(profiles: Array<{ id: string; firstName: string; lastName: string; preferredName?: string | null; profilePhotoUrl?: string | null }>) {
    for (const p of profiles) {
      this.memberProfiles.set(p.id, {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        preferredName: p.preferredName || null,
        profilePhotoUrl: p.profilePhotoUrl || null,
      });
    }
  }

  public getMemberProfile(id: string): { id: string; firstName: string; lastName: string; preferredName: string | null; profilePhotoUrl: string | null } | null {
    return this.memberProfiles.get(id) || null;
  }

  public setMemberProfile(id: string, profile: { firstName: string; lastName: string; preferredName?: string | null; profilePhotoUrl?: string | null }) {
    this.memberProfiles.set(id, {
      id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      preferredName: profile.preferredName || null,
      profilePhotoUrl: profile.profilePhotoUrl || null,
    });
  }

  public updateMessage(id: string, body: string, editedAt: string): boolean {
    if (this.isFallback || !this.db) {
      const record = this.memoryStore.get(id);
      if (!record) return false;
      record.body = body;
      record.editedAt = editedAt;
      record.syncStatus = 'PENDING';
      return true;
    }
    const res = this.updateBodyStmt.run(body, editedAt, id);
    return Number(res.changes) > 0;
  }

  public deleteMessage(id: string, deletedAt: string): boolean {
    if (this.isFallback || !this.db) {
      const record = this.memoryStore.get(id);
      if (!record) return false;
      record.deletedAt = deletedAt;
      record.body = null;
      record.attachmentUrl = null;
      record.attachmentMeta = null;
      record.syncStatus = 'PENDING';
      return true;
    }
    const res = this.softDeleteStmt.run(deletedAt, id);
    return Number(res.changes) > 0;
  }

  // -------------------------------------------------------------------------
  // Batch & Migration Operations
  // -------------------------------------------------------------------------

  public getPendingBatch(batchSize = 100, after?: { createdAt: string; id: string }): BufferedMessageRecord[] {
    if (this.isFallback || !this.db) {
      return Array.from(this.memoryStore.values())
        .filter((r) => (r.syncStatus === 'PENDING' || r.syncStatus === 'FAILED') && (!after || r.createdAt > after.createdAt || (r.createdAt === after.createdAt && r.id > after.id)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, batchSize);
    }
    const rows = this.getPendingBatchStmt.all(after?.createdAt || '', after?.createdAt || '', after?.id || '', batchSize) as Array<Record<string, any>>;
    return rows.map((r) => this.mapRow(r));
  }

  public markProcessing(id: string) {
    if (this.isFallback || !this.db) {
      const record = this.memoryStore.get(id);
      if (record) record.syncStatus = 'PROCESSING';
      return;
    }
    this.markProcessingBatchStmt.run(id);
  }

  public markMigrated(id: string, migratedAt: string, snapshot?: BufferedMessageRecord) {
    if (snapshot && this.db) {
      this.db.prepare(`UPDATE chat_message_buffer SET sync_status = 'MIGRATED', migrated_at = ?, last_error = NULL
        WHERE id = ? AND body IS ? AND edited_at IS ? AND deleted_at IS ? AND attachment_url IS ? AND attachment_meta IS ?`)
        .run(migratedAt, id, snapshot.body, snapshot.editedAt, snapshot.deletedAt, snapshot.attachmentUrl, snapshot.attachmentMeta ? JSON.stringify(snapshot.attachmentMeta) : null);
      return;
    }
    if (this.isFallback || !this.db) {
      const record = this.memoryStore.get(id);
      if (record) {
        record.syncStatus = 'MIGRATED';
        record.migratedAt = migratedAt;
        record.lastError = null;
      }
      return;
    }
    this.markMigratedStmt.run(migratedAt, id);
  }

  public markFailed(id: string, error: string) {
    if (this.isFallback || !this.db) {
      const record = this.memoryStore.get(id);
      if (record) {
        record.syncStatus = 'FAILED';
        record.retryCount += 1;
        record.lastError = error.slice(0, 500);
      }
      return;
    }
    this.markFailedStmt.run(error.slice(0, 500), id);
  }

  public resetProcessingToPending(): number {
    if (this.isFallback || !this.db) {
      let count = 0;
      for (const record of this.memoryStore.values()) {
        if (record.syncStatus === 'PROCESSING') {
          record.syncStatus = 'PENDING';
          count++;
        }
      }
      return count;
    }
    const res = this.resetProcessingStmt.run();
    return Number(res.changes ?? 0);
  }

  public purgeOlderMigrated(olderThanIso: string): number {
    if (this.isFallback || !this.db) {
      let count = 0;
      for (const [id, record] of this.memoryStore.entries()) {
        if (record.syncStatus === 'MIGRATED' && record.migratedAt && record.migratedAt < olderThanIso) {
          this.memoryStore.delete(id);
          count++;
        }
      }
      return count;
    }
    const res = this.purgeMigratedStmt.run(olderThanIso);
    return Number(res.changes ?? 0);
  }

  public seedLegacyMessages(messages: Array<{
    id: string;
    clientOperationId?: string | null;
    roomId: string;
    senderMemberId: string | null;
    type: string;
    body: string | null;
    attachmentUrl?: string | null;
    attachmentMeta?: Record<string, unknown> | null;
    replyToId?: string | null;
    editedAt?: string | null;
    deletedAt?: string | null;
    createdAt: string;
  }>): { inserted: number; skipped: number } {
    if (!messages.length) return { inserted: 0, skipped: 0 };

    if (this.isFallback || !this.db) {
      let inserted = 0;
      let skipped = 0;
      for (const msg of messages) {
        if (!this.memoryStore.has(msg.id)) {
          this.memoryStore.set(msg.id, {
            id: msg.id,
            clientOperationId: msg.clientOperationId || null,
            roomId: msg.roomId,
            senderMemberId: msg.senderMemberId || null,
            type: msg.type || 'TEXT',
            body: msg.body || null,
            attachmentUrl: msg.attachmentUrl || null,
            attachmentMeta: msg.attachmentMeta || null,
            replyToId: msg.replyToId || null,
            editedAt: msg.editedAt || null,
            deletedAt: msg.deletedAt || null,
            createdAt: msg.createdAt,
            syncStatus: 'MIGRATED',
            retryCount: 0,
            lastError: null,
            migratedAt: msg.createdAt,
          });
          inserted++;
        } else {
          skipped++;
        }
      }
      return { inserted, skipped };
    }

    let inserted = 0;
    let skipped = 0;

    const seedStmt = this.db.prepare(`
      INSERT OR IGNORE INTO chat_message_buffer (
        id, client_operation_id, room_id, sender_member_id, type, body,
        attachment_url, attachment_meta, reply_to_id, edited_at, deleted_at,
        created_at, sync_status, migrated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MIGRATED', ?)
      ON CONFLICT(id) DO UPDATE SET body = excluded.body,
        attachment_url = excluded.attachment_url, attachment_meta = excluded.attachment_meta,
        edited_at = excluded.edited_at, deleted_at = excluded.deleted_at
      WHERE chat_message_buffer.sync_status = 'MIGRATED'
        AND chat_message_buffer.room_id = excluded.room_id
        AND (COALESCE(excluded.edited_at, '') > COALESCE(chat_message_buffer.edited_at, '')
          OR COALESCE(excluded.deleted_at, '') > COALESCE(chat_message_buffer.deleted_at, ''))
    `);

    this.db.exec('BEGIN TRANSACTION;');
    try {
      for (const msg of messages) {
        const metaStr = msg.attachmentMeta ? JSON.stringify(msg.attachmentMeta) : null;
        const res = seedStmt.run(
          msg.id,
          msg.clientOperationId || null,
          msg.roomId,
          msg.senderMemberId || null,
          msg.type || 'TEXT',
          msg.body || null,
          msg.attachmentUrl || null,
          metaStr,
          msg.replyToId || null,
          msg.editedAt || null,
          msg.deletedAt || null,
          msg.createdAt,
          msg.createdAt,
        );
        if (Number(res.changes) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return { inserted, skipped };
  }

  public countAll(): number {
    if (this.isFallback || !this.db) {
      return this.memoryStore.size;
    }
    const res = this.db.prepare('SELECT COUNT(*) as cnt FROM chat_message_buffer').get() as { cnt: number | bigint };
    return Number(res?.cnt ?? 0);
  }

  public getAllIds(): Set<string> {
    if (this.isFallback || !this.db) {
      return new Set(this.memoryStore.keys());
    }
    const rows = this.db.prepare('SELECT id FROM chat_message_buffer').all() as Array<{ id: string }>;
    return new Set(rows.map((r) => String(r.id)));
  }

  public getRoomMessageCounts(): Map<string, number> {
    if (this.isFallback || !this.db) {
      const map = new Map<string, number>();
      for (const r of this.memoryStore.values()) {
        map.set(r.roomId, (map.get(r.roomId) || 0) + 1);
      }
      return map;
    }
    const rows = this.db.prepare('SELECT room_id, COUNT(*) as cnt FROM chat_message_buffer GROUP BY room_id').all() as Array<{ room_id: string; cnt: number | bigint }>;
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(String(r.room_id), Number(r.cnt));
    }
    return map;
  }

  public getStats(): BufferStats {
    if (this.isFallback || !this.db) {
      let pending = 0;
      let processing = 0;
      let migrated = 0;
      let failed = 0;
      for (const r of this.memoryStore.values()) {
        if (r.syncStatus === 'PENDING') pending++;
        else if (r.syncStatus === 'PROCESSING') processing++;
        else if (r.syncStatus === 'MIGRATED') migrated++;
        else if (r.syncStatus === 'FAILED') failed++;
      }
      return {
        databasePath: this.dbPath || null,
        totalBuffered: this.memoryStore.size,
        pendingCount: pending,
        processingCount: processing,
        migratedCount: migrated,
        failedCount: failed,
        dbSizeBytes: 0,
      };
    }

    const counts = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sync_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN sync_status = 'PROCESSING' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN sync_status = 'MIGRATED' THEN 1 ELSE 0 END) as migrated,
          SUM(CASE WHEN sync_status = 'FAILED' THEN 1 ELSE 0 END) as failed
        FROM chat_message_buffer`,
      )
      .get() as Record<string, any>;

    let fileSize = 0;
    try {
      if (this.dbPath && fs.existsSync(this.dbPath)) {
        fileSize = fs.statSync(this.dbPath).size;
      }
    } catch {
      // ignore
    }

    return {
      databasePath: this.dbPath,
      totalBuffered: Number(counts?.total ?? 0),
      pendingCount: Number(counts?.pending ?? 0),
      processingCount: Number(counts?.processing ?? 0),
      migratedCount: Number(counts?.migrated ?? 0),
      failedCount: Number(counts?.failed ?? 0),
      dbSizeBytes: fileSize,
    };
  }

  public close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
      } catch (err) {
        this.logger.warn(`Error closing SQLite buffer DB: ${(err as Error).message}`);
      }
    }
  }

  private mapRow(row: Record<string, any>): BufferedMessageRecord {
    let meta: Record<string, unknown> | null = null;
    if (row.attachment_meta) {
      try {
        meta = JSON.parse(row.attachment_meta);
      } catch {
        meta = null;
      }
    }

    return {
      id: String(row.id),
      clientOperationId: row.client_operation_id ? String(row.client_operation_id) : null,
      roomId: String(row.room_id),
      senderMemberId: row.sender_member_id ? String(row.sender_member_id) : null,
      type: String(row.type),
      body: row.body !== null ? String(row.body) : null,
      attachmentUrl: row.attachment_url !== null ? String(row.attachment_url) : null,
      attachmentMeta: meta,
      replyToId: row.reply_to_id !== null ? String(row.reply_to_id) : null,
      editedAt: row.edited_at !== null ? String(row.edited_at) : null,
      deletedAt: row.deleted_at !== null ? String(row.deleted_at) : null,
      createdAt: String(row.created_at),
      syncStatus: row.sync_status as BufferedMessageRecord['syncStatus'],
      retryCount: Number(row.retry_count ?? 0),
      lastError: row.last_error ? String(row.last_error) : null,
      migratedAt: row.migrated_at ? String(row.migrated_at) : null,
    };
  }
}
