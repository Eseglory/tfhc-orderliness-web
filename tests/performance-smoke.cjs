// Local smoke workload; this is not a production capacity benchmark.
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { performance } = require('node:perf_hooks');
const api = process.env.TEST_API_URL || 'http://127.0.0.1:4101';
const database = process.env.TEST_DATABASE_URL;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api) || !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database || '')) {
  throw new Error('Use only a local test API and isolated tfhc_e2e database');
}
async function main() {
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin-browser@example.test' } });
    const member = await db.user.findUniqueOrThrow({ where: { email: 'member-browser@example.test' } });
    console.log(JSON.stringify({ members: await db.member.count(), attendanceRecords: await db.attendanceRecord.count() }));
    for (const [path, user] of [['/reports/dashboard', admin], ['/scoring/leaderboard', member], ['/scoring/my-performance', member]]) {
      const token = jwt.sign({ sub: user.id }, 'e2e-local-only-secret', { expiresIn: '5m' });
      const durations = [];
      let next = 0;
      await Promise.all(Array.from({ length: 20 }, async () => {
        while (next++ < 100) {
          const start = performance.now();
          const response = await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
          await response.arrayBuffer();
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
          durations.push(performance.now() - start);
        }
      }));
      durations.sort((a, b) => a - b);
      console.log(JSON.stringify({ path, requests: durations.length, concurrency: 20, p50Ms: Math.round(durations[49]), p95Ms: Math.round(durations[94]), maxMs: Math.round(durations[99]) }));
    }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
