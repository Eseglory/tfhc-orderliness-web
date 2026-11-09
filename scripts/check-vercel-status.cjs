const fs = require('fs');
const path = require('path');

for (const envFile of [path.resolve(__dirname, '../.env')]) {
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID || 'team_Mf5t14RhxNCW6ED6ryqGTMUY';

async function check() {
  const res = await fetch('https://api.vercel.com/v13/deployments/dpl_8u3wiPE7FVyDZUftX6EA9D5p91Ed?teamId=' + teamId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const d = await res.json();
  console.log('DEPLOYMENT READY_STATE:', d.readyState || d.status);
  console.log('URL:', d.url);
}

check().catch(console.error);

