/** Build server-only connection settings without logging connection strings. */
export function databaseConnectionUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.DATABASE_URL;
  if (!raw) {
    if (env.NODE_ENV === 'test') throw new Error('TEST_DATABASE_NOT_CONFIGURED');
    return undefined;
  }
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('INVALID_DATABASE_PROTOCOL');
  if (env.NODE_ENV === 'test') {
    // Check before constructing a Prisma client, not only during Nest startup:
    // direct service calls can connect without running lifecycle hooks.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
        !['/tfhc_e2e', '/tfhc_orderliness_db'].includes(parsed.pathname) ||
        parsed.searchParams.has('host')) {
      throw new Error('TEST_DATABASE_MUST_BE_ISOLATED_LOCAL_DATABASE');
    }
  }
  // Keep the existing pool small on free hosting; explicit settings win.
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '3');
  return parsed.toString();
}
