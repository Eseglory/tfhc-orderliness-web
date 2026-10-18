const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyArchive } = require('../../scripts/verify-production-backup.cjs');

test('production export requires its explicit operator flag before reading credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-production-backup.cjs'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^EXPLICIT_BACKUP_FLAG_REQUIRED\s*$/);
});

test('restore rejects paths outside the local backup area before starting Docker', async () => {
  await assert.rejects(verifyArchive('apps/api/.env'), /LOCAL_BACKUP_ARCHIVE_REQUIRED/);
});

test('restore rejects empty and invalid archives before starting Docker', async () => {
  const root = path.resolve('data/storage-backups');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'unit-backup-'));
  try {
    const file = path.join(directory, 'test.dump');
    fs.writeFileSync(file, '');
    await assert.rejects(verifyArchive(file), /INVALID_BACKUP_ARCHIVE/);
    fs.writeFileSync(file, 'not a PostgreSQL archive');
    await assert.rejects(verifyArchive(file), /INVALID_BACKUP_ARCHIVE/);
  } finally {
    const actual = path.resolve(directory);
    assert.ok(actual.startsWith(root + path.sep));
    fs.rmSync(actual, { recursive: true });
    assert.equal(fs.existsSync(actual), false);
  }
});
