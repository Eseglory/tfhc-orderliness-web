// Explicit operator tool: read-only source dump, isolated local restore only.
// Credentials are passed via the child environment, never command arguments/logs.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const dotenv = require('dotenv');
const postgresImage = process.env.TFHC_BACKUP_IMAGE || 'postgres:18-alpine';
const clientImage = process.env.TFHC_BACKUP_CLIENT_IMAGE || postgresImage;
const dumpBinary = process.env.TFHC_BACKUP_CLIENT_BINARY || 'pg_dump';
async function main() {
  if (!process.argv.includes('--read-only-production-backup')) throw Error('EXPLICIT_BACKUP_FLAG_REQUIRED');
  const local = dotenv.parse(fs.readFileSync(path.resolve('apps/api/.env')));
  const response = await fetch('https://api.render.com/v1/services/srv-dahhbh61egvs7380hp7g/env-vars?limit=100', {
    headers: { Authorization: `Bearer ${local.RENDER_API_KEY}` }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('RUNTIME_CONFIGURATION_UNAVAILABLE');
  const entries = await response.json();
  const env = Object.fromEntries(entries.map(item => { const v = item.envVar || item; return [v.key, v.value]; }));
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('INVALID_DATABASE_PROTOCOL');
  const directory = path.resolve('data/storage-backups', `verification-${randomUUID()}`);
  fs.mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, 'public.dump');
  const credentials = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000' };
  fs.writeFileSync(archive, '', { flag: 'wx', mode: 0o600 });
  const dumpName = `tfhc-backup-${randomUUID()}`;
  let dump;
  try {
    dump = spawnSync('docker', ['run', '--user', '0:0', '--name', dumpName, '--label', 'tfhc.scope=backup-verification',
      ...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT','PGOPTIONS'].flatMap(k => ['-e', k]),
      '--entrypoint', dumpBinary, clientImage, '--verbose', '--lock-wait-timeout=5s', '--format=custom', '--file=/tmp/public.dump', '--schema=public', '--no-owner', '--no-privileges'],
    { env: credentials, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, windowsHide: true });
    if (dump.status === 0) {
      const copied = spawnSync('docker', ['cp', `${dumpName}:/tmp/public.dump`, archive], { stdio: 'pipe', timeout: 120000, windowsHide: true });
      if (copied.status !== 0) throw Error('BACKUP_ARCHIVE_COPY_FAILED');
    }
  } finally {
    // Killing the docker CLI on timeout does not necessarily stop its container.
    const removed = spawnSync('docker', ['rm', '--force', dumpName], { stdio: 'ignore', timeout: 15000, windowsHide: true });
    if (removed.status !== 0) throw Error('BACKUP_CONTAINER_CLEANUP_FAILED');
  }
  if (dump.status !== 0) {
    const message = String(dump.stderr || '');
    console.log(JSON.stringify({ stage: 'dump', status: 'failed', versionMismatch: /version mismatch/.test(message),
      timeout: dump.error?.code === 'ETIMEDOUT' || /timeout|timed out/.test(message), authentication: /authentication|password authentication/.test(message),
      connection: /connect|resolve|network/.test(message), filePermission: /permission denied/i.test(message), invalidMount: /mount|sharing/i.test(message) }));
    const phases = message.split(/\r?\n/).filter(line => /^pg_dump: (reading|saving|creating|dumping|executing|last built-in|looking up|finding|processing|checking|identifying|flagging)/.test(line));
    // Print phase verbs only, never object names, query text, or server errors.
    console.log(JSON.stringify({ lastPhases: phases.slice(-8).map(line => /^pg_dump: (reading|identifying) [a-z -]+$/.test(line) ? line : line.split(' ').slice(0,2).join(' ')) }));
    throw Error('BACKUP_NOT_VERIFIED');
  }
  await verifyArchive(archive);
}

async function verifyArchive(archive) {
  archive = path.resolve(archive);
  const directory = path.dirname(archive);
  if (!archive.startsWith(path.resolve('data/storage-backups') + path.sep) || !fs.statSync(archive).isFile()) throw Error('LOCAL_BACKUP_ARCHIVE_REQUIRED');
  const actualRoot = fs.realpathSync(path.resolve('data/storage-backups'));
  if (!fs.realpathSync(archive).startsWith(actualRoot + path.sep)) throw Error('LOCAL_BACKUP_ARCHIVE_REQUIRED');
  const header = Buffer.alloc(5);
  const handle = fs.openSync(archive, 'r');
  try {
    if (fs.readSync(handle, header, 0, 5, 0) !== 5 || header.toString('ascii') !== 'PGDMP') throw Error('INVALID_BACKUP_ARCHIVE');
  } finally { fs.closeSync(handle); }
  const name = `tfhc-restore-${randomUUID()}`;
  const run = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
  let started = false;
  try {
    if (run(['run','--detach','--rm','--network','none','--name',name,'--label','tfhc.scope=backup-verification','-e','POSTGRES_HOST_AUTH_METHOD=trust',
      '-e','POSTGRES_DB=restore_verification',postgresImage]).status !== 0) throw Error('ISOLATED_RESTORE_START_FAILED');
    started = true;
    let ready = false;
    for (let i = 0; i < 30; i++) {
      // Initdb briefly starts a Unix-socket-only server before creating the DB.
      // Wait for the final TCP listener, not that temporary initialization server.
      if (run(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','restore_verification']).status === 0) { ready = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw Error('ISOLATED_RESTORE_NOT_READY');
    // A fresh PostgreSQL database already contains public; the archive creates
    // it too. Remove only that empty schema in THIS newly created test container.
    if (run(['exec',name,'psql','-U','postgres','-d','restore_verification','-v','ON_ERROR_STOP=1','-c','DROP SCHEMA public']).status !== 0)
      throw Error('ISOLATED_RESTORE_SCHEMA_PREPARATION_FAILED');
    if (run(['cp', archive, `${name}:/tmp/public.dump`]).status !== 0) throw Error('RESTORE_ARCHIVE_COPY_FAILED');
    const restored = run(['exec',name,'pg_restore','-U','postgres','-d','restore_verification','--no-owner','--no-privileges','--exit-on-error','/tmp/public.dump']);
    if (restored.status !== 0) {
      const errors = String(restored.stderr || '');
      console.log(JSON.stringify({ stage: 'restore', missingRole: /role .* does not exist/.test(errors), missingSchema: /schema .* does not exist/.test(errors),
        missingFunction: /function .* does not exist/.test(errors), extension: /extension/i.test(errors), timeout: restored.error?.code === 'ETIMEDOUT',
        foreignKey: /foreign key constraint/i.test(errors), duplicate: /already exists|duplicate key/i.test(errors) }));
      throw Error('ISOLATED_RESTORE_FAILED');
    }
    const inspected = run(['exec',name,'psql','-U','postgres','-d','restore_verification','-At','-v','ON_ERROR_STOP=1','-c',
      "SELECT json_build_object('tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'), 'foreignKeys', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f'))"]);
    if (inspected.status !== 0) throw Error('RESTORE_INSPECTION_FAILED');
    const restoredSchema = JSON.parse(inspected.stdout.trim());
    if (!restoredSchema.tables) throw Error('RESTORE_HAS_NO_APPLICATION_TABLES');
    const evidence = { verifiedAt: new Date().toISOString(), backupPath: archive,
      sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), restoreVerified: true,
      restoredSchema,
      scope: 'public schema only; not provider roles, auth, or external media' };
    fs.writeFileSync(path.join(directory,'evidence.json'), JSON.stringify(evidence,null,2), { flag:'wx', mode:0o600 });
    console.log(JSON.stringify({ status:'restore-verified', evidencePath:path.join(directory,'evidence.json'), scope:evidence.scope }));
  } finally {
    if (started && run(['stop', name]).status !== 0) throw Error('TEST_CONTAINER_CLEANUP_FAILED');
  }
}
module.exports = { verifyArchive };
if (require.main === module) main().catch(error => { console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'BACKUP_VERIFICATION_FAILED'); process.exitCode=1; });
