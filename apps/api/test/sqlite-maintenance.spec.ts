import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';
import { SqlitePrismaAdapter } from '../src/database-sync/sqlite-prisma-adapter';
import { SqliteJournal } from '../src/database-sync/sqlite-journal';
import { maintenance } from '../src/database-sync/maintenance';
import { verifyProductionActivation } from '../src/database-sync/activation';
import * as storage from '../src/database-sync/storage-preflight';

describe('offline SQLite maintenance and activation gates', () => {
  let directory: string, file: string;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tfhc-maintenance-'));
    file = join(directory, 'operational.db');
    await bootstrapSqlite(file);
    const adapter = new SqlitePrismaAdapter(file);
    try { await adapter.connect(); await adapter.client.subTeam.create({ data: { name: 'Backup fixture' } }); }
    finally { await adapter.disconnect(); }
  }, 30000);
  afterEach(() => { jest.restoreAllMocks(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  it('makes a verified standalone backup and refuses to replace it', async () => {
    expect(await maintenance(['status', '--db', file])).toMatchObject({ pending: 1, unprotected: 1 });
    const out = join(directory, 'backup.db');
    expect(await maintenance(['backup', '--db', file, '--out', out])).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/), bytes: expect.any(Number) });
    await expect(maintenance(['backup', '--db', file, '--out', out])).rejects.toThrow('BACKUP_ALREADY_EXISTS');
    const copy = new SqlitePrismaAdapter(out);
    try { await copy.connect(); expect(await copy.client.subTeam.count()).toBe(1); }
    finally { await copy.disconnect(); }
  });

  it('requires explicit central-write and writer-stop acknowledgements', async () => {
    await expect(maintenance(['sync', '--db', file])).rejects.toThrow('EXPLICIT_OPERATOR_ACKNOWLEDGEMENT_REQUIRED');
    await expect(maintenance(['recover'])).rejects.toThrow('EXPLICIT_OPERATOR_ACKNOWLEDGEMENT_REQUIRED');
    await expect(maintenance(['bootstrap', '--out', join(directory, 'new.db')])).rejects.toThrow('EXPLICIT_OPERATOR_ACKNOWLEDGEMENT_REQUIRED');
    const mismatched = new SqliteJournal(file, 'CREATE TABLE different(id TEXT PRIMARY KEY)');
    try { await expect(mismatched.open()).rejects.toThrow('SCHEMA_REVALIDATION_REQUIRED'); }
    finally { await mismatched.close(); }
  });

  it('validates restore evidence and rejects backup tampering without expiring valid restart evidence', async () => {
    jest.spyOn(storage, 'inspectSqliteStorage').mockReturnValue({ dedicatedMount: true, survivesRedeployVerified: false, reason: 'test mount' });
    const backup = join(directory, 'backup.db'), manifest = join(directory, 'activation.json');
    await maintenance(['backup', '--db', file, '--out', backup]);
    await maintenance(['activation-manifest', '--db', file, '--backup', backup, '--out', manifest,
      '--redeploy-retention-verified', '--single-writer-verified']);
    expect(() => verifyProductionActivation(file, manifest)).not.toThrow();
    const evidence = JSON.parse(readFileSync(manifest, 'utf8'));
    evidence.verifiedAt = '2020-01-01T00:00:00.000Z';
    writeFileSync(manifest, JSON.stringify(evidence));
    expect(() => verifyProductionActivation(file, manifest)).not.toThrow();
    writeFileSync(backup, 'damaged disposable backup');
    expect(() => verifyProductionActivation(file, manifest)).toThrow('SQLITE_BACKUP_CHECKSUM_MISMATCH');
  });
});
