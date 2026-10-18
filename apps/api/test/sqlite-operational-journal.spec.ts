import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sqliteJournalWorker } from '../src/database-sync/sqlite-journal.worker';
import { SqliteJournal } from '../src/database-sync/sqlite-journal';
import { SyncRunner } from '../src/database-sync/sync-runner';
import { SyncConflict, SyncDestination, SyncOperation } from '../src/database-sync/sync.types';
import { assertSupportedDatabaseMode } from '../src/database-sync/database-mode';

const { DatabaseSync } = require('node:sqlite');

describe('operational SQLite journal (isolated temporary databases only)', () => {
  let directory: string;
  let file: string;
  let journal: SqliteJournal;
  const insert = (id: string, name = 'test') => [{ sql: 'INSERT INTO parents(id,name) VALUES(?,?)', params: [id, name], expectedChanges: 1 }];
  const read = (sql: string) => {
    const db = new DatabaseSync(file, { readOnly: true });
    try { return db.prepare(sql).all(); } finally { db.close(); }
  };
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tfhc-journal-'));
    file = join(directory, 'operations.db');
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE parents(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE children(id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE);
      CREATE TABLE media(id TEXT PRIMARY KEY, bytes BLOB NOT NULL);`);
    db.close();
    journal = new SqliteJournal(file);
    await journal.open();
  });
  afterEach(async () => {
    await journal.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('commits related rows and ordered outbox records atomically; rejects duplicate operation payloads', async () => {
    const operationId = randomUUID();
    const statements = [...insert('p'), { sql: 'INSERT INTO children(id,parent_id) VALUES(?,?)', params: ['c', 'p'] }];
    expect(await journal.commit(operationId, statements)).toEqual({ sequence: 1, duplicate: false });
    expect(await journal.commit(operationId, statements)).toEqual({ sequence: 1, duplicate: true });
    await expect(journal.commit(operationId, insert('other'))).rejects.toThrow('OPERATION_ID_REUSED');
    expect(read('SELECT count(*) count FROM parents')[0].count).toBe(1);
    const pending = await journal.next();
    expect(pending.changes.map(change => change.table)).toEqual(['parents', 'children']);
    expect(pending.changes[1].after.parent_id).toBe('p');
  });

  it('rolls back row writes and journal on FK, uniqueness, and conditional update failures', async () => {
    await expect(journal.commit(randomUUID(), [...insert('p'), {
      sql: 'INSERT INTO children(id,parent_id) VALUES(?,?)', params: ['c', 'missing'],
    }])).rejects.toThrow();
    expect(read('SELECT count(*) count FROM parents')[0].count).toBe(0);
    expect((await journal.status()).pending).toBe(0);
    await journal.commit(randomUUID(), insert('p'));
    await expect(journal.commit(randomUUID(), insert('p2'))).rejects.toThrow();
    await expect(journal.commit(randomUUID(), [{ sql: 'UPDATE parents SET name=? WHERE id=? AND name=?',
      params: ['new', 'p', 'stale'], expectedChanges: 1 }])).rejects.toThrow('LOCAL_WRITE_CONFLICT');
    expect((await journal.status()).pending).toBe(1);
  });

  it('captures updates, deletions, and cascaded child tombstones', async () => {
    await journal.commit(randomUUID(), [...insert('p'), { sql: 'INSERT INTO children(id,parent_id) VALUES(?,?)', params: ['c', 'p'] }]);
    await journal.applied(await journal.next());
    await journal.commit(randomUUID(), [{ sql: 'UPDATE parents SET name=? WHERE id=?', params: ['updated', 'p'], expectedChanges: 1 }]);
    expect((await journal.next()).changes[0].before.name).toBe('test');
    expect((await journal.next()).changes[0].after.name).toBe('updated');
    await journal.applied(await journal.next());
    await journal.commit(randomUUID(), [{ sql: 'DELETE FROM parents WHERE id=?', params: ['p'], expectedChanges: 1 }]);
    const deletion = await journal.next();
    expect(deletion.changes.map(change => change.table)).toEqual(['children', 'parents']);
    expect(deletion.changes.every(change => change.after === null)).toBe(true);
    expect(read('SELECT count(*) count FROM children')[0].count).toBe(0);
  });

  it('survives reopening with pending operations and blocks unjournaled external writes', async () => {
    await journal.commit(randomUUID(), insert('p'));
    await journal.close();
    const external = new DatabaseSync(file);
    try { expect(() => external.exec("UPDATE parents SET name='untracked'")).toThrow(); }
    finally { external.close(); }
    journal = new SqliteJournal(file);
    await journal.open();
    expect((await journal.next()).changes[0].after.id).toBe('p');
    expect((await journal.status()).pending).toBe(1);
  });

  it('recovers acknowledged data after abrupt process exit without connection cleanup', async () => {
    await journal.close();
    const source = `(${sqliteJournalWorker.toString()})()`;
    const script = `const {Worker}=require('node:worker_threads');
      const worker=new Worker(${JSON.stringify(source)},{eval:true,workerData:{path:${JSON.stringify(file)}}});
      worker.on('message', message=>{
        if(message.error) process.exit(2);
        if(message.id===1) worker.postMessage({id:2,method:'commit',args:{operationId:${JSON.stringify(randomUUID())},statements:${JSON.stringify(insert('crash-safe'))}}});
        else process.exit(23);
      });
      worker.postMessage({id:1,method:'open',args:{}});`;
    const child = spawnSync(process.execPath, ['-e', script], { timeout: 10000, stdio: 'pipe' });
    expect(child.status).toBe(23);
    journal = new SqliteJournal(file);
    await journal.open();
    expect((await journal.next()).changes[0].after.id).toBe('crash-safe');
    expect(read('SELECT count(*) count FROM parents')[0].count).toBe(1);
  });

  it('preserves failed attempts across restarts and retries after backoff', async () => {
    await journal.commit(randomUUID(), insert('p'));
    const destination = { apply: jest.fn().mockRejectedValue(new Error('connection unavailable')) };
    expect((await new SyncRunner(journal, destination).run()).blocked).toBe(true);
    await journal.close();
    journal = new SqliteJournal(file);
    await journal.open();
    expect(await journal.next()).toBeNull();
    const pending = await journal.next(Date.now() + 31000);
    expect(pending.attempts).toBe(1);
    await journal.retry(pending.operationId);
    destination.apply.mockResolvedValue(undefined);
    expect((await new SyncRunner(journal, destination).run()).applied).toBe(1);
    expect((await journal.status()).checkpoint).toBe(1);
  });

  it('quarantines conflicts and blocks later dependent operations until reviewed', async () => {
    await journal.commit(randomUUID(), insert('p'));
    await journal.commit(randomUUID(), insert('p2', 'second'));
    const first = await journal.next();
    const apply = jest.fn().mockRejectedValue(new SyncConflict());
    await new SyncRunner(journal, { apply }).run();
    expect((await journal.status()).conflicts).toBe(1);
    expect(await journal.next(Date.now() + 99999999)).toBeNull();
    expect(apply).toHaveBeenCalledTimes(1);
    await journal.retry(first.operationId);
    apply.mockResolvedValue(undefined);
    expect((await new SyncRunner(journal, { apply }).run()).applied).toBe(2);
  });

  it('re-delivers safely after destination commit but before local checkpoint', async () => {
    await journal.commit(randomUUID(), insert('p'));
    const receipts = new Set<string>();
    let effectCount = 0;
    const destination: SyncDestination = { apply: async (operation: SyncOperation) => {
      if (!receipts.has(operation.operationId)) { receipts.add(operation.operationId); effectCount++; }
    } };
    await destination.apply(await journal.next());
    await journal.close();
    journal = new SqliteJournal(file);
    await journal.open();
    await new SyncRunner(journal, destination).run();
    expect(effectCount).toBe(1);
    expect((await journal.status()).pending).toBe(0);
  });

  it('backs up WAL data, verifies integrity, and restores pending operations and relationships', async () => {
    expect(readdirSync(directory).some(name => name.includes('.before-journal-'))).toBe(true);
    await journal.commit(randomUUID(), [...insert('p'), { sql: 'INSERT INTO children(id,parent_id) VALUES(?,?)', params: ['c', 'p'] }]);
    const backup = join(directory, 'verified.db');
    expect((await journal.backup(backup)).sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(journal.backup(backup)).rejects.toThrow('BACKUP_ALREADY_EXISTS');
    const restored = new SqliteJournal(backup);
    try {
      await restored.open();
      expect((await restored.next()).changes).toEqual((await journal.next()).changes);
      expect((await restored.status()).pending).toBe(1);
      const copy = new DatabaseSync(backup, { readOnly: true });
      try {
        expect(copy.prepare('SELECT count(*) count FROM children JOIN parents ON children.parent_id=parents.id').get().count).toBe(1);
        expect(copy.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally { copy.close(); }
    } finally { await restored.close(); }
  });

  it('preserves source identity and rejects schema drift rather than omitting new fields', async () => {
    const firstSource = read('SELECT source_id FROM _sync_meta')[0].source_id;
    await journal.close();
    journal = new SqliteJournal(file);
    expect((await journal.open()).sourceId).toBe(firstSource);
    await journal.close();
    const migration = new DatabaseSync(file);
    try { migration.exec('ALTER TABLE parents ADD COLUMN extra TEXT'); } finally { migration.close(); }
    journal = new SqliteJournal(file);
    await expect(journal.open()).rejects.toThrow('SCHEMA_REVALIDATION_REQUIRED');
  });

  it('encodes binary records without losing bytes', async () => {
    await journal.commit(randomUUID(), [{ sql: 'INSERT INTO media(id,bytes) VALUES(?,?)', params: ['m', new Uint8Array([0, 1, 255])] }]);
    expect((await journal.next()).changes[0].after.bytes).toEqual({ $bytes: '0001FF' });
  });

  it('keeps the event loop responsive while the SQLite worker waits for a write lock', async () => {
    const other = new DatabaseSync(file);
    other.exec('BEGIN IMMEDIATE');
    let released = false;
    const timer = setTimeout(() => { other.exec('ROLLBACK'); released = true; }, 50);
    try {
      await journal.commit(randomUUID(), insert('unblocked'));
      expect(released).toBe(true);
    } finally {
      clearTimeout(timer);
      if (!released) other.exec('ROLLBACK');
      other.close();
    }
  });

  it('makes checkpoint acknowledgements idempotent and refuses skipping a pending operation', async () => {
    await journal.commit(randomUUID(), insert('p'));
    const first = await journal.next();
    await journal.applied(first);
    await journal.applied(first);
    expect((await journal.status()).checkpoint).toBe(1);
    await journal.commit(randomUUID(), insert('p2', 'two'));
    await journal.commit(randomUUID(), insert('p3', 'three'));
    const latest = read('SELECT operation_id,digest FROM _sync_operations ORDER BY sequence DESC LIMIT 1')[0];
    await expect(journal.applied({ ...first, operationId: latest.operation_id, digest: latest.digest })).rejects.toThrow('CHECKPOINT_MISMATCH');
    expect((await journal.status()).checkpoint).toBe(1);
  });

  it('refuses missing databases, journal tampering, DDL, and unsafe activation', async () => {
    const missing = join(directory, 'missing.db');
    const unopened = new SqliteJournal(missing);
    try { await expect(unopened.open()).rejects.toThrow('DATABASE_NOT_INITIALIZED'); }
    finally { await unopened.close(); }
    expect(existsSync(missing)).toBe(false);
    await expect(journal.commit(randomUUID(), [{ sql: 'DELETE FROM _sync_operations' }])).rejects.toThrow('INVALID_STATEMENT');
    await expect(journal.commit(randomUUID(), [{ sql: 'DROP TABLE parents' }])).rejects.toThrow('INVALID_STATEMENT');
    expect(() => assertSupportedDatabaseMode({ OPERATIONAL_DATABASE: 'sqlite' })).toThrow('SQLITE_PRIMARY_NOT_READY');
    expect(() => assertSupportedDatabaseMode({})).not.toThrow();
  });
});
