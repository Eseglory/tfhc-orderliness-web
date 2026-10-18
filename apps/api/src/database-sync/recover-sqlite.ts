import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { PostgresDestination } from './postgres-destination';
import { bootstrapSqlite } from './sqlite-bootstrap';
import { SqliteJournal } from './sqlite-journal';
import { SyncOperation } from './sync.types';

/**
 * Offline disaster recovery. Requires fencing ALL former writers and taking a
 * verified PostgreSQL backup before invocation. Replays protected operations
 * transactionally, then builds a NEW file; never overwrites a damaged authority.
 * A conflict stops recovery for explicit business reconciliation.
 */
export async function recoverSqlite(pg: PrismaClient, sourceId: string, destination: string,
  evidence: { writersStopped: boolean; backupVerified: boolean }) {
  if (!evidence.writersStopped || !evidence.backupVerified) throw new Error('RECOVERY_PREFLIGHT_REQUIRED');
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error('RECOVERY_REQUIRES_NEW_ABSOLUTE_PATH');
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sourceId)) throw new Error('INVALID_SOURCE_ID');
  const active = await pg.$queryRawUnsafe<any[]>(
    'SELECT source_id FROM public._sqlite_operational_authority WHERE singleton=true AND expires_at>now()');
  if (active.length) throw new Error('RECOVERY_WRITER_STILL_ACTIVE');
  const rows = await pg.$queryRawUnsafe<any[]>(
    'SELECT sequence,digest,payload FROM public._sqlite_recovery_operations WHERE source_id=$1 ORDER BY sequence', sourceId);
  if (!rows.length) throw new Error('RECOVERY_LOG_EMPTY');
  const operations: SyncOperation[] = rows.map((row, index) => {
    const operation = JSON.parse(row.payload);
    if (Number(row.sequence) !== index + 1 || operation.sequence !== index + 1 || operation.digest !== row.digest ||
        createHash('sha256').update(JSON.stringify(operation.changes)).digest('hex') !== row.digest)
      throw new Error('RECOVERY_LOG_INTEGRITY_FAILED');
    return operation;
  });
  const target = new PostgresDestination(pg, sourceId);
  for (const operation of operations) await target.apply(operation);
  const snapshot = await bootstrapSqlite(destination, pg);
  const journal = new SqliteJournal(destination);
  try {
    await journal.open();
    await journal.restoreHistory(sourceId, operations);
    const backup = await journal.backup(destination + '.recovered-backup.db');
    return { ...snapshot, recoveredOperations: operations.length, backup };
  } finally { await journal.close(); }
}
