// Run inside the synthetic staging container. Never prints a token or response body.
const jwt = require('jsonwebtoken');
async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.DATABASE_URL || process.env.SQLITE_DURABILITY !== 'local')
    throw Error('ISOLATED_STAGING_REQUIRED');
  const base = 'http://127.0.0.1:4000';
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw Error('HEALTH_FAILED');
  const anonymous = await fetch(base + '/auth/me', { signal: AbortSignal.timeout(5000) });
  if (anonymous.status !== 401) throw Error('AUTHORIZATION_GUARD_FAILED');
  const token = jwt.sign({ sub: 'tfhc-storage-rehearsal-user', email: 'rehearsal@example.test', role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const elapsed = [];
  for (let batch = 0; batch < 4; batch++) {
    await Promise.all(Array.from({ length: 5 }, async () => {
      const start = performance.now();
      const response = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error('AUTHENTICATED_READ_FAILED');
      if ((await response.text()).includes('not-a-valid-login-hash')) throw Error('SECRET_REDACTION_FAILED');
      elapsed.push(performance.now() - start);
    }));
  }
  elapsed.sort((a, b) => a - b);
  console.log(JSON.stringify({ health: 'passed', anonymousDenied: true, authenticatedReads: elapsed.length,
    concurrency: 5, p50Ms: Math.round(elapsed[9]), p95Ms: Math.round(elapsed[18]),
    scope: 'synthetic in-container smoke, not production load or internet latency' }));
}
main().catch(e => { console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'STAGING_SMOKE_FAILED'); process.exitCode = 1; });
