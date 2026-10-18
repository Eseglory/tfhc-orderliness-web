/** Do not silently route an incompletely converted application to an empty SQLite DB. */
export function assertSupportedDatabaseMode(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.OPERATIONAL_DATABASE || 'postgresql';
  if (mode === 'postgresql') return;
  if (mode !== 'sqlite') throw new Error('UNKNOWN_OPERATIONAL_DATABASE');
  if (!env.SQLITE_DATABASE_PATH) throw new Error('SQLITE_PRIMARY_NOT_READY: an explicitly bootstrapped database path is required.');
  if (env.NODE_ENV === 'production' && (!env.SQLITE_ACTIVATION_MANIFEST || env.SQLITE_DURABILITY !== 'postgres-journal'))
    throw new Error('SQLITE_PRODUCTION_DURABILITY_NOT_VERIFIED');
}
