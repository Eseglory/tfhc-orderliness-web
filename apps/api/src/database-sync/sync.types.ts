/** Internal replication API. Never accept these payloads directly from HTTP clients. */
export interface RowChange {
  table: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface SyncOperation {
  sequence: number;
  operationId: string;
  digest: string;
  changes: RowChange[];
  attempts: number;
  request?: { key: string; hash: string; result: string };
}

export interface SqlStatement {
  sql: string;
  params?: Array<string | number | null | Uint8Array>;
  /** Reject stale conditional writes instead of acknowledging a no-op. */
  expectedChanges?: number;
}

export interface JournalStatus {
  pending: number;
  unprotected: number;
  conflicts: number;
  checkpoint: number;
  oldestPendingAt: string | null;
  lastSuccessAt: string | null;
}

export interface SyncDestination {
  /** Must commit ALL row changes and the operation receipt in one transaction. */
  apply(operation: SyncOperation): Promise<void>;
}

export class SyncConflict extends Error {
  constructor() { super('SYNC_CONFLICT'); }
}
