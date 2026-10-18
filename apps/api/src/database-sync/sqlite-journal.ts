import { Worker } from 'node:worker_threads';
import { isAbsolute } from 'node:path';
import { sqliteJournalWorker } from './sqlite-journal.worker';
import { JournalStatus, SqlStatement, SyncOperation } from './sync.types';

/** Dedicated worker owns the connection. No synchronous SQLite calls on the API thread. */
export class SqliteJournal {
  private readonly worker: Worker;
  private nextId = 0;
  private stopped = false;
  private readonly pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>();

  constructor(path: string, expectedSchemaSql?: string) {
    if (!isAbsolute(path)) throw new Error('SQLITE_PATH_MUST_BE_ABSOLUTE');
    this.worker = new Worker(`(${sqliteJournalWorker.toString()})()`, { eval: true, workerData: { path, expectedSchemaSql } });
    this.worker.on('message', ({ id, result, error }) => {
      const request = this.pending.get(id);
      if (!request) return;
      this.pending.delete(id);
      if (error) request.reject(new Error(error)); else request.resolve(result);
    });
    const fail = () => {
      this.stopped = true;
      for (const request of this.pending.values()) request.reject(new Error('SQLITE_WORKER_STOPPED'));
      this.pending.clear();
    };
    this.worker.on('error', fail);
    this.worker.on('exit', fail);
  }

  private request<T>(method: string, args: unknown = {}): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('SQLITE_WORKER_STOPPED'));
    if (this.pending.size >= 128) return Promise.reject(new Error('SQLITE_QUEUE_FULL'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, method, args }); }
      catch { this.pending.delete(id); reject(new Error('INVALID_WORKER_REQUEST')); }
    });
  }

  open() { return this.request<{ ready: boolean; sourceId: string }>('open'); }
  commit(operationId: string, statements: SqlStatement[]) {
    return this.request<{ sequence: number; duplicate: boolean }>('commit', { operationId, statements });
  }
  next(now = Date.now()) { return this.request<SyncOperation | null>('next', { now }); }
  unprotected() { return this.request<SyncOperation[]>('unprotected'); }
  /** Offline recovery only: restore receipts into an empty journal on a NEW snapshot. */
  restoreHistory(sourceId: string, operations: SyncOperation[]) {
    return this.request<void>('restoreHistory', { sourceId, operations });
  }
  protected(operation: SyncOperation) { return this.request<void>('protected', { operationId: operation.operationId, digest: operation.digest }); }
  applied(operation: SyncOperation) {
    return this.request<void>('applied', { operationId: operation.operationId, digest: operation.digest });
  }
  failed(operation: SyncOperation, conflict: boolean, now = Date.now()) {
    return this.request<void>('failed', { operationId: operation.operationId, conflict, now });
  }
  retry(operationId: string) { return this.request<void>('retry', { operationId }); }
  status() { return this.request<JournalStatus>('status'); }
  backup(destination: string) {
    if (!isAbsolute(destination)) throw new Error('BACKUP_PATH_MUST_BE_ABSOLUTE');
    return this.request<{ sha256: string; bytes: number }>('backup', { destination });
  }
  async close() {
    try { if (!this.stopped) await this.request('close'); }
    finally { this.stopped = true; await this.worker.terminate(); }
  }
}
