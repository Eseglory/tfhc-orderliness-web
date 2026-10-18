import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectSqliteStorage } from '../src/database-sync/storage-preflight';

describe('SQLite storage preflight', () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'tfhc-storage-'));
    file = join(directory, 'database.db');
    writeFileSync(file, 'fixture');
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const mount = (type: string) => `23 1 8:1 / ${directory.replace(/\\/g, '\\134').replace(/ /g, '\\040')} rw - ${type} /dev/example rw`;

  it('rejects ephemeral overlay and memory mounts', () => {
    for (const type of ['overlay', 'tmpfs', 'ramfs']) {
      expect(inspectSqliteStorage(file, mount(type))).toMatchObject({ dedicatedMount: false, survivesRedeployVerified: false });
    }
  });
  it('does not confuse a real disk mount with proven redeployment retention', () => {
    expect(inspectSqliteStorage(file, mount('ext4'))).toEqual({
      dedicatedMount: true, survivesRedeployVerified: false, reason: 'VERIFY_VOLUME_RETENTION_AND_RESTORE',
    });
  });
  it('rejects absent paths and relative paths without creating files', () => {
    expect(() => inspectSqliteStorage('relative.db')).toThrow('SQLITE_PATH_MUST_BE_ABSOLUTE');
    expect(() => inspectSqliteStorage(join(directory, 'missing.db'), mount('ext4'))).toThrow();
  });
});
