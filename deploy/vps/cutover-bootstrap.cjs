// Final offline import only. Refuses an existing DB and checks the former writer.
const fs = require('node:fs');
const { maintenance } = require('./apps/api/dist/apps/api/src/database-sync/maintenance');
async function main() {
  const response = await fetch('https://tfhc-orderliness-api.onrender.com/health', { signal: AbortSignal.timeout(20000) });
  const health = await response.json();
  if (!response.ok || health.role !== 'compatibility-proxy' || health.databaseWriter !== false)
    throw Error('FORMER_WRITER_NOT_REPLACED');
  const sourceEvidence = JSON.parse(fs.readFileSync('/var/backups/evidence.json', 'utf8'));
  const evidence = { ...sourceEvidence, backupPath: '/var/backups/public.dump' };
  fs.writeFileSync('/var/data/source-backup-evidence.json', JSON.stringify(evidence), { flag: 'wx', mode: 0o600 });
  const imported = await maintenance(['bootstrap', '--out', '/var/data/operational.db', '--writers-stopped', '--backup-evidence', '/var/data/source-backup-evidence.json']);
  await maintenance(['backup', '--db', '/var/data/operational.db', '--out', '/var/data/activation-backup.db']);
  // The independently executed VPS replacement rehearsal establishes bind-mount retention.
  await maintenance(['activation-manifest', '--db', '/var/data/operational.db', '--backup', '/var/data/activation-backup.db',
    '--out', '/var/data/activation.json', '--redeploy-retention-verified', '--single-writer-verified']);
  fs.writeFileSync('/var/data/import-evidence.json', JSON.stringify({ ...imported, verifiedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ productionImportVerified: true, tables: imported.tableCount,
    rows: Object.values(imported.counts).reduce((sum, value) => sum + value, 0), activationManifestCreated: true }));
}
main().catch(() => { console.error('CUTOVER_BOOTSTRAP_FAILED: existing files retained; do not overwrite'); process.exitCode = 1; });
