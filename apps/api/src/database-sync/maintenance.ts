import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, copyFileSync, constants, openSync, readFileSync, readSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootstrapSqlite } from './sqlite-bootstrap';
import { SqliteJournal } from './sqlite-journal';
import { RecoveryJournal } from './recovery-journal';
import { PostgresDestination } from './postgres-destination';
import { SyncRunner } from './sync-runner';
import { recoverSqlite } from './recover-sqlite';
import { inspectSqliteStorage } from './storage-preflight';

function checksum(path: string) {
  const fd = openSync(path, 'r'), hash = createHash('sha256');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let size: number;
    while ((size = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}
function verifyBackupEvidence(file: string) {
  const evidence = JSON.parse(readFileSync(file, 'utf8'));
  if (evidence.restoreVerified !== true || !evidence.backupPath || !/^[a-f0-9]{64}$/.test(evidence.sha256 || '') ||
      checksum(evidence.backupPath) !== evidence.sha256) throw new Error('BACKUP_EVIDENCE_INVALID');
}
function inspectSnapshot(path: string) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('SNAPSHOT_INTEGRITY_FAILED');
    return db.prepare('SELECT source_id,schema_digest FROM _sync_meta WHERE singleton=1').get();
  } finally { db.close(); }
}

/** Operator-only CLI. Never imported by the HTTP application or run on startup. */
export async function maintenance(args: string[]) {
  const [command, ...rest] = args;
  const value = (flag: string) => {
    const index = rest.indexOf(flag);
    if (index < 0 || !rest[index + 1] || rest[index + 1].startsWith('--')) throw new Error('REQUIRED_ARGUMENT_MISSING');
    return rest[index + 1];
  };
  const requireFlag = (flag: string) => { if (!rest.includes(flag)) throw new Error('EXPLICIT_OPERATOR_ACKNOWLEDGEMENT_REQUIRED'); };
  if (command === 'bootstrap') {
    requireFlag('--writers-stopped');
    verifyBackupEvidence(value('--backup-evidence'));
    const pg = new PrismaClient();
    try { return await bootstrapSqlite(resolve(value('--out')), pg); } finally { await pg.$disconnect(); }
  }
  if (command === 'recover') {
    requireFlag('--allow-central-writes'); requireFlag('--writers-stopped');
    verifyBackupEvidence(value('--backup-evidence'));
    const pg = new PrismaClient();
    try { return await recoverSqlite(pg, value('--source'), resolve(value('--out')), { writersStopped: true, backupVerified: true }); }
    finally { await pg.$disconnect(); }
  }
  if (command === 'activation-manifest') {
    requireFlag('--redeploy-retention-verified'); requireFlag('--single-writer-verified');
    const path = realpathSync(value('--db')), backupPath = realpathSync(value('--backup'));
    if (path === backupPath || !inspectSqliteStorage(path).dedicatedMount) throw new Error('PERSISTENT_STORAGE_REQUIRED');
    const current = inspectSnapshot(path);
    // Actually open a restored copy, independently of the live database/WAL.
    const restoredPath = backupPath + '.restore-check-' + randomUUID();
    copyFileSync(backupPath, restoredPath, constants.COPYFILE_EXCL);
    try {
      const restored = inspectSnapshot(restoredPath);
      if (current.source_id !== restored.source_id || current.schema_digest !== restored.schema_digest) throw new Error('BACKUP_IDENTITY_MISMATCH');
    } finally { unlinkSync(restoredPath); }
    const manifest = { version: 1, databasePath: path, sourceId: current.source_id, schemaDigest: current.schema_digest,
      restoreVerified: true, redeployRetentionVerified: true, singleWriterVerified: true, verifiedAt: new Date().toISOString(),
      backup: { path: backupPath, sha256: checksum(backupPath) } };
    writeFileSync(resolve(value('--out')), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return { verified: true };
  }
  if (!['status', 'backup', 'retry', 'sync', 'protect'].includes(command)) throw new Error('UNKNOWN_MAINTENANCE_COMMAND');
  if (['sync', 'protect'].includes(command)) requireFlag('--allow-central-writes');
  const journal = new SqliteJournal(realpathSync(value('--db')));
  let pg: PrismaClient;
  try {
    const { sourceId } = await journal.open();
    if (command === 'status') return { sourceId, ...await journal.status() };
    if (command === 'backup') return await journal.backup(resolve(value('--out')));
    if (command === 'retry') { await journal.retry(value('--operation')); return await journal.status(); }
    pg = new PrismaClient();
    await new RecoveryJournal(pg, sourceId, journal).protectPending();
    if (command === 'sync') await new SyncRunner(journal, new PostgresDestination(pg, sourceId)).run(1000, 30000);
    return await journal.status();
  } finally { await journal.close(); await pg?.$disconnect(); }
}

if (require.main === module) maintenance(process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('MAINTENANCE_FAILED: no existing SQLite file was replaced. Check preconditions and protected database health.'); process.exitCode = 1; });
