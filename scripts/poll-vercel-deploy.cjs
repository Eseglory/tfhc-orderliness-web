const fs = require('fs');
const path = require('path');

for (const envFile of [path.resolve(__dirname, '../.env')]) {
  if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const t = l.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const idx = t.indexOf('=');
        const k = t.slice(0, idx).trim();
        let v = t.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const token = process.env.VERCEL_TOKEN;
const deployId = process.argv[2] || 'dpl_kir5Wjt8Jj7rKLkPSnX7pj9oYUdC';
const teamId = process.env.VERCEL_ORG_ID || 'team_Mf5t14RhxNCW6ED6ryqGTMUY';

async function poll() {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deployId}?teamId=${teamId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await res.json();
    const state = d.readyState || d.status;
    console.log(`[${new Date().toISOString()}] Vercel State: ${state}`);
    if (state === 'READY') {
      console.log(`✅ Vercel Deployment is READY! URL: https://${d.url}`);
      process.exit(0);
    }
    if (state === 'ERROR' || state === 'CANCELED') {
      console.error(`❌ Vercel Deployment failed: ${state}`, d.error);
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log('Timed out waiting for Vercel');
  process.exit(2);
}

poll().catch(e => {
  console.error(e);
  process.exit(1);
});
