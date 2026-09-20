const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (!process.env.DATABASE_URL && !process.env.MIGRATION_DATABASE_URL) {
  console.log('No database URL configured for migration deployment.');
  process.exit(1);
}

try {
  let dbUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  try {
    const database = new URL(dbUrl);
    if (database.hostname.endsWith('.pooler.supabase.com') && database.port === '6543') {
      database.port = '5432';
      database.searchParams.delete('pgbouncer');
      dbUrl = database.toString();
    }
  } catch {}

  let prismaCli;
  try {
    prismaCli = require.resolve('prisma/build/index.js');
  } catch {
    prismaCli = path.resolve(__dirname, '../../../node_modules/prisma/build/index.js');
  }

  const result = spawnSync(process.execPath, [
    prismaCli,
    'migrate', 'deploy', '--schema', path.resolve(__dirname, '../prisma/schema.prisma'),
  ], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
    timeout: 120000,
  });

  if (result.error) console.error('Migration command failed:', result.error.message);
  process.exit(result.error ? 1 : (result.status ?? 1));
} catch (err) {
  console.error('Migration step failed:', err.message);
  process.exit(1);
}
