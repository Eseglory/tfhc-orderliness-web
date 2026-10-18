import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, openSync, readSync, closeSync } from 'node:fs';
import { inspectSqliteStorage } from './storage-preflight';

/** Fail closed in production. This is deliberately not a boolean bypass flag. */
export function verifyProductionActivation(databasePath: string, manifestPath: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || manifest.restoreVerified !== true || manifest.redeployRetentionVerified !== true || manifest.singleWriterVerified !== true ||
      realpathSync(manifest.databasePath) !== realpathSync(databasePath) ||
      !manifest.backup?.path || !/^[a-f0-9]{64}$/.test(manifest.backup.sha256 || '') ||
      realpathSync(manifest.backup.path) === realpathSync(databasePath) ||
      !Number.isFinite(Date.parse(manifest.verifiedAt)) ||
      Date.parse(manifest.verifiedAt) > Date.now() + 60000) throw new Error('SQLITE_ACTIVATION_EVIDENCE_INVALID');
  if (!inspectSqliteStorage(databasePath).dedicatedMount) throw new Error('SQLITE_PERSISTENT_VOLUME_REQUIRED');
  const hash = createHash('sha256');
  const file = openSync(manifest.backup.path, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let size: number;
    while ((size = readSync(file, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size));
  } finally { closeSync(file); }
  if (hash.digest('hex') !== manifest.backup.sha256) throw new Error('SQLITE_BACKUP_CHECKSUM_MISMATCH');
  // Evidence remains valid across later restarts, but must identify this exact
  // authority and schema; a different snapshot cannot activate an empty file.
  const { DatabaseSync } = require('node:sqlite');
  const identity = (path: string) => {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
        throw new Error('SQLITE_ACTIVATION_INTEGRITY_FAILED');
      return db.prepare('SELECT source_id,schema_digest FROM _sync_meta WHERE singleton=1').get();
    } finally { db.close(); }
  };
  const active = identity(databasePath), backup = identity(manifest.backup.path);
  if (active.source_id !== manifest.sourceId || active.schema_digest !== manifest.schemaDigest ||
      backup.source_id !== active.source_id || backup.schema_digest !== active.schema_digest)
    throw new Error('SQLITE_ACTIVATION_IDENTITY_MISMATCH');
}
