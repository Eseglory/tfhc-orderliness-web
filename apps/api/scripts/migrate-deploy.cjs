const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Prisma migrations need session pooling; runtime queries can use transaction pooling.
const database = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
if (database.hostname.endsWith('.pooler.supabase.com') && database.port === '6543') {
  database.port = '5432';
  database.searchParams.delete('pgbouncer');
}
const result = spawnSync(process.execPath, [
  require.resolve('prisma/build/index.js'),
  'migrate', 'deploy', '--schema', path.resolve(__dirname, '../prisma/schema.prisma'),
], {
  env: { ...process.env, DATABASE_URL: database.toString() },
  stdio: 'inherit',
  timeout: 120000,
});
if (result.error) console.error('Migration command could not finish:', result.error.code);
process.exit(result.status ?? 1);
