const https = require('node:https');
const { performance } = require('node:perf_hooks');

const endpoints = [
  { name: 'Health Check (GET /health)', url: 'https://tfhc.eglobalicthub.com/health', method: 'GET' },
  { name: 'Socket.IO Polling Handshake', url: 'https://tfhc.eglobalicthub.com/socket.io/?EIO=4&transport=polling', method: 'GET' },
  { name: 'Auth Login Validation (POST /auth/login)', url: 'https://tfhc.eglobalicthub.com/auth/login', method: 'POST', body: JSON.stringify({ email: 'benchmark@tfhc.org', password: 'invalid_password_benchmark' }), headers: { 'Content-Type': 'application/json' } },
  { name: 'Guarded Endpoint (GET /members)', url: 'https://tfhc.eglobalicthub.com/members', method: 'GET' },
  { name: 'Guarded Reports (GET /reports/dashboard)', url: 'https://tfhc.eglobalicthub.com/reports/dashboard', method: 'GET' },
];

async function measure(ep, runs = 5) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await new Promise((resolve) => {
      const u = new URL(ep.url);
      const req = https.request(u, { method: ep.method, headers: ep.headers || {} }, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          times.push(performance.now() - start);
          resolve();
        });
      });
      req.on('error', () => resolve());
      if (ep.body) req.write(ep.body);
      req.end();
    });
  }
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
  const min = Math.min(...times).toFixed(1);
  const max = Math.max(...times).toFixed(1);
  return { name: ep.name, avg, min, max, runs: times.length };
}

(async () => {
  console.log('=== TFHC PRODUCTION API BASELINE BENCHMARK ===');
  for (const ep of endpoints) {
    const res = await measure(ep);
    console.log(`${res.name.padEnd(45)} | Avg: ${res.avg.padStart(6)}ms | Min: ${res.min.padStart(6)}ms | Max: ${res.max.padStart(6)}ms`);
  }
})();
