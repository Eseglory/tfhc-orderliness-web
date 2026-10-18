// Read-only production probes. Never prints a token, user identity or response body.
const { DatabaseSync } = require('node:sqlite');
const jwt = require('jsonwebtoken');
let stage = 'initialize';
async function main() {
  if (process.env.NODE_ENV !== 'production' || process.env.SQLITE_DURABILITY !== 'postgres-journal')
    throw Error('PRODUCTION_RECOVERY_REQUIRED');
  const db = new DatabaseSync('/var/data/operational.db', { readOnly: true });
  let user;
  try { user = db.prepare('SELECT id,email,role FROM "users" WHERE role=\'ADMIN\' AND "isActive"=1 LIMIT 1').get(); }
  finally { db.close(); }
  if (!user) throw Error('ACTIVE_ADMIN_REQUIRED_FOR_AUTH_PROBE');
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const results = [];
  for (const base of ['http://127.0.0.1:4000', 'https://staging.utilityhub.ng/tfhc', 'https://tfhc-orderliness-api.onrender.com']) {
    stage = new URL(base).host + ':authentication';
    const request = (path, authenticated = false) => fetch(base + path, {
      headers: authenticated ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20000),
    });
    const anonymous = await request('/auth/me');
    if (anonymous.status !== 401) throw Error('ANONYMOUS_ACCESS_NOT_REJECTED');
    const start = performance.now();
    const identity = await request('/auth/me', true);
    if (identity.status !== 200) throw Error('AUTHENTICATED_READ_FAILED');
    const elapsed = Math.round(performance.now() - start);
    stage = new URL(base).host + ':sync';
    const state = await request('/health/database-sync/details', true);
    if (!state.ok) throw Error('SYNC_STATUS_FAILED');
    const status = await state.json();
    if (!status.backlog || !status.schedule) throw Error('SYNC_DETAILS_MISSING');
    if (status.operationalDatabase !== 'sqlite' || status.recoveryProtection !== 'postgres-journal' ||
        status.backlog.unprotected !== 0 || status.backlog.conflicts !== 0 || !status.schedule.enabled)
      throw Error('RECOVERY_OR_SYNC_NOT_HEALTHY');
    stage = new URL(base).host + ':polling';
    const polling = await request('/socket.io/?EIO=4&transport=polling');
    if (!polling.ok || !(await polling.text()).startsWith('0{')) throw Error('CHAT_TRANSPORT_FAILED');
    results.push({ endpoint: new URL(base).host, authenticatedReadMs: elapsed,
      anonymousDenied: true, authenticatedRead: true, chatPolling: true,
      pending: status.backlog.pending, unprotected: status.backlog.unprotected,
      conflicts: status.backlog.conflicts, schedule: status.schedule.schedule, timeZone: status.schedule.timeZone });
  }
  console.log(JSON.stringify({ productionReadiness: results }));
}
main().catch(e => { console.error(JSON.stringify({ stage, code: /^[A-Z_]+$/.test(e.message) ? e.message : 'PRODUCTION_READINESS_FAILED', type: e.name })); process.exitCode = 1; });
